"""
llm_extractor.py
----------------
Layer 2 + Extraction: Two OpenAI calls per email.

Call A — cheap classifier (gpt-4o-mini):
  "Is this an RFQ?" → yes/no  (~0.001 USD per email)

Call B — structured extractor (gpt-4o), only on confirmed RFQs:
  Extracts location, username, brand, quantity, part_number
  Returns a list of dicts (one per line item).
  (~0.005-0.02 USD per email depending on length)

PDF / attachment text is passed in as part of the context.
"""

import json
import re
from openai import OpenAI

from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

client = OpenAI(api_key=settings.OPENAI_API_KEY)

FORWARDED_MARKER_RE = re.compile(
    r"(?im)^[-\s]*("
    r"forwarded\s+message|"
    r"begin\s+forwarded\s+message|"
    r"original\s+message"
    r")[-\s]*$"
)

FORWARDED_HEADER_RE = re.compile(
    r"(?is)\bfrom:\s*.+?\b(?:sent|date):\s*.+?\bto:\s*.+?\b(?:cc:\s*.+?)?\bsubject:\s*",
)


def _forwarded_section_only(text: str) -> str:
    """
    For forwarded RFQs, ignore the outer forwarding message and keep only the
    buyer's forwarded content.
    """
    if not text:
        return ""

    match = FORWARDED_MARKER_RE.search(text) or FORWARDED_HEADER_RE.search(text)
    if not match:
        return text.strip()

    return text[match.start():].strip()


def _new_reply_content(text: str) -> str:
    """
    Return only the new top-of-reply content — the text BEFORE the quoted chain.
    Used by the classifier so it judges the CURRENT message, not old quoted history.
    """
    if not text:
        return ""
    markers = [
        r"(?im)^[-\s]*(forwarded\s+message|begin\s+forwarded\s+message|original\s+message)[-\s]*$",
        r"(?im)^from:\s*.+$",
        r"(?im)^on\s+.+\s+wrote:\s*$",
    ]
    cut_at = len(text)
    for pattern in markers:
        m = re.search(pattern, text)
        if m:
            cut_at = min(cut_at, m.start())
    return text[:cut_at].strip()


