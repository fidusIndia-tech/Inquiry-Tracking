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

_SYSTEM = "You are a data extractor. Return only valid JSON, no extra text."

_USER = """Extract vendor contact info from this industrial parts supplier webpage.

Return ONLY this JSON (use null for missing fields):
{{
  "vendor_name": "company name",
  "email": "primary sales or contact email",
  "phone": "primary phone number",
  "city": "city name",
  "country": "country name",
  "is_authorized_dealer": true or false
}}

Page URL: {url}
Page title: {title}
Page text:
{text}"""


def parse_vendor_with_llm(url: str, title: str, text: str) -> dict:
    """
    Use GPT-4o-mini to extract structured vendor data from page text.
    Returns {} on failure or if text is empty.
    """
    if not text or len(text) < 50:
        return {}
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": _USER.format(
                    url=url, title=title, text=text[:3000]
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
