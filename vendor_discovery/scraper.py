"""
vendor_discovery/scraper.py
----------------------------
Fetch a vendor webpage and extract contact details via regex.
No LLM cost — fast and free. Falls back gracefully on blocks/timeouts.
"""

import re
import urllib.request
import urllib.error
from logging_setup import get_logger

logger = get_logger(__name__)

_EMAIL_RE    = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Indian mobile: optional +91/0091/91 prefix, then 10-digit number starting with 6-9
_INDIAN_MOBILE_RE = re.compile(r"(?:(?:\+91|0091|91)[\s\-]?)?([6-9]\d{9})")
# Generic phone: digits + spaces/dashes/parens only (NO dots — eliminates prices/decimals)
_PHONE_RAW_RE = re.compile(r"(?<![.\d])(\+?[\d][\d\s\-()]{6,18}[\d])(?![.\d])")
_TAG_RE       = re.compile(r"<[^>]+>")
_WS_RE        = re.compile(r"\s+")

# Emails that are never real vendor contacts
_SKIP_EMAIL_WORDS = frozenset([
    "example", "domain", "noreply", "no-reply", "test", "sentry",
    "support@sentry", "user@", "email@", "info@example",
])

# Domains to never visit (marketplaces/socials — won't have direct contact pages)
_SKIP_VISIT_DOMAINS = frozenset([
    "google.com", "google.co.in", "youtube.com", "wikipedia.org",
    "linkedin.com", "facebook.com", "twitter.com", "x.com",
    "instagram.com", "pinterest.com", "reddit.com", "quora.com",
    "amazon.in", "amazon.com", "amazon.co.uk",
    "ebay.com", "ebay.in", "ebay.co.uk",
    "flipkart.com", "shopclues.com",
    "alibaba.com", "aliexpress.com",
    "scribd.com", "slideshare.net",
    "indiamart.com",       # blocks bots — snippets only, no page fetch
    "tradeindia.com",      # blocks bots — snippets only, no page fetch
    # Government and standards — not vendor contact pages
    "nhtsa.gov", "iec.ch", "iso.org", "ul.com", "osha.gov", "epa.gov",
    # Datasheet aggregators
    "alldatasheet.com", "datasheetcatalog.com", "octopart.com",
])


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else ""


def _clean_emails(raw: list[str]) -> list[str]:
    return [
        e for e in raw
        if not any(skip in e.lower() for skip in _SKIP_EMAIL_WORDS)
    ]


def fetch_vendor_page(url: str, timeout: int = 12) -> str:
    """
    Fetch URL and return stripped plain text (max 6000 chars).
    Returns '' on network failure, 403, timeout, or skipped domain.
    """
    if _domain(url) in _SKIP_VISIT_DOMAINS:
        return ""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return ""
            raw = resp.read(300_000).decode("utf-8", errors="ignore")
            text = _TAG_RE.sub(" ", raw)
            text = _WS_RE.sub(" ", text).strip()
            # Return up to 40 000 chars so footer contact info is included
            return text[:40000]
    except Exception as exc:
        logger.debug("Page fetch failed %s: %s", url, type(exc).__name__)
        return ""


def _extract_phones(text: str) -> list[str]:
    """
    Return phone numbers. Indian mobiles (10-digit, starting 6-9) are extracted
    first and given priority — they are the most reliable contact for Indian dealers.
    Falls back to generic international number pattern.
    """
    seen: set[str] = set()
    results: list[str] = []

    # Priority 1: Indian mobile numbers
    for m in _INDIAN_MOBILE_RE.finditer(text):
        number = m.group(1)  # the 10-digit part
        if number not in seen:
            seen.add(number)
            results.append(number)

    # Priority 2: generic international phones not already captured
    for m in _PHONE_RAW_RE.findall(text):
        digits = re.sub(r"\D", "", m)
        if 7 <= len(digits) <= 15 and digits not in seen:
            seen.add(digits)
            results.append(m.strip())

    return results


def extract_contacts(text: str) -> dict:
    """
    Regex-based contact extraction from any text (snippet or full page).
    Returns {"email": str|None, "phone": str|None}.
    """
    emails = _clean_emails(_EMAIL_RE.findall(text))
    phones = _extract_phones(text)
    return {
        "email": emails[0] if emails else None,
        "phone": phones[0] if phones else None,
    }
