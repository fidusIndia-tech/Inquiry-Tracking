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


def _best_body(email_dict: dict, max_chars: int = 8000) -> str:
    """
    Return the best available body text for the LLM.

    Key rule: if the HTML body carries significantly more content than the
    plain-text body, the RFQ line-item table lives only in the HTML (the plain
    text is just the intro paragraph).  In that case we MUST use the HTML-
    derived text — otherwise the LLM never sees any part numbers.

    Examples of the failure this prevents:
      - "Hello Sales, Could you please send us a commercial offer…" (220 chars)
        followed by a 13-item Schneider/ABB table that is HTML-only.
      - SAP/ERP purchase-requisition emails where only the header line is plain.
    """
    plain = (email_dict.get("body_plain") or "").strip()
    html  = (email_dict.get("body_html")  or "").strip()

    if not html:
        return plain[:max_chars]

    stripped = _strip_html(html)

    # If the HTML-derived text is substantially richer than plain text, the
    # item table lives in HTML — use it regardless of plain text length.
    if len(stripped) > len(plain) + 300:
        return stripped[:max_chars]

    # Plain text is rich enough (no hidden table).  Use the cleaner version.
    return plain[:max_chars]


# ── Classifier prompt ─────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are a strict email classifier for Fidus India, an industrial automation parts SUPPLIER.

TASK: Classify this email into exactly one of three types.

Respond with ONLY valid JSON — one of:
  {"type": "new_rfq",  "summary": "one sentence describing what the customer wants"}
  {"type": "reminder", "summary": "one sentence describing what they are following up on"}
  {"type": "not_rfq",  "summary": null}

TYPE DEFINITIONS:

"new_rfq" — A buyer is asking Fidus India to quote parts for the FIRST TIME.
  ALL THREE must be true:
  1. Sender is clearly a BUYER or end-customer (not a vendor selling to us)
  2. They are asking Fidus India for a price or quotation
  3. Email contains specific items to buy (part numbers, model numbers, or descriptions with quantity)

"reminder" — A follow-up or reminder on a PREVIOUSLY submitted inquiry. Signs include:
  - "please provide revised quotation", "please revert", "awaiting your response"
  - "kindly send quote", "follow up on our previous request", "delivery reminder"
  - "please confirm delivery", "as discussed", references to a prior RFQ/PO/inquiry number
  - The email is a reply (Re:) and the new content is only a follow-up, not new items
  These are NOT new RFQs — they are chasing an existing one.

"not_rfq" — Spam, marketing, seller outreach, newsletters, or unrelated emails:
  - Vendors writing to SELL their products to us
  - Promotional emails, product announcements, price lists, newsletters
  - Google system emails, event invitations, webinars
  - Any email where it is unclear who is buying and who is selling

WHEN IN DOUBT → return "not_rfq"

For "summary":
  - "new_rfq": e.g. "Customer requesting quote for 3 OMRON PLC items"
  - "reminder": e.g. "Client following up on Parker PVP pump quotation — please send revised quote"
  - "not_rfq": null"""

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
    "username": "Full name or company name of the sender",
    "location": "City, state or country of the sender",
    "brand": "Manufacturer brand name",
    "part_number": "Exact part or model number",
    "quantity": 1,
    "notes": "Any specs, urgency, delivery terms, or additional info"
  }
]}

Rules:
- Extract ALL line items — never stop at the first one
- If there are 10 items in the email/attachment, return 10 objects in the items array
- username and location are the same for every item from the same sender
- For items without a brand, use null
- For items without a part number, put the item description in part_number
- If quantity is not stated, use null
- If any field cannot be determined, use null"""

EXTRACTOR_USER = """Extract ALL RFQ line items from this email.

From: {sender}
Subject: {subject}
Date: {date}

Email body:
{body}

{attachment_section}"""


# ── Public API ────────────────────────────────────────────────────────────────

def classify_email(email_dict: dict) -> dict:
    """
    Layer 2: 3-way classifier using gpt-4o-mini.
    Returns {"type": "new_rfq"|"reminder"|"not_rfq", "summary": str|None}
    Falls back to {"type": "not_rfq", "summary": None} on any error.
    """
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
            max_tokens=100,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        email_type = result.get("type", "not_rfq")
        if email_type not in ("new_rfq", "reminder", "not_rfq"):
            email_type = "not_rfq"
        return {"type": email_type, "summary": result.get("summary")}

    except Exception as exc:
        logger.error("LLM classifier error: %s", exc)
        return {"type": "not_rfq", "summary": None}


def is_rfq_email(email_dict: dict) -> bool:
    """Backward-compatible wrapper — returns True only for new_rfq."""
    return classify_email(email_dict)["type"] == "new_rfq"


def extract_rfq_data(email_dict: dict, attachment_text: str = "") -> list[dict]:
    """
    Layer 3: Extract structured fields from a confirmed RFQ.
    Returns a list of line-item dicts (one per part requested).
    Handles HTML-only bodies and multi-item attachments.
    """
    body = _best_body(email_dict, max_chars=15000)

    attachment_section = ""
    if attachment_text.strip():
        attachment_section = f"Attachment text:\n{attachment_text[:12000]}"

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
            max_tokens=12000,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content

        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # Expected path: {"items": [...]}
            for key in ("items", "line_items", "results", "data"):
                if isinstance(parsed.get(key), list):
                    return parsed[key]
            # Flat object — single item with no wrapper
            return [parsed]
        if isinstance(parsed, list):
            return parsed
        return []

    except json.JSONDecodeError as exc:
        logger.error("LLM extractor JSON parse error: %s\nRaw: %s", exc, raw[:200])
        return []
    except Exception as exc:
        logger.error("LLM extractor error: %s", exc)
        return []
