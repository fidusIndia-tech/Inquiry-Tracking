"""
vendor_discovery/searcher.py
----------------------------
Call SerpAPI to find vendor URLs for a given brand + part number.
Returns deduplicated list of {"url", "title", "snippet"} dicts.
"""

import re
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Three angles per part — global search, brand quoted, part number flexible
_QUERY_TEMPLATES = [
    '"{brand}" {part_number} authorized distributor',
    '"{brand}" {part_number} supplier dealer stockist',
    '"{brand}" {part_number} buy price distributor',
]

# Domains that are pure noise — excluded from results entirely
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
    "indiamart.com", "tradeindia.com", "exportersindia.com",
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
        query = template.format(brand=brand, part_number=part_number)
        try:
            search = GoogleSearch({
                "q":       query,
                "api_key": settings.SERPAPI_KEY,
                "num":     10,
                "hl":      "en",
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
