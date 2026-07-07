"""
vendor_discovery/parser.py
---------------------------
GPT-4o-mini fallback: called only when regex extraction finds no email/phone.
Parses vendor name, contact details, location, and dealer status from page text.
"""

import json
from openai import OpenAI
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
_client = OpenAI(api_key=get_settings().OPENAI_API_KEY)

_SYSTEM = (
    "You are a senior procurement specialist verifying industrial supplier credentials. "
    "Return only valid JSON, no extra text."
)

_USER = """You are a strict procurement auditor verifying whether this page represents a genuine AUTHORIZED DEALER or AUTHORIZED DISTRIBUTOR for the brand "{brand}".

SET is_authorized_dealer: true ONLY when ALL of the following are met:
1. The page belongs to a COMMERCIAL BUSINESS (a company that sells industrial products)
2. The page explicitly mentions being authorized/appointed by the brand "{brand}" using phrases like:
   - "authorized dealer", "authorized distributor", "authorised dealer", "authorised distributor"
   - "official dealer", "official distributor", "channel partner", "certified partner"
   - "appointed by {brand}", "{brand} authorized", "exclusive dealer for {brand}"
   - OR the page is the brand's own official dealer-locator listing this company

SET is_authorized_dealer: false — NO EXCEPTIONS — for any of these:
- Educational institutions: IIT, NIT, university, college, school, polytechnic, institute of technology
- Government bodies: government of [state/country], ministry, municipal corporation, public board, PSU, WBLDC, NIC, agriculture board
- Insurance companies: LIC, HDFC Life, SBI Life, or any insurance entity
- Agricultural / farming companies: crop equipment, reaper, harvester, agro companies
- Generic trading companies listing many unrelated brands with no explicit authorization
- Marketplace or aggregator pages
- Pages where authorization for "{brand}" is absent, vague, or implied rather than stated

Extract and return ONLY this JSON (use null for missing fields):
{{
  "vendor_name": "exact registered company name",
  "email": "primary sales or contact email address",
  "phone": "phone number — prefer 10-digit Indian mobile (starts with 6, 7, 8, or 9)",
  "city": "city where this dealer is located",
  "country": "country",
  "is_authorized_dealer": true or false,
  "authorization_evidence": "copy the exact phrase that confirms authorization, or write 'none found' if absent"
}}

Brand: {brand}
Page URL: {url}
Page title: {title}
Page text:
{text}"""


def parse_vendor_with_llm(url: str, title: str, text: str, brand: str = "") -> dict:
    """
    Use GPT-4o-mini to extract structured vendor data from page text.
    Returns {} on failure or if text is empty.
    """
    if not text or len(text) < 50:
        return {}
    try:
        # Pass start + footer (emails usually live in footer, not header)
        if len(text) > 4000:
            page_excerpt = text[:2000] + "\n...\n" + text[-2000:]
        else:
            page_excerpt = text
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": _USER.format(
                    brand=brand, url=url, title=title, text=page_excerpt
                )},
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error("LLM vendor parse error for %s: %s", url, exc)
        return {}
