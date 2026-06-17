"""
vendor_discovery/__init__.py
-----------------------------
Main discovery pipeline.

Given brand + part_number:
  1. SerpAPI (8 queries → up to 160 URLs)
  2. Pre-filter: drop job postings, news pages, URL path noise
  3. Regex contact extraction from snippet
  4. Fetch page when email or auth not yet confirmed
  5. Regex on full page text
  6. GPT-4o-mini — authorization check + contact fill
  7. Authorization gate: skip if not confirmed as authorized dealer
  8. Contact gate: skip if no email AND no phone
  9. Store — hard cap at 10 vendors per brand

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

MAX_VENDORS = 10

_AUTH_KEYWORDS = (
    "authorized dealer", "authorised dealer",
    "authorized distributor", "authorised distributor",
    "official dealer", "official distributor",
    "channel partner", "exclusive dealer", "exclusive distributor",
)

# If any of these words appear in the title or snippet, the result is a
# job posting / HR page — not a supplier page. Skip immediately.
_JOB_SIGNALS = frozenset([
    "hiring", "vacancy", "vacancies", "apply now", "job opening",
    "job description", "job type", "work from home", "salary",
    "lpa", "per annum", "ctc", "experience required", "qualifications",
    "join our team", "we are hiring", "openings", "fresher",
    "full time", "part time", "bachelor", "engineer required",
    "interview", "recruitment", "walk-in", "walkin",
])

# If any of these appear in title/snippet the page is an institution,
# government body, agricultural site, or clearly not a dealer page.
_INSTITUTION_SIGNALS = frozenset([
    "institute of technology", "indian institute", "national institute",
    "iit ", "nit ", " iit", " nit", "university", "college of engineering",
    "government of ", "govt. of ", "ministry of ", "department of ",
    "municipal corporation", "public sector", "undertaking",
    "life insurance", "insurance corporation", "insurance company",
    "agricultural marketing", "agri marketing", "farming board",
    "reaper binder", "harvester", "crop binder", "paddy binder",
    "wheat binder", "agriculture board", "krishi",
    "consumer complaint", "file a complaint", "grievance", "complaint forum",
    "complaint portal", "consumer forum", "consumer court",
])

# Vendor names that are obviously not real company names — skip these results
_GENERIC_VENDOR_NAMES = frozenset([
    "complaint details", "our sellers", "contact us", "home page",
    "about us", "products", "services", "company profile",
    "seller details", "find a dealer", "dealer locator",
    "branch and partner locator", "distributor locator",
])

# URL path segments that indicate non-supplier pages
_NOISE_URL_PATHS = (
    "/jobs/", "/careers/", "/career/", "/job/", "/vacancy/", "/vacancies/",
    "/hiring/", "/apply/", "/recruitment/", "/job-opening/",
    "/news/", "/blog/", "/article/", "/press/", "/press-release/",
    "/forum/", "/discussion/", "/community/", "/review/",
)


def _domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/?#]+)", url)
    return m.group(1).lower() if m else url


def _is_brand_own_domain(domain: str, brand: str) -> bool:
    """Return True if the domain belongs to the brand itself — not a dealer."""
    if not brand or len(brand) < 3:
        return False
    brand_slug = re.sub(r"[^a-z0-9]", "", brand.lower())
    domain_slug = re.sub(r"[^a-z0-9]", "", domain.lower())
    return brand_slug in domain_slug


def _is_job_or_noise(title: str, snippet: str, url: str) -> bool:
    """Return True if this result is a job posting, institution, or irrelevant page."""
    combined = (title + " " + snippet).lower()
    if any(sig in combined for sig in _JOB_SIGNALS):
        return True
    if any(sig in combined for sig in _INSTITUTION_SIGNALS):
        return True
    url_lower = url.lower()
    if any(path in url_lower for path in _NOISE_URL_PATHS):
        return True
    return False


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
    Returns list of stored vendor result dicts (max 10).
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

        # Hard cap — stop as soon as we have 10 quality vendors
        if len(stored) >= MAX_VENDORS:
            logger.info("Vendor discovery | reached %d vendor cap | stopping", MAX_VENDORS)
            break

        url     = result["url"]
        title   = result["title"]
        snippet = result["snippet"]
        domain  = result.get("domain") or _domain(url)

        # ── Pre-filter 1: one vendor per domain ──────────────────────────────
        if domain in seen_domains:
            continue
        seen_domains.add(domain)

        # ── Pre-filter 2: skip brand's own website ────────────────────────────
        if _is_brand_own_domain(domain, brand):
            logger.info("Brand own domain skipped | %s", domain)
            continue

        # ── Pre-filter 3: drop job postings, institutions, noise ──────────────
        if _is_job_or_noise(title, snippet, url):
            logger.info("Noise result skipped | %s | title=%s", domain, title[:60])
            continue

        # ── Step 1: regex on snippet (free, no HTTP call) ────────────────────
        contacts = extract_contacts(snippet)
        auth_confirmed_by_snippet = _snippet_confirms_auth(title, snippet)

        # ── Step 2: fetch page when email OR auth still unconfirmed ──────────
        page_text = ""
        if not contacts["email"] or not auth_confirmed_by_snippet:
            page_text = fetch_vendor_page(url)
            if page_text:
                page_contacts = extract_contacts(page_text)
                if page_contacts["email"] and not contacts["email"]:
                    contacts["email"] = page_contacts["email"]
                if page_contacts["phone"] and not contacts["phone"]:
                    contacts["phone"] = page_contacts["phone"]

        # ── Step 3: LLM when page available AND auth not yet confirmed ────────
        llm_extras: dict = {}
        if page_text and not auth_confirmed_by_snippet:
            llm_extras = parse_vendor_with_llm(url, title, page_text, brand=brand)
            if llm_extras.get("email") and not contacts["email"]:
                contacts["email"] = llm_extras["email"]
            if llm_extras.get("phone") and not contacts["phone"]:
                contacts["phone"] = llm_extras["phone"]

        # ── Gate 0: Reject generic/invalid vendor names ───────────────────────
        vendor_name = (llm_extras.get("vendor_name") or title or "").lower().strip()
        if any(g in vendor_name for g in _GENERIC_VENDOR_NAMES):
            logger.info("Generic vendor name rejected | %s | name=%s", domain, vendor_name[:60])
            continue

        # ── Gate 1: Authorization ─────────────────────────────────────────────
        llm_confirms = bool(llm_extras.get("is_authorized_dealer"))
        if not auth_confirmed_by_snippet and not llm_confirms:
            logger.info(
                "Not authorized — skipped | %s | title=%s", domain, title[:60]
            )
            continue

        # ── Gate 2: Must have at least email OR phone ─────────────────────────
        # A vendor with no contact details is useless — don't store it.
        if not contacts.get("email") and not contacts.get("phone"):
            logger.info(
                "No contact info — skipped | %s", domain
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
                "Vendor stored | %s | email=%s | phone=%s | auth_via=%s",
                domain, contacts.get("email"), contacts.get("phone"),
                "llm" if llm_confirms else "snippet",
            )
        except Exception as exc:
            logger.error("Failed to store vendor %s: %s", domain, exc)

    logger.info(
        "Vendor discovery done | brand=%s | stored=%d / candidates=%d",
        brand, len(stored), len(search_results),
    )
    return stored
