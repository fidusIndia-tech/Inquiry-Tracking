"""
vendor_discovery/__init__.py
-----------------------------
Main discovery pipeline.

Given brand + part_number:
  1. Call SerpAPI (3 search queries → up to 30 URLs)
  2. Try regex contact extraction from search snippets (free)
  3. Fetch vendor page if snippet had no contacts
  4. Fall back to GPT-4o-mini if page fetch also found nothing
  5. POST structured vendor data to Next.js API → stored in PostgreSQL

Public API:
    discover_and_store_vendors(brand, part_number, inquiry_unique_code) -> list[dict]
"""

import re
from .searcher import search_vendors
from .scraper  import fetch_vendor_page, extract_contacts
from .parser   import parse_vendor_with_llm
from .client   import post_vendor
from logging_setup import get_logger

logger = get_logger(__name__)


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else url


def discover_and_store_vendors(
    brand: str,
    part_number: str,
    inquiry_unique_code: str | None = None,
) -> list[dict]:
    """
    Full discovery pipeline for one brand + part_number.
    Returns list of stored vendor result dicts.
    """
    if not brand or not part_number:
        return []

    logger.info("Vendor discovery start | brand=%s part=%s", brand, part_number)

    search_results = search_vendors(brand, part_number)
    if not search_results:
        logger.info("Vendor discovery | no search results for %s %s", brand, part_number)
        return []

    stored: list[dict] = []
    seen_domains: set[str] = set()

    for result in search_results:
        url     = result["url"]
        title   = result["title"]
        snippet = result["snippet"]
        domain  = result.get("domain") or _domain(url)

        # One vendor per domain (avoid duplicates from multiple search pages)
        if domain in seen_domains:
            continue
        seen_domains.add(domain)

        # ── Step 1: try regex on snippet (free, no HTTP call) ────────────────
        contacts = extract_contacts(snippet)

        # ── Step 2: fetch page whenever email is missing ──────────────────────
        page_text = ""
        if not contacts["email"]:
            page_text = fetch_vendor_page(url)
            if page_text:
                page_contacts = extract_contacts(page_text)
                if page_contacts["email"]:
                    contacts["email"] = page_contacts["email"]
                if not contacts["phone"] and page_contacts["phone"]:
                    contacts["phone"] = page_contacts["phone"]

        # ── Step 3: LLM fallback whenever email still missing + page available ─
        llm_extras: dict = {}
        if not contacts["email"] and page_text:
            llm_extras = parse_vendor_with_llm(url, title, page_text, brand=brand)
            if llm_extras.get("email"):
                contacts["email"] = llm_extras["email"]
            if llm_extras.get("phone") and not contacts["phone"]:
                contacts["phone"] = llm_extras["phone"]

        # ── Step 4: Authorization gate ────────────────────────────────────────
        # Only store confirmed authorized dealers. Two ways to confirm:
        # A) LLM explicitly flagged is_authorized_dealer = True
        # B) Title or snippet contains clear authorized-dealer keywords
        #    (search queries already target these, so this catches snippet hits
        #     where we couldn't fetch the page)
        _AUTH_KEYWORDS = (
            "authorized dealer", "authorised dealer",
            "authorized distributor", "authorised distributor",
            "official dealer", "official distributor",
            "channel partner",
        )
        combined_text = (title + " " + snippet).lower()
        snippet_confirms = any(kw in combined_text for kw in _AUTH_KEYWORDS)
        llm_confirms     = bool(llm_extras.get("is_authorized_dealer"))

        if not snippet_confirms and not llm_confirms:
            logger.info(
                "Skipping non-authorized vendor | %s | title=%s", domain, title[:60]
            )
            continue

        payload = {
            "name":                 llm_extras.get("vendor_name") or title,
            "website":              url,
            "domain":               domain,
            "email":                contacts.get("email"),
            "phone":                contacts.get("phone"),
            "city":                 llm_extras.get("city"),
            "country":              llm_extras.get("country"),
            "is_authorized_dealer": True,
            "brand":                brand,
            "part_number":          part_number,
            "inquiry_unique_code":  inquiry_unique_code,
            "source":               "serpapi",
        }

        try:
            stored_result = post_vendor(payload)
            stored.append(stored_result)
            logger.info(
                "Vendor stored | %s | email=%s | auth_via=%s",
                domain, contacts.get("email"),
                "llm" if llm_confirms else "snippet",
            )
        except Exception as exc:
            logger.error("Failed to store vendor %s: %s", domain, exc)

    logger.info(
        "Vendor discovery done | brand=%s part=%s | stored=%d / found=%d",
        brand, part_number, len(stored), len(search_results),
    )
    return stored
