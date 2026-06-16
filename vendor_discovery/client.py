"""
vendor_discovery/client.py
---------------------------
HTTP client: posts discovered vendor data to the Next.js vendor API.
Follows the same pattern as next_api_client.py.
"""

import json
import urllib.request
import urllib.error
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
