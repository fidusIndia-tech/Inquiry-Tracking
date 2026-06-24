"""
vendor_discovery/brand_lookup.py
----------------------------------
Identifies a missing brand from a part number — falling back to the item's
notes/description if that's inconclusive — by searching Google and asking
GPT to read the results.

This mirrors what an employee already does manually: Google the part
number, see who makes it, then search for that manufacturer's authorized
dealers. Runs only for line items the client's email never stated a brand
for, since those are otherwise skipped by vendor discovery entirely.
"""

import json

from openai import OpenAI

from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY)


def _search(query: str) -> list[dict]:
    if not getattr(settings, "SERPAPI_KEY", ""):
        return []
    try:
        from serpapi import GoogleSearch
    except ImportError:
        logger.error("google-search-results not installed — brand lookup skipped")
        return []
    try:
        search = GoogleSearch({
            "q": query,
            "api_key": settings.SERPAPI_KEY,
            "num": 10,
            "hl": "en",
        })
        data = search.get_dict()
        return data.get("organic_results", []) or []
    except Exception as exc:
        logger.error("Brand lookup SerpAPI error for '%s': %s", query[:70], exc)
        return []


def _ask_llm_for_brand(search_term: str, results: list[dict]) -> str | None:
    if not results:
        return None

    snippets = "\n".join(
        f"- {r.get('title', '')} — {r.get('snippet', '')}" for r in results[:8]
    )
    prompt = f"""Search term used: "{search_term}"

Search results:
{snippets}

Based on these search results, what is the brand/manufacturer name of this
industrial part? Return ONLY valid JSON: {{"brand": "Manufacturer Name"}}
or {{"brand": null}} if you cannot confidently determine it from these
results. Do not guess — only answer if multiple results consistently point
to the same manufacturer."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You identify industrial part manufacturers from search results. "
                               "Be conservative — return null rather than guess.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=50,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response.choices[0].message.content)
        brand = parsed.get("brand")
        return brand.strip() if isinstance(brand, str) and brand.strip() else None
    except Exception as exc:
        logger.error("Brand lookup LLM error: %s", exc)
        return None


def identify_brand(part_number: str, notes: str = "") -> str | None:
    """
    Try to identify the manufacturer/brand of a part the client didn't
    explicitly name. Searches by part_number first; if that's inconclusive,
    falls back to searching the item's notes/description text instead —
    the same two-step approach an employee does manually on Google.

    Returns the brand name, or None if it can't be confidently determined.
    """
    if part_number:
        results = _search(f'"{part_number}" manufacturer OR brand OR datasheet')
        brand = _ask_llm_for_brand(part_number, results)
        if brand:
            logger.info("Brand identified via part number | part=%s -> brand=%s", part_number, brand)
            return brand

    if notes:
        results = _search(f'"{notes}" manufacturer OR brand')
        brand = _ask_llm_for_brand(notes, results)
        if brand:
            logger.info("Brand identified via notes | notes=%s -> brand=%s", notes[:60], brand)
            return brand

    logger.info(
        "Brand identification failed | part=%s notes=%s",
        part_number, (notes[:60] if notes else ""),
    )
    return None
