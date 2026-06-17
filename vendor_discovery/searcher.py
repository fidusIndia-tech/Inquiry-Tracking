"""
vendor_discovery/searcher.py
----------------------------
Call SerpAPI to find authorized dealer/distributor URLs for a given brand.
Queries are written like a procurement professional searching for official
brand-authorized dealers in India — not generic resellers or part-number pages.
Returns deduplicated list of {"url", "title", "snippet"} dicts.
"""

import re
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Four brand-focused queries targeting authorized dealers/distributors only.
# Part number is intentionally omitted — authorized dealers carry the full brand,
# not just individual part numbers.
_QUERY_TEMPLATES = [
    '"{brand}" "authorized dealer" India contact email phone',
    '"{brand}" "authorized distributor" official supplier India',
    'site:indiamart.com "{brand}" "authorized dealer"',
    '"{brand}" "official dealer" OR "channel partner" India supplier contact',
]

# Domains that are pure noise — excluded from results entirely.
# NOTE: indiamart.com is intentionally NOT blocked here so that Google search
# returns IndiaMart dealer listings; those pages are skipped at scrape time
# (scraper._SKIP_VISIT_DOMAINS) because IndiaMart blocks bots, but the
# Google snippets sometimes contain phone numbers worth keeping.
_NOISE_DOMAINS = frozenset([
    "google.com", "google.co.in", "google.co.uk",
    "youtube.com", "wikipedia.org", "wikimedia.org",
    "linkedin.com", "facebook.com", "twitter.com", "x.com",
    "instagram.com", "pinterest.com", "reddit.com", "quora.com",
    "amazon.in", "amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp",
    "ebay.com", "ebay.in", "ebay.co.uk",
    "flipkart.com", "shopclues.com", "meesho.com",
    "alibaba.com", "aliexpress.com", "made-in-china.com", "globalsources.com",
    "scribd.com", "slideshare.net", "docplayer.net", "academia.edu",
    "exportersindia.com",
    # Government and standards bodies
    "nhtsa.gov", "iec.ch", "iso.org", "standards.ieee.org",
    "ul.com", "tuv.com", "bsigroup.com", "osha.gov", "epa.gov",
    # Datasheet / spec sheet aggregators
    "datasheetspdf.com", "alldatasheet.com", "datasheetcatalog.com",
    "datasheet4u.com", "octopart.com", "findchips.com",
    # Patent / legal / news
    "patents.google.com", "freepatentsonline.com",
])


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else ""


def search_vendors(brand: str, part_number: str) -> list[dict]:
    """
    Run 3 SerpAPI searches and return deduplicated result dicts.
    Returns [] if SERPAPI_KEY is not configured.
    """
    if not getattr(settings, "SERPAPI_KEY", ""):
        logger.warning("SERPAPI_KEY not set — vendor discovery skipped")
        return []

    try:
        from serpapi import GoogleSearch
    except ImportError:
        logger.error("google-search-results not installed — run: pip install google-search-results")
        return []

    seen_urls: set[str] = set()
    results: list[dict] = []

    for template in _QUERY_TEMPLATES:
        query = template.format(brand=brand)
        try:
            search = GoogleSearch({
                "q":       query,
                "api_key": settings.SERPAPI_KEY,
                "num":     10,
                "hl":      "en",
                "gl":      "in",       # India-targeted results
                "cr":      "countryIN",
            })
            data = search.get_dict()
            organic = data.get("organic_results", [])
            for r in organic:
                url = r.get("link", "")
                dom = _domain(url)
                if url and url not in seen_urls and dom not in _NOISE_DOMAINS:
                    seen_urls.add(url)
                    results.append({
                        "url":     url,
                        "title":   r.get("title", ""),
                        "snippet": r.get("snippet", ""),
                        "domain":  dom,
                    })
            logger.info("SerpAPI | '%s' → %d results", query[:70], len(organic))
        except Exception as exc:
            logger.error("SerpAPI error for query '%s': %s", query[:70], exc)

    return results