# ── HTML → plain text ─────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    """
    Convert an HTML email body to readable plain text.
    Preserves table row/cell structure so LLMs can read tabular RFQ data.
    """
    # Block-level tags → newlines
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</tr\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<tr[^>]*>', '', text, flags=re.IGNORECASE)
    # Cell boundaries → tabs so columns stay readable
    text = re.sub(r'</t[dh]\s*>', '\t', text, flags=re.IGNORECASE)
    text = re.sub(r'<t[dh][^>]*>', '', text, flags=re.IGNORECASE)
    # Strip all remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # HTML entities
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&#\d+;', '', text)
    # Collapse excess whitespace
    text = re.sub(r'\t{2,}', '\t', text)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _best_body(email_dict: dict, max_chars: int = 4000) -> str:
    """
    Return the best available body text for the LLM.
    Uses plain text when it's substantial; falls back to stripped HTML
    (e.g. Polycab-style emails where line items live in an HTML table).
    """
    plain = (email_dict.get("body_plain") or "").strip()
    html  = (email_dict.get("body_html")  or "").strip()

    if len(plain) >= 200 or not html:
        return _forwarded_section_only(plain)[:max_chars]

    stripped = _strip_html(html)
    return _forwarded_section_only(stripped)[:max_chars]


def _extract_forwarded_from(body: str) -> tuple[str | None, str | None]:
    """
    Pull buyer name/email from forwarded blocks like:
    From: Prateek Tiku <prateek.tiku@heromotocorp.com>
    """
    if not body:
        return None, None

    from_match = re.search(r"(?im)^\s*From:\s*(.+?)\s*$", body)
    if not from_match:
        return None, None

    from_line = from_match.group(1).strip()
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", from_line, re.IGNORECASE)
    if not email_match:
        return None, None

    email = email_match.group(0).strip()
    name = (
        from_line[:email_match.start()]
        .replace("<", "")
        .replace(">", "")
        .strip()
        .strip('"')
        or None
    )
    return name, email


def _is_internal_email(email: str | None) -> bool:
    if not email:
        return False

    normalized = email.strip().lower()
    return (
        bool(re.fullmatch(r"fidusindia\d*@gmail\.com", normalized))
        or normalized.endswith("@fidusindia.com")
    )


def _extract_header_sender(sender: str | None) -> tuple[str | None, str | None]:
    if not sender:
        return None, None

    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", sender, re.IGNORECASE)
    email = email_match.group(0).strip() if email_match else None
    name = sender
    if email_match:
        name = sender[:email_match.start()]
    name = name.replace("<", "").replace(">", "").strip().strip('"') or None
    return name, email


def get_buyer_identity(email_dict: dict) -> tuple[str | None, str | None]:
    """
    Return the real buyer person/email.
    Forwarded From wins. For direct client mail, use Gmail From unless internal.
    """
    body = _best_body(email_dict, max_chars=8000)
    name, email = _extract_forwarded_from(body)
    if email and not _is_internal_email(email):
        return name, email

    name, email = _extract_header_sender(email_dict.get("sender"))
    if email and not _is_internal_email(email):
        return name, email

    return None, None


def _apply_forwarded_sender(items: list[dict], body: str) -> list[dict]:
    name, email = _extract_forwarded_from(body)
    if not email:
        return items

    enriched = []
    for item in items:
        if not isinstance(item, dict):
            enriched.append(item)
            continue
        enriched.append({
            **item,
            "username": name or item.get("username"),
            "sender_email": email,
        })
    return enriched


RFQ_STRONG_PATTERNS = [
    r"please\s+quote",
    r"kindly\s+quote",
    r"request\s+for\s+quotation",
    r"request\s+for\s+quote",
    r"please\s+provide\s+(your\s+)?(quote|quotation|rates|price)",
    r"kindly\s+provide\s+(your\s+)?(quote|quotation|rates|price)",
    r"\bpart\s*(no|number|#)\b",
    r"\bmodel\s*(no|number)\b",
    r"\bqty\b",
    r"\bquantity\b",
]

_STRONG_RFQ_RE = re.compile("|".join(RFQ_STRONG_PATTERNS), re.IGNORECASE)


# ── Classifier prompt ─────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are a strict email classifier for Fidus India, an industrial automation parts SUPPLIER.

TASK: Decide if this email is a genuine inbound RFQ — a real customer asking Fidus India to quote a price for parts they want to purchase.

Respond with ONLY valid JSON: {"is_rfq": true} or {"is_rfq": false}

DEFAULT ANSWER IS FALSE, but be careful not to over-reject valid RFQs.
Return true when the email is plausibly a buyer-side RFQ or a forwarded RFQ from a shared or sales mailbox.
Be tolerant of:
  - forwarded subjects like "Fwd: RFQ", "Re: RFQ", "FW: quotation request"
  - senders that look like sales/admin/shared inboxes if the body clearly asks for pricing
  - short emails that contain item numbers, quantities, or a clear request for quotation

Return true if the email asks Fidus India to quote, provide pricing, share rates, or send a quotation,
even when the sender name is not obviously a buyer.

Return false only when you are confident the email is NOT an RFQ.
Do not reject a message just because the sender address contains words like "sales" or "info"
if the content is a real RFQ forwarded from a buyer.

IMPORTANT — for reply/forward chains:
  You will receive only the LATEST reply text (the new message at the top), not the full quoted history.
  Base your decision entirely on this new content. Do not assume old quoted RFQ context makes it true.

Return FALSE for ANY of the following — even if the email mentions part numbers or brands:
  SELLER OUTREACH (most common false positive):
    - A vendor, supplier, trader, or distributor writing to SELL their products to us
    - Language like: "our main range", "we can supply", "we stock", "our products include",
      "if interested contact us", "we can provide competitive price", "pls send us your enquiry"
    - Chinese or overseas suppliers promoting their catalog or spare parts stock
    - Anyone saying they "represent" a brand and want us to buy from them

  MARKETING / NEWSLETTERS:
    - Promotional emails, product announcements, price lists being shared
    - Emails with "unsubscribe", "view in browser", or bulk-email formatting
    - Event invitations, webinars, trade shows, company news

  LOGISTICS / DELIVERY / POST-ORDER OPERATIONS:
    - Emails about dispatch status, confirmed dispatch dates, or shipment tracking
    - Emails sharing transport IDs, transporter IDs, e-way bill numbers, or docket numbers
    - Emails about pickup arrangements, courier coordination, or transportation logistics
    - Any email whose purpose is order fulfillment or delivery for an already-placed order
    - Examples: "please share transport ID for e-way bill", "docket no is XXXX", "arrange pickup",
      "provide confirmed dispatch date", "case number for pickup request"

  UNCLEAR OR GENERIC:
    - Emails that mention parts but do not clearly ask Fidus India for a quote
    - Emails where it is ambiguous who is the buyer and who is the seller
    - General enquiries with no specific part or quantity mentioned

WHEN IN DOUBT → return {"is_rfq": false}

A genuine RFQ looks like: a customer sends a list of part numbers and quantities
and asks "please quote" or "kindly provide rates" or "request for quotation".
Everything else is false."""

