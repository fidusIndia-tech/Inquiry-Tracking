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

# Three angles per part — brand quoted (exact brand name), part number unquoted (flexible match)
_QUERY_TEMPLATES = [
    '"{brand}" {part_number} authorized distributor India',
    '"{brand}" {part_number} supplier dealer India',
    '"{brand}" {part_number} buy price India',
]

# Domains that are directories/marketplaces, not direct vendors — skip visiting
# their pages but still keep them in results if they appear in snippets.
_SKIP_VISIT_DOMAINS = frozenset([
    "google.com", "youtube.com", "wikipedia.org", "linkedin.com",
    "facebook.com", "twitter.com", "amazon.in", "amazon.com", "flipkart.com",
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
                "gl":      "in",   # India-biased results
                "hl":      "en",
            })
            data = search.get_dict()
            organic = data.get("organic_results", [])
            for r in organic:
                url = r.get("link", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    results.append({
                        "url":     url,
                        "title":   r.get("title", ""),
                        "snippet": r.get("snippet", ""),
                        "domain":  _domain(url),
                    })
            logger.info("SerpAPI | '%s' → %d results", query[:70], len(organic))
        except Exception as exc:
            logger.error("SerpAPI error for query '%s': %s", query[:70], exc)

    return results
