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
# Date patterns to reject — DD-MM-YYYY, YYYY-MM-DD, or any string with a 4-digit year
_DATE_RE = re.compile(r"(19|20)\d{2}")
_TAG_RE  = re.compile(r"<[^>]+>")
_WS_RE   = re.compile(r"\s+")
_SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style)[^>]*>.*?</\1>")

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

# Contact page paths tried in order when main page has no email.
# Trimmed from an earlier 30-path list down to the highest-yield ones —
# every path tried costs real time on a slow-but-alive domain (each one
# can take several seconds), and with discover_vendors_task processing many
# candidates per brand, the long tail of rarely-used paths (/touch,
# /talk-to-us, /corporate-info, etc.) was adding up enough to occasionally
# blow the task's 900s hard time limit without finding anything extra.
_CONTACT_PATHS = [
    "/contact", "/contact-us", "/contactus", "/contact_us",
    "/about-us", "/about",
    "/enquiry", "/inquiry",
    "/get-in-touch", "/support",
]

_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else ""


def _clean_emails(raw: list[str]) -> list[str]:
    return [
        e for e in raw
        if not any(skip in e.lower() for skip in _SKIP_EMAIL_WORDS)
    ]


def _fetch_url(url: str, timeout: int = 6) -> tuple[str, bool]:
    """
    Fetch a single URL and return (plain_text, unreachable).

    unreachable=True means the failure happened at the network/DNS level
    (refused connection, DNS lookup failed, socket timeout) — the whole
    domain is down, not just this one path. unreachable=False covers a
    clean HTTP error (404, 403, etc.): the domain answered, this specific
    path just doesn't exist. Callers trying many paths on one domain need
    this distinction to stop early instead of repeating an identical
    network failure for every remaining path.
    """
    try:
        req = urllib.request.Request(url, headers=_FETCH_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return "", False
            raw = resp.read(300_000).decode("utf-8", errors="ignore")
            raw = _SCRIPT_STYLE_RE.sub(" ", raw)

            # Tag-split emails — e.g. <span>info</span>@<span>domain.com</span> —
            # become "info @ domain.com" once tags are replaced with spaces, which
            # breaks the no-space email regex. Stripping tags to '' (no space)
            # rejoins these fragments so the email is recoverable.
            tight_emails = _EMAIL_RE.findall(_TAG_RE.sub("", raw))

            text = _TAG_RE.sub(" ", raw)
            text = _WS_RE.sub(" ", text).strip()[:40000]

            if tight_emails:
                text = " ".join(tight_emails) + " " + text

            return text, False
    except urllib.error.HTTPError as exc:
        logger.debug("Page fetch failed %s: %s", url, type(exc).__name__)
        return "", False
    except Exception as exc:
        logger.debug("Page fetch failed %s: %s", url, type(exc).__name__)
        return "", True


def fetch_vendor_page(url: str, timeout: int = 6) -> str:
    """
    Fetch URL and return stripped plain text.
    Returns '' on network failure, 403, timeout, or skipped domain.
    """
    if _domain(url) in _SKIP_VISIT_DOMAINS:
        return ""
    text, _ = _fetch_url(url, timeout)
    return text


def fetch_contact_page(base_url: str, timeout: int = 6) -> str:
    """
    Try common contact page paths on the vendor's domain.
    Returns the first page text that contains an email, or ''.
    Called when the main page has no email.

    Stops after the first connection-level failure (DNS/refused/timeout) —
    if the domain itself is unreachable, every remaining path would fail
    identically, so trying all 30 just burns minutes for nothing.
    """
    dom = _domain(base_url)
    if not dom or dom in _SKIP_VISIT_DOMAINS:
        return ""

    base = f"https://{dom}"
    for path in _CONTACT_PATHS:
        text, unreachable = _fetch_url(base + path, timeout)
        if unreachable:
            logger.debug("Domain unreachable, stopping contact-page search | %s", dom)
            return ""
        if text and _EMAIL_RE.search(text):
            logger.debug("Contact page found email | %s%s", dom, path)
            return text
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
        if 8 <= len(digits) <= 15 and digits not in seen and not _DATE_RE.search(m):
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
