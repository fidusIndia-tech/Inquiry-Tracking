"""
vendor_reply/extractor.py
--------------------------
Quote Extraction Agent. Reads a vendor's reply to our RFQ table and pulls
out price/lead-time/MOQ per part number.

Vendors are asked to reply by filling in our HTML table directly, but in
practice replies arrive as plain text, partially-filled HTML, or a vendor's
own reformatted table. GPT handles that format variance — the strict table
we send is just a strong anchor, not a guarantee.
"""

import json
import re

from openai import OpenAI

from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _plain_text(body_plain: str | None, body_html: str | None) -> str:
    if body_plain and body_plain.strip():
        return body_plain.strip()
    if body_html:
        text = _TAG_RE.sub(" ", body_html)
        return _WS_RE.sub(" ", text).strip()
    return ""


EXTRACTOR_SYSTEM = """You are a data-extraction assistant reading a vendor's reply to a Request For Quotation.

We sent the vendor a table listing part numbers we need priced, with columns for them to fill in:
Unit Price, Currency, Lead Time, and Remarks (and sometimes MOQ / availability).

Extract every part number the vendor actually quoted a price for. If the vendor only replied for some
of the parts we asked about, only return those. If the vendor gave one price/lead-time for the whole
order without breaking it down per part, apply that same price/lead-time to every part number we asked about.

Return ONLY valid JSON in this exact format:
{"quotes": [
  {
    "part_number": "exact part number",
    "unit_price": 123.45,
    "currency": "INR or USD or EUR etc, null if not stated",
    "moq": "minimum order quantity if stated, else null",
    "lead_time": "delivery/lead time as stated, e.g. '2-3 weeks', 'Ready Stock'",
    "availability": "stock status if stated, else null",
    "remarks": "any other relevant note from the vendor, else null"
  }
]}

Rules:
- unit_price must be a plain number (no currency symbols, no thousands separators). Use null if no price was given.
- If the vendor did not quote anything (e.g. asked a clarifying question, said out of stock with no price), return {"quotes": []}
- Never invent a part number that isn't in the "parts we asked about" list."""

EXTRACTOR_USER = """Parts we asked about: {part_numbers}

Vendor's reply:
{body}"""


def extract_quote(body_plain: str | None, body_html: str | None, part_numbers: list[str]) -> list[dict]:
    """
    Returns a list of quote line-item dicts (possibly empty if the vendor
    didn't actually quote a price in this reply).
    """
    body = _plain_text(body_plain, body_html)[:8000]
    if not body:
        return []

    prompt = EXTRACTOR_USER.format(
        part_numbers=", ".join(part_numbers) or "(not specified)",
        body=body,
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": EXTRACTOR_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response.choices[0].message.content)
        quotes = parsed.get("quotes", [])
        return quotes if isinstance(quotes, list) else []
    except Exception as exc:
        logger.error("Quote extraction error: %s", exc)
        return []
