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


def _best_body(email_dict: dict, max_chars: int = 4000) -> str:
    """
    Return the best available body text for the LLM.
    Uses plain text when it's substantial; falls back to stripped HTML
    (e.g. Polycab-style emails where line items live in an HTML table).
    """
    plain = (email_dict.get("body_plain") or "").strip()
    html  = (email_dict.get("body_html")  or "").strip()

    if len(plain) >= 200 or not html:
        return plain[:max_chars]

    stripped = _strip_html(html)
    return stripped[:max_chars]


# ── Classifier prompt ─────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are a strict email classifier for Fidus India, an industrial automation parts SUPPLIER.

TASK: Decide if this email is a genuine inbound RFQ — a real customer asking Fidus India to quote a price for parts they want to purchase.

Respond with ONLY valid JSON: {"is_rfq": true} or {"is_rfq": false}

DEFAULT ANSWER IS FALSE. Return true ONLY when you are fully confident ALL three conditions are met:
  1. The sender is clearly a BUYER or end-customer (a company or person who needs parts)
  2. They are explicitly asking Fidus India to send them a price or quotation
  3. The email contains specific items they want to buy (part numbers, model numbers, or product descriptions with quantity)

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

def is_rfq_email(email_dict: dict) -> bool:
    """
    Layer 2: Ask gpt-4o-mini if this is an RFQ.
    Uses HTML fallback so emails with body in HTML tables are classified correctly.
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
            max_tokens=20,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return bool(result.get("is_rfq", False))

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
