"""
next_api_client.py
------------------
Small HTTP client for sending extracted RFQs to the Next.js backend.
"""

import json
import urllib.error
import urllib.request

from config import get_settings

settings = get_settings()


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
