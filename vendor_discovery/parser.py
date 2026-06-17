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

_USER = """You are verifying whether this supplier page represents a genuine AUTHORIZED DEALER or AUTHORIZED DISTRIBUTOR for the brand "{brand}".

AUTHORIZED means: the brand has officially appointed them as a dealer/distributor.
Evidence to look for: "authorized dealer", "authorized distributor", "official dealer", "channel partner", brand authorization certificate, official dealership badge, or the brand's own dealer-locator page listing them.

NOT authorized: general resellers, trading companies selling many brands without authorization, marketplaces, aggregator sites, or pages where authorization is vague or absent.

Extract the following from the page and return ONLY this JSON (use null for missing fields):
{{
  "vendor_name": "exact registered company name",
  "email": "primary sales or contact email address",
  "phone": "phone number — prefer 10-digit Indian mobile (starts with 6, 7, 8, or 9)",
  "city": "city where this dealer is located",
  "country": "country",
  "is_authorized_dealer": true or false,
  "authorization_evidence": "copy the exact phrase on the page that confirms or denies authorization"
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
