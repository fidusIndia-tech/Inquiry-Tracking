"""
next_api_client.py
------------------
Small HTTP client for sending extracted RFQs to the Next.js backend.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

from config import get_settings
from logging_setup import get_logger

settings = get_settings()
logger = get_logger(__name__)


def post_rfq_item(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        settings.NEXT_PARSER_API_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Next parser API failed with HTTP {error.code}: {detail}"
        ) from error
    except urllib.error.URLError as error:
        # Network/timeout errors — re-raise as ConnectionError so Celery retries
        raise ConnectionError(f"Next parser API unreachable: {error.reason}") from error


def post_reminder_item(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        settings.NEXT_REMINDERS_API_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Reminders API failed with HTTP {error.code}: {detail}"
        ) from error
    except urllib.error.URLError as error:
        raise ConnectionError(f"Reminders API unreachable: {error.reason}") from error


def get_inquiries() -> dict:
    with urllib.request.urlopen(settings.NEXT_INQUIRIES_API_URL, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def get_blocked_emails() -> set[str]:
    """Lowercased sender emails the admin has blocked. Inquiries from these
    addresses are dropped before parsing/LLM extraction even runs."""
    with urllib.request.urlopen(settings.NEXT_BLOCKED_CLIENTS_API_URL, timeout=15) as response:
        data = json.loads(response.read().decode("utf-8"))
        return {
            row["sender_email"].strip().lower()
            for row in data.get("blocked", [])
            if row.get("sender_email")
        }


def _request(url: str, payload: dict | None, method: str) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{url} failed with HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise ConnectionError(f"{url} unreachable: {error.reason}") from error


def patch_draft(draft_id: int, **fields) -> dict:
    """Update any subset of vendor_drafts columns (status, thread_id, etc.)."""
    return _request(settings.NEXT_DRAFTS_API_URL, {"id": draft_id, **fields}, "PATCH")


def get_drafts_for_inquiry(unique_code: str) -> list[dict]:
    url = f"{settings.NEXT_DRAFTS_API_URL}?unique_code={urllib.parse.quote(unique_code)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
        return data.get("drafts", [])


def get_stale_drafts(hours: int) -> list[dict]:
    url = f"{settings.NEXT_DRAFTS_STALE_API_URL}?hours={hours}"
    with urllib.request.urlopen(url, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
        return data.get("drafts", [])


def post_vendor_quote(payload: dict) -> dict:
    return _request(settings.NEXT_QUOTES_API_URL, payload, "POST")


def post_discovery_progress(unique_code: str, **fields) -> None:
    """
    Best-effort progress update for the on-demand vendor discovery run, so
    the Vendors tab can show a live progress bar instead of a blind spinner.
    Never raises — a failed status update is a UX nuisance, not a reason to
    fail the actual discovery work.
    """
    try:
        _request(
            settings.NEXT_VENDORS_DISCOVERY_PROGRESS_API_URL,
            {"unique_code": unique_code, **fields},
            "POST",
        )
    except Exception as exc:
        logger.warning("Failed to post discovery progress | %s: %s", unique_code, exc)


def save_identified_brand(unique_code: str, part_number: str, brand: str) -> dict:
    """Persists a brand the client never stated but brand_lookup figured out
    from the part number/notes, tagged so the UI shows it as auto-detected."""
    return _request(
        settings.NEXT_INQUIRY_ITEMS_API_URL,
        {"unique_code": unique_code, "part_number": part_number, "brand": brand, "source": "auto"},
        "PATCH",
    )