CLASSIFIER_USER = """Email:
From: {sender}
Subject: {subject}

Body:
{body}"""


# ── Extractor prompt ──────────────────────────────────────────────────────────

EXTRACTOR_SYSTEM = """You are a data extraction assistant for an industrial automation parts supplier.
Extract EVERY line item from the RFQ email and its attachments.

Return ONLY a JSON object in this exact format:
{"items": [
  {
    "client_name": "Company name of the buyer/client",
    "username": "Person name of the buyer/requester",
    "sender_email": "Email address of the buyer/requester",
    "location": "City, state, country, or address of the buyer/client",
    "brand": "Manufacturer brand name",
    "part_number": "Exact part or model number",
    "quantity": 1,
    "uom": "Unit of measurement such as PCS, NOS, SET, LTR, KG",
    "notes": "Any specs, urgency, delivery terms, or additional info"
  }
]}

Rules:
- Extract ALL line items — never stop at the first one
- If there are 10 items in the email/attachment, return 10 objects in the items array
- client_name, username, sender_email, and location are the same for every item from the same email
- Prefer the forwarded buyer header for username and sender_email when present. Example: "From: Prateek Tiku <prateek.tiku@heromotocorp.com>" means username="Prateek Tiku" and sender_email="prateek.tiku@heromotocorp.com".
- Prefer the email signature/footer for client_name and location. In signatures, the person name is usually above the designation, the company name is often below the designation, and address/phone details are below the company.
- Do not use the forwarding/internal mailbox as the client when a forwarded buyer block exists.
- client_name means buyer company name, not the person name. Example: "Hero MotoCorp Ltd."
- username means the buyer/requester person name. Example: "Prateek Tiku"
- If client_name is not explicitly visible, infer it from the buyer email domain only when obvious. Example: prateek.tiku@heromotocorp.com means client_name can be "Hero MotoCorp".
- Never copy username/person name into client_name. If company is unknown, use null for client_name.
- For items without a brand, use null
- part_number must contain only the exact part number, model number, catalog number, or order code
- Do not put product descriptions, voltage, ratings, material, delivery terms, or general specs in part_number
- If the line has a part number followed by a description, keep only the part number/code in part_number and move the description/specs to notes
- If there is no exact part/model/catalog/order number, use null for part_number and put the item description in notes
- If quantity is not stated, use null
- If an email or attachment table has a UOM column, always extract the value from that column for the same row.
- If Qty and UOM are separate columns, map both values to the same line item.
- Extract uom when present and normalize it to uppercase.
- Valid UOM examples include PC, PCS, NOS, EA, SET, PAIR, DOZ, BOX, PACK, KIT, LOT, MG, G, KG, MT, TON, LB, OZ, MM, CM, M, KM, IN, FT, YD, SQ MM, SQ CM, SQ M, SQ FT, SQ YD, ML, LTR, KL, GAL, CBM, CFT, ROLL, REEL, SHEET, PLATE, COIL, BAG, DRUM, BARREL, TUBE, BUNDLE, CARTON, PALLET, CONTAINER, PKG, CTN, PLT, CRATE, CASE, FCL, LCL, TRAY, STRIP.
- Normalize "PC", "Nos", "No.", and "Numbers" to "PCS" or "NOS" as appropriate; "Ltr", "Liter", and "Litre" to "LTR"; "Pieces" to "PCS".
- If any field cannot be determined, use null"""

