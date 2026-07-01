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
_SEP_RE = re.compile(r"[\s\-_./]+")

# Patterns that mark the start of a quoted chain in a vendor reply.
_THREAD_SPLIT_PATTERNS = [
    r"(?im)^[-\s]*(forwarded\s+message|begin\s+forwarded\s+message|original\s+message)[-\s]*$",
    r"(?im)^from:\s*.+$",
    r"(?im)^on\s+.+wrote:\s*$",
]


def _plain_text(body_plain: str | None, body_html: str | None) -> str:
    if body_plain and body_plain.strip():
        return body_plain.strip()
    if body_html:
        text = _TAG_RE.sub(" ", body_html)
        return _WS_RE.sub(" ", text).strip()
    return ""


def _latest_reply_text(text: str) -> str:
    """
    Return only the newest part of a reply thread (above the quoted chain).
    If no split marker is found the full text is returned unchanged.
    """
    cut_at = len(text)
    for pattern in _THREAD_SPLIT_PATTERNS:
        m = re.search(pattern, text)
        if m:
            cut_at = min(cut_at, m.start())
    return text[:cut_at].strip()


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
- Never invent a part number that isn't in the "parts we asked about" list.
- When matching the vendor's quoted part number to our list, treat hyphens, spaces, dots, slashes, and underscores as insignificant. For example 'FRN-075E2S-2J' should match 'FRN075E2S2J'. Always return the part number exactly as it appears in our "parts we asked about" list, not as the vendor wrote it."""

EXTRACTOR_USER = """Parts we asked about: {part_numbers}

Vendor's reply:
{body}"""


def _normalize_pn(pn: str) -> str:
    """Strip separators and lowercase for fuzzy part-number comparison."""
    return _SEP_RE.sub("", pn or "").lower()


def _fuzzy_match_parts(quotes: list[dict], known_parts: list[str]) -> list[dict]:
    """
    Replace GPT-returned part numbers with their canonical form from
    known_parts when the only difference is separators / case.
    """
    if not known_parts:
        return quotes
    norm_map = {_normalize_pn(p): p for p in known_parts}
    result = []
    for q in quotes:
        pn = q.get("part_number") or ""
        canonical = norm_map.get(_normalize_pn(pn))
        if canonical and canonical != pn:
            logger.debug("fuzzy_match: '%s' → '%s'", pn, canonical)
            q = {**q, "part_number": canonical}
        result.append(q)
    return result


def extract_quote(body_plain: str | None, body_html: str | None, part_numbers: list[str]) -> list[dict]:
    """
    Returns a list of quote line-item dicts (possibly empty if the vendor
    didn't actually quote a price in this reply).
    """
    full_body = _plain_text(body_plain, body_html)
    if not full_body:
        return []

    # Prefer the latest reply text (vendor's new content, above the quoted chain)
    # so GPT isn't confused by price tables from the original RFQ or prior threads.
    # Fall back to the full body when the latest text is very short — vendor wrote
    # something like "please see attached" and the real content is elsewhere.
    latest = _latest_reply_text(full_body)
    body = (latest if len(latest) >= 100 else full_body)[:15000]

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
        if not isinstance(quotes, list):
            return []
        return _fuzzy_match_parts(quotes, part_numbers)
    except Exception as exc:
        logger.error("Quote extraction error: %s", exc)
        return []
