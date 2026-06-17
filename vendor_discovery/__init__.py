"""
vendor_discovery/__init__.py
-----------------------------
Main discovery pipeline.

Given brand + part_number:
  1. Call SerpAPI (4 brand-focused queries → up to 40 URLs)
  2. Regex contact extraction from search snippets (free)
  3. Fetch vendor page when email or authorization is still unconfirmed
  4. Regex contact extraction from full page text
  5. GPT-4o-mini for authorization check + contact fill-in when page available
  6. Authorization gate: skip if not confirmed as authorized dealer
  7. POST structured vendor data to Next.js API → stored in PostgreSQL

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

_AUTH_KEYWORDS = (
    "authorized dealer", "authorised dealer",
    "authorized distributor", "authorised distributor",
    "official dealer", "official distributor",
    "channel partner",
)


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else url


def _snippet_confirms_auth(title: str, snippet: str) -> bool:
    combined = (title + " " + snippet).lower()
    return any(kw in combined for kw in _AUTH_KEYWORDS)


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

        # ── Step 1: regex on snippet (free, no HTTP call) ───────────────────
        contacts = extract_contacts(snippet)
        auth_confirmed_by_snippet = _snippet_confirms_auth(title, snippet)

        # ── Step 2: fetch page when email OR authorization still unconfirmed ─
        # Previously we only fetched when email was missing. Now we also fetch
        # when authorization hasn't been confirmed by the snippet — so the LLM
        # can read the full page and determine authorized-dealer status.
        page_text = ""
        needs_page = not contacts["email"] or not auth_confirmed_by_snippet
        if needs_page:
            page_text = fetch_vendor_page(url)
            if page_text:
                page_contacts = extract_contacts(page_text)
                if page_contacts["email"] and not contacts["email"]:
                    contacts["email"] = page_contacts["email"]
                if page_contacts["phone"] and not contacts["phone"]:
                    contacts["phone"] = page_contacts["phone"]

        # ── Step 3: LLM — runs when page available AND auth not yet confirmed ─
        # This fixes the previous bug where LLM was skipped for pages that had
        # an email (found by regex) but no snippet-level auth keywords, causing
        # real authorized dealers to fail the authorization gate.
        llm_extras: dict = {}
        if page_text and not auth_confirmed_by_snippet:
            llm_extras = parse_vendor_with_llm(url, title, page_text, brand=brand)
            if llm_extras.get("email") and not contacts["email"]:
                contacts["email"] = llm_extras["email"]
            if llm_extras.get("phone") and not contacts["phone"]:
                contacts["phone"] = llm_extras["phone"]

        # ── Step 4: Authorization gate ───────────────────────────────────────
        # Confirmed authorized if:
        # A) Snippet/title has explicit auth keywords (e.g. "authorized dealer"), OR
        # B) LLM read the full page and flagged is_authorized_dealer = True
        llm_confirms = bool(llm_extras.get("is_authorized_dealer"))

        if not auth_confirmed_by_snippet and not llm_confirms:
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
