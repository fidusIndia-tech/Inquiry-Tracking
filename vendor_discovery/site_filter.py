"""
vendor_discovery/site_filter.py
--------------------------------
Pre-filter layer: reject scraped vendor candidates that are government
websites, Hindi/local-language-heavy pages, fund/NGO/donation sites, or
spam/parked/fake domains.

All checks run on domain + title + snippet only — no HTTP fetch cost.
Each check returns (rejected: bool, reason: str | None).

Public API:
    validate_site(url, domain, title, snippet)
        -> (accepted: bool, reason: str)
"""

import re
from logging_setup import get_logger

logger = get_logger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — edit here to tune thresholds or add keywords
# ─────────────────────────────────────────────────────────────────────────────

RULES = {
    # Domain TLD suffixes that are always government/non-commercial.
    # (Complements searcher._NOISE_DOMAIN_SUFFIXES — these are checked again
    # here against title/snippet so both layers catch the same thing.)
    "gov_domain_suffixes": (
        ".gov",
        ".gov.in",
        ".nic.in",
        ".mil",
    ),

    # Domain substrings that indicate a government/public-body website.
    "gov_domain_keywords": (
        "gem.gov.in",
        "egazette",
        "parivahan",
        "municipal",
        "panchayat",
        "ministry",
        "department",
        "district",
        "collector",
        "tribunal",
        "railway",
        "railwayboard",
        "tender",
        "eprocure",
        "cppp.gov",
        "dipp.gov",
    ),

    # Phrases in title/snippet that strongly indicate a government page.
    "gov_text_phrases": (
        "government of india",
        "govt. of india",
        "govt of india",
        "ministry of ",
        "department of ",
        "municipal corporation",
        "district administration",
        "official website of",
        "national portal of india",
        "state government",
        "central government",
        "public sector undertaking",
        "psu ",
        " nic.in",
        "niti aayog",
        "directorate general",
        "commissioner of",
    ),

    # Devanagari content ratio above which we reject the page.
    # 0.25 = more than 25 % of non-whitespace chars are Devanagari.
    "hindi_threshold": 0.25,

    # Fund/donation/NGO keywords — 2 or more matches → reject.
    "fund_keywords": (
        "fund",
        "funds",
        "funding",
        "fundraiser",
        "fundraising",
        "donation",
        "donate",
        "charity",
        " ngo",
        "ngo ",
        " trust",
        "trust ",
        "foundation",
        "relief fund",
        "crowdfunding",
        "grant",
        "scheme",
        "yojana",
        "welfare",
        "seva",
        "sahayata",
        "mutual fund",
        "investment fund",
        "endowment",
        "philanthrop",
        "non-profit",
        "nonprofit",
        "not-for-profit",
    ),

    # If ANY of these appear in title+snippet → reject immediately (single hit).
    "spam_keywords_hard": (
        "domain for sale",
        "buy this domain",
        "parked domain",
        "this domain is for sale",
        "under construction",
        "coming soon",
        "casino",
        "betting",
        " xxx",
        " porn",
        " adult content",
        "free recharge",
        "earn money online",
        "make money fast",
    ),

    # Soft spam signals — 2 or more hits → reject.
    "spam_keywords_soft": (
        "download apk",
        "apk download",
        "crack download",
        "keygen",
        "torrent",
        "loan ",
        " loan",
        "quick loan",
        "instant loan",
        "payday",
        "gambling",
        "lottery",
        "win prize",
        "click here to win",
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

_DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")


def _combined(title: str, snippet: str) -> str:
    """Lower-cased title + snippet for keyword matching."""
    return (str(title or "") + " " + str(snippet or "")).lower()


def _is_government_site(domain: str, title: str, snippet: str) -> tuple[bool, str | None]:
    """
    Reject if domain TLD, domain substring, or title/snippet text
    indicates a government or public-sector page.
    """
    dom = domain.lower()

    for suffix in RULES["gov_domain_suffixes"]:
        if dom.endswith(suffix) or ("." + suffix.lstrip(".")) in dom:
            return True, f"government domain suffix ({suffix})"

    for kw in RULES["gov_domain_keywords"]:
        if kw in dom:
            return True, f"government domain keyword ({kw})"

    text = _combined(title, snippet)
    for phrase in RULES["gov_text_phrases"]:
        if phrase in text:
            return True, f"government text phrase: \"{phrase}\""

    return False, None


def _has_high_hindi_content(title: str, snippet: str) -> tuple[bool, str | None]:
    """
    Reject if the fraction of Devanagari characters in title+snippet
    exceeds the configured threshold.
    """
    text = str(title or "") + " " + str(snippet or "")
    non_ws = text.replace(" ", "").replace("\n", "").replace("\t", "")
    if not non_ws:
        return False, None

    deva_count = len(_DEVANAGARI_RE.findall(non_ws))
    ratio = deva_count / len(non_ws)

    if ratio > RULES["hindi_threshold"]:
        pct = round(ratio * 100, 1)
        return True, f"Devanagari/Hindi content {pct}% (threshold {round(RULES['hindi_threshold']*100)}%)"

    return False, None


def _is_fund_or_ngo_site(title: str, snippet: str) -> tuple[bool, str | None]:
    """
    Reject when 2 or more fund/donation/NGO keywords appear in
    title + snippet (avoids rejecting a company that merely mentions
    "foundation" once in a footer).
    """
    text = _combined(title, snippet)
    matched = [kw for kw in RULES["fund_keywords"] if kw in text]
    if len(matched) >= 2:
        return True, f"fund/NGO keywords: {', '.join(matched[:4])}"
    return False, None


def _is_spam_or_fake_site(title: str, snippet: str) -> tuple[bool, str | None]:
    """
    Reject on any single hard-spam keyword, or on 2+ soft-spam keywords.
    """
    text = _combined(title, snippet)

    for kw in RULES["spam_keywords_hard"]:
        if kw in text:
            return True, f"spam keyword: \"{kw.strip()}\""

    soft_matched = [kw for kw in RULES["spam_keywords_soft"] if kw in text]
    if len(soft_matched) >= 2:
        return True, f"spam soft keywords: {', '.join(k.strip() for k in soft_matched[:3])}"

    return False, None


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def validate_site(
    url: str,
    domain: str,
    title: str,
    snippet: str,
) -> tuple[bool, str]:
    """
    Run all rejection checks against a single search result candidate.

    Returns (accepted, reason):
      accepted=True  → site passed all checks, continue processing
      accepted=False → site should be dropped; reason explains why

    Checks run cheapest-first (domain string ops before text scanning).
    """
    # 1. Government
    rejected, reason = _is_government_site(domain, title, snippet)
    if rejected:
        return False, f"Rejected: government website ({reason})"

    # 2. Hindi / Devanagari heavy
    rejected, reason = _has_high_hindi_content(title, snippet)
    if rejected:
        return False, f"Rejected: Hindi/local-language heavy website ({reason})"

    # 3. Fund / NGO / donation
    rejected, reason = _is_fund_or_ngo_site(title, snippet)
    if rejected:
        return False, f"Rejected: fund/donation/NGO website ({reason})"

    # 4. Spam / fake / parked
    rejected, reason = _is_spam_or_fake_site(title, snippet)
    if rejected:
        return False, f"Rejected: spam/fake/parked website ({reason})"

    return True, "Accepted"