EXTRACTOR_USER = """Extract ALL RFQ line items from this email.

From: {sender}
Subject: {subject}
Date: {date}

Email body:
{body}

{attachment_section}"""


# ── Public API ────────────────────────────────────────────────────────────────

def is_rfq_email(email_dict: dict) -> bool:
    """
    Layer 2: Ask gpt-4o-mini if this is an RFQ.
    For reply/fwd chains, passes only the new top-of-reply content so the LLM
    judges the current message and not quoted history (which may contain old RFQs).
    """
    subject = (email_dict.get("subject") or "").strip().lower()
    is_chain = subject.startswith(("re:", "fwd:", "fw:"))

    if is_chain:
        plain = (email_dict.get("body_plain") or "").strip()
        html  = (email_dict.get("body_html")  or "").strip()
        raw   = plain if len(plain) >= 100 else (_strip_html(html) if html else plain)
        body_preview = _new_reply_content(raw)[:1500]
        if not body_preview:
            body_preview = _best_body(email_dict, max_chars=1500)
    else:
        body_preview = _best_body(email_dict, max_chars=1500)

    prompt = CLASSIFIER_USER.format(
        sender  = email_dict.get("sender",  ""),
        subject = email_dict.get("subject", ""),
        body    = body_preview,
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": CLASSIFIER_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0,
            max_tokens=20,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        decision = bool(result.get("is_rfq", False))

        if decision:
            logger.debug(
                "LLM classifier KEEP | sender=%s subject=%s",
                email_dict.get("sender", ""),
                email_dict.get("subject", ""),
            )
            return True

        if _STRONG_RFQ_RE.search(body_preview):
            logger.debug(
                "LLM classifier OVERRIDE KEEP (strong RFQ signals) | sender=%s subject=%s",
                email_dict.get("sender", ""),
                email_dict.get("subject", ""),
            )
            return True

        logger.debug(
            "LLM classifier DROP | sender=%s subject=%s response=%s",
            email_dict.get("sender", ""),
            email_dict.get("subject", ""),
            result,
        )
        return False

    except Exception as exc:
        logger.error("LLM classifier error: %s", exc)
        return False


def extract_rfq_data(email_dict: dict, attachment_text: str = "") -> list[dict]:
    """
    Layer 3: Extract structured fields from a confirmed RFQ.
    Returns a list of line-item dicts (one per part requested).
    Handles HTML-only bodies and multi-item attachments.
    """
    body = _best_body(email_dict, max_chars=4000)

    attachment_section = ""
    if attachment_text.strip():
        attachment_section = f"Attachment text:\n{attachment_text[:4000]}"

    prompt = EXTRACTOR_USER.format(
        sender             = email_dict.get("sender",  ""),
        subject            = email_dict.get("subject", ""),
        date               = email_dict.get("date_str", ""),
        body               = body,
        attachment_section = attachment_section,
    )

    raw = ""
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": EXTRACTOR_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content

        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # Expected path: {"items": [...]}
            for key in ("items", "line_items", "results", "data"):
                if isinstance(parsed.get(key), list):
                    return _apply_forwarded_sender(parsed[key], body)
            # Flat object — single item with no wrapper
            return _apply_forwarded_sender([parsed], body)
        if isinstance(parsed, list):
            return _apply_forwarded_sender(parsed, body)
        return []

    except json.JSONDecodeError as exc:
        logger.error("LLM extractor JSON parse error: %s\nRaw: %s", exc, raw[:200])
        return []
    except Exception as exc:
        logger.error("LLM extractor error: %s", exc)
        return []
