"""
vendor_discovery/searcher.py
----------------------------
Call SearchApi.io (a Google-search-results API, same organic_results JSON
shape as SerpAPI) to find authorized dealer/distributor URLs for a brand.

Strategy: 8 queries total — 5 India-targeted + 3 global — written like a
procurement professional hunting for official brand-authorized dealers.
Part number is intentionally omitted from all queries: authorized dealers
carry the full brand, not individual part numbers.

Target: 8 queries × 20 results = up to 160 raw URLs → ~60-80 unique domains
after deduplication → enough candidates to find 10+ authorized dealers.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

_SEARCHAPI_ENDPOINT = "https://www.searchapi.io/api/v1/search"


def _searchapi_request(query: str, num: int = 20, **extra_params) -> dict:
    """
    Run one Google-search query against SearchApi.io and return the parsed
    JSON response. SearchApi.io mirrors SerpAPI's organic_results shape
    (title/link/snippet per result), so callers check the same fields.
    On an API-level failure (bad key, quota, etc.) the returned dict carries
    an "error" key instead of raising — callers check for that explicitly.
    """
    params = {
        "engine":  "google",
        "q":       query,
        "api_key": settings.SEARCHAPI_KEY,
        "num":     num,
        "hl":      "en",
        **extra_params,
    }
    url = f"{_SEARCHAPI_ENDPOINT}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            return json.loads(body)
        except ValueError:
            return {"error": f"HTTP {exc.code}: {body[:200]}"}

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

# Run only when the strict queries above come back nearly empty — niche,
# specialized OEM/machinery brands often don't have anyone who markets
# themselves as an "authorized dealer" in indexed text at all, even when
# real suppliers exist. These drop that requirement entirely. Kept as a
# separate, conditional pass rather than merged into _QUERIES so brands that
# already get plenty of high-confidence results never pay for (or get
# diluted by) the noisier, lower-confidence candidates this surfaces.
_FALLBACK_QUERIES: list[tuple[str, dict]] = [
    ('"{brand}" distributor India price contact',
     {"gl": "in"}),

    ('"{brand}" supplier contact email phone',
     {}),

    ('"{brand}" spare parts price quote',
     {}),
]

# Below this many unique candidates from the strict pass, try the fallback.
_FALLBACK_THRESHOLD = 5

# Domains that are pure noise — excluded from results entirely.
# B2B directories (indiamart, tradeindia) are intentionally NOT blocked:
# they contain real authorized-dealer listings. Their pages are skipped at
# scrape time (scraper._SKIP_VISIT_DOMAINS) because they block bots, but
# Google snippets from those pages often contain useful contact signals.
_NOISE_DOMAINS = frozenset([
    # ── Search engines ───────────────────────────────────────────────────────
    "google.com", "google.co.in", "google.co.uk",
    "bing.com", "yahoo.com", "duckduckgo.com",

    # ── Social / video ───────────────────────────────────────────────────────
    "youtube.com", "wikipedia.org", "wikimedia.org",
    "linkedin.com", "facebook.com", "twitter.com", "x.com",
    "instagram.com", "pinterest.com", "reddit.com", "quora.com",
    "telegram.org", "whatsapp.com",

    # ── Job portals — top source of noisy results ────────────────────────────
    "naukri.com", "indeed.com", "indeed.co.in",
    "monster.com", "monsterindia.com",
    "shine.com", "timesjobs.com", "freshersworld.com",
    "foundit.in", "glassdoor.com", "glassdoor.co.in",
    "apna.co", "hirist.com", "iimjobs.com", "workindia.in",
    "internshala.com", "instahyre.com", "cutshort.io",
    "simplyhired.com", "ziprecruiter.com", "careerjet.co.in",
    "ambitionbox.com", "theladders.com",

    # ── News / media ─────────────────────────────────────────────────────────
    "economictimes.indiatimes.com", "livemint.com", "businesstoday.in",
    "moneycontrol.com", "ndtv.com", "ndtvprofit.com",
    "thehindu.com", "hindustantimes.com", "timesofindia.com",
    "businessstandard.com", "thehindubusinessline.com",
    "news18.com", "firstpost.com", "cnbctv18.com",
    "financialexpress.com", "deccanherald.com", "tribuneindia.com",
    "reuters.com", "bloomberg.com", "forbes.com", "fortune.com",

    # ── Press release / PR wire ──────────────────────────────────────────────
    "prnewswire.com", "businesswire.com", "globenewswire.com",
    "einpresswire.com", "accesswire.com",

    # ── Blog / content platforms ─────────────────────────────────────────────
    "medium.com", "wordpress.com", "blogspot.com", "tumblr.com",
    "wix.com", "substack.com", "ghost.io",

    # ── E-commerce marketplaces ──────────────────────────────────────────────
    "amazon.in", "amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp",
    "ebay.com", "ebay.in", "ebay.co.uk",
    "flipkart.com", "shopclues.com", "meesho.com",
    "alibaba.com", "aliexpress.com", "made-in-china.com", "globalsources.com",
    "snapdeal.com", "paytmmall.com",

    # ── Local directories that hide contacts behind login ────────────────────
    "justdial.com", "sulekha.com", "yellowpages.in", "asklaila.com",

    # ── Document / presentation hosts ───────────────────────────────────────
    "scribd.com", "slideshare.net", "docplayer.net", "academia.edu",
    "issuu.com", "calameo.com",

    # ── Government and standards bodies ─────────────────────────────────────
    "nhtsa.gov", "iec.ch", "iso.org", "standards.ieee.org",
    "ul.com", "tuv.com", "bsigroup.com", "osha.gov", "epa.gov",
    "bis.gov.in", "meity.gov.in",
    "wbagrimarketing.gov.in", "wbldc.in", "india.gov.in", "mnre.gov.in",

    # ── Insurance companies ───────────────────────────────────────────────────
    "licindia.in", "lic.co.in", "hdfclife.com", "sbilife.co.in",
    "iciciprulife.com", "maxlifeinsurance.com", "bajajalianz.com",

    # ── Agricultural / farming ────────────────────────────────────────────────
    "sukhagro.com", "agrifarming.in", "krishijagran.com", "agrowon.com",
    "agricultureinformation.com", "farmersforum.in",

    # ── Educational institutions (specific; suffix catch covers the rest) ─────
    "iith.ac.in", "iitb.ac.in", "iitd.ac.in", "iitk.ac.in", "iitm.ac.in",
    "iitg.ac.in", "iitr.ac.in", "iitbbs.ac.in", "iitmandi.ac.in",
    "mnit.ac.in", "nitt.edu", "nitk.ac.in", "nits.ac.in",
    "vtu.ac.in", "anna.edu", "du.ac.in", "mu.ac.in",

    # ── Datasheet / spec sheet aggregators ──────────────────────────────────
    "datasheetspdf.com", "alldatasheet.com", "datasheetcatalog.com",
    "datasheet4u.com", "octopart.com", "findchips.com",

    # ── Patent / legal ───────────────────────────────────────────────────────
    "patents.google.com", "freepatentsonline.com",

    # ── Q&A / forums ─────────────────────────────────────────────────────────
    "stackoverflow.com", "stackexchange.com", "geeksforgeeks.org",
    "researchgate.net", "semanticscholar.org",
])


# Domain suffixes that are NEVER commercial suppliers — block entire TLD groups
_NOISE_DOMAIN_SUFFIXES = (
    ".ac.in",   # Indian academic institutions (IIT, NIT, universities)
    ".edu.in",  # Indian educational
    ".edu",     # Global educational
    ".gov",     # US government
    ".gov.in",  # Indian government
    ".nic.in",  # Indian NIC / government portals
    ".mil",     # Military
    ".org.in",  # Indian NGOs / non-commercial
)


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else ""


def _is_noise_domain(dom: str) -> bool:
    return dom in _NOISE_DOMAINS or any(dom.endswith(s) for s in _NOISE_DOMAIN_SUFFIXES)


def _run_query_batch(
    brand: str,
    query_list: list[tuple[str, dict]],
    seen_urls: set[str],
    results: list[dict],
) -> None:
    """Run one batch of query templates, appending newly-seen URLs to `results`."""
    for template, geo_params in query_list:
        query = template.format(brand=brand)
        try:
            data = _searchapi_request(query, **geo_params)

            # SearchApi.io returns an "error" key on an API-level failure
            # (bad key, quota, etc.) rather than always raising — left
            # unchecked, this looks identical to "Google genuinely found
            # nothing" in the logs, which is exactly the wrong thing to hide.
            api_error = data.get("error")
            if api_error:
                logger.error("SearchApi error for query '%s': %s", query[:70], api_error)
                continue

            organic = data.get("organic_results", [])
            added = 0
            for r in organic:
                url = r.get("link", "")
                dom = _domain(url)
                if url and url not in seen_urls and not _is_noise_domain(dom):
                    seen_urls.add(url)
                    results.append({
                        "url":     url,
                        "title":   r.get("title", ""),
                        "snippet": r.get("snippet", ""),
                        "domain":  dom,
                    })
                    added += 1
            logger.info(
                "SearchApi | '%s' → %d raw / %d new unique", query[:70], len(organic), added
            )
        except Exception as exc:
            logger.error("SearchApi error for query '%s': %s", query[:70], exc)


def search_vendors(brand: str, part_number: str) -> list[dict]:
    """
    Run all queries against SearchApi.io and return deduplicated result dicts.
    Returns [] if SEARCHAPI_KEY is not configured.
    """
    if not getattr(settings, "SEARCHAPI_KEY", ""):
        logger.warning("SEARCHAPI_KEY not set — vendor discovery skipped")
        return []

    seen_urls: set[str] = set()
    results: list[dict] = []

    _run_query_batch(brand, _QUERIES, seen_urls, results)

    if len(results) < _FALLBACK_THRESHOLD:
        logger.info(
            "Only %d candidate(s) from strict 'authorized dealer' search for '%s' — "
            "trying broader fallback queries (niche/specialized brand)",
            len(results), brand,
        )
        _run_query_batch(brand, _FALLBACK_QUERIES, seen_urls, results)

    logger.info("SearchApi total unique URLs collected: %d", len(results))
    return results
