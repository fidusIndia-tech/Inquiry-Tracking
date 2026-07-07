"""
vendor_discovery/client.py
---------------------------
HTTP client: posts discovered vendor data to the Next.js vendor API.
Follows the same pattern as next_api_client.py.
"""

import json
import urllib.request
import urllib.error
import urllib.parse
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)

def _vendors_url() -> str:
    base = getattr(get_settings(), "NEXT_VENDORS_API_URL",
                   "http://localhost:3000/api/parser/vendors")
    return base


def post_vendor(payload: dict) -> dict:
    """POST vendor data to Next.js. Raises ConnectionError on network failure."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        _vendors_url(),
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise ConnectionError(f"Vendor API unreachable: {exc.reason}") from exc
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Vendor API HTTP {exc.code}: {body}") from exc


def get_brand_status(brand: str) -> dict:
    """
    Returns {"count": int, "last_discovered_at": str|None} for a brand —
    used to decide whether a fresh SearchApi.io search is worth paying for.
    """
    settings = get_settings()
    url = f"{settings.NEXT_VENDORS_BRAND_STATUS_API_URL}?brand={urllib.parse.quote(brand)}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.warning("Brand status check failed for %s: %s", brand, exc)
        return {"count": 0, "last_discovered_at": None}


def link_brand_vendors_to_inquiry(brand: str, part_number: str, inquiry_unique_code: str) -> dict:
    """
    Links every vendor already known for `brand` to a new inquiry, without
    running a fresh search. Used when get_brand_status shows the brand was
    searched within the cooldown window.
    """
    settings = get_settings()
    data = json.dumps({
        "brand": brand,
        "part_number": part_number,
        "inquiry_unique_code": inquiry_unique_code,
    }).encode("utf-8")
    req = urllib.request.Request(
        settings.NEXT_VENDORS_LINK_API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.error("Linking existing vendors failed for brand=%s: %s", brand, exc)
        return {"linked": 0, "candidates": 0}
