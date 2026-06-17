"""
vendor_discovery/searcher.py
----------------------------
Call SerpAPI to find authorized dealer/distributor URLs for a given brand.

Strategy: 8 queries total — 5 India-targeted + 3 global — written like a
procurement professional hunting for official brand-authorized dealers.
Part number is intentionally omitted from all queries: authorized dealers
carry the full brand, not individual part numbers.

Target: 8 queries × 20 results = up to 160 raw URLs → ~60-80 unique domains
after deduplication → enough candidates to find 10+ authorized dealers.
"""

import re
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Each entry: (query_template, extra_serpapi_params)
# India-targeted queries use gl=in/cr=countryIN for local results.
# Global queries run without geo-restriction to capture non-India authorized
# dealers and distributors — user wants best suppliers India or outside India.
_QUERIES: list[tuple[str, dict]] = [
    # ── India-targeted ───────────────────────────────────────────────────────
    ('"{brand}" "authorized dealer" India contact email phone',
     {"gl": "in", "cr": "countryIN"}),

    ('"{brand}" "authorized distributor" official supplier India',
     {"gl": "in", "cr": "countryIN"}),

    ('site:indiamart.com "{brand}" authorized dealer',
     {"gl": "in"}),

    ('"{brand}" "channel partner" dealer supplier India contact',
     {"gl": "in", "cr": "countryIN"}),

    ('site:tradeindia.com "{brand}" authorized dealer distributor',
     {"gl": "in"}),

    # ── Global (India + international) ──────────────────────────────────────
    ('"{brand}" authorized dealer distributor contact email',
     {}),

    ('"{brand}" "authorized distributor" OR "certified dealer" contact email phone',
     {}),

    ('"{brand}" official reseller distributor supplier contact email',
     {}),
]

# Domains that are pure noise — excluded from results entirely.
# B2B directories (indiamart, tradeindia) are intentionally NOT blocked:
# they contain real authorized-dealer listings. Their pages are skipped at
# scrape time (scraper._SKIP_VISIT_DOMAINS) because they block bots, but
# Google snippets from those pages often contain useful contact signals.
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
    Run all queries against SerpAPI and return deduplicated result dicts.
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

    for template, geo_params in _QUERIES:
        query = template.format(brand=brand)
        try:
            params = {
                "q":       query,
                "api_key": settings.SERPAPI_KEY,
                "num":     20,      # 20 results per query for better coverage
                "hl":      "en",
                **geo_params,
            }
            search = GoogleSearch(params)
            data = search.get_dict()
            organic = data.get("organic_results", [])
            added = 0
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
                    added += 1
            logger.info(
                "SerpAPI | '%s' → %d raw / %d new unique", query[:70], len(organic), added
            )
        except Exception as exc:
            logger.error("SerpAPI error for query '%s': %s", query[:70], exc)

    logger.info("SerpAPI total unique URLs collected: %d", len(results))
    return results
