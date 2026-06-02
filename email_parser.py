"""
email_parser.py
---------------
Extracts every useful field from a raw Gmail API message object.

Gmail message structure:
  {
    "id": "...",
    "threadId": "...",
    "labelIds": ["INBOX", "UNREAD"],
    "snippet": "preview text...",
    "payload": {
      "headers": [{"name": "Subject", "value": "..."}, ...],
      "mimeType": "multipart/mixed" | "text/plain" | "text/html" | ...,
      "parts": [                        ← present for multipart messages
        {
          "mimeType": "text/plain",
          "body": {"data": "<base64>"}
        },
        {
          "mimeType": "text/html",
          "body": {"data": "<base64>"}
        },
        {
          "mimeType": "application/pdf",    ← attachment
          "filename": "invoice.pdf",
          "body": {"attachmentId": "..."}
        }
      ],
      "body": {"data": "<base64>"}      ← present for single-part messages
    }
  }
"""

import base64
import quopri
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Optional

from logging_setup import get_logger

logger = get_logger(__name__)


# ── Public entry point ────────────────────────────────────────────────────────

def parse_email(raw: dict, user_id: str) -> dict:
    """
    Convert a raw Gmail API message dict into a flat dict ready to be
    stored in the Email table.

    Returns a dict matching Email column names.
    """
    payload  = raw.get("payload", {})
    headers  = _extract_headers(payload.get("headers", []))
    plain, html = _extract_body(payload)

    label_ids     = raw.get("labelIds", [])
    has_attachment = _has_attachment(payload)

    date_parsed: Optional[datetime] = None
    if headers.get("date"):
        try:
            date_parsed = parsedate_to_datetime(headers["date"]).replace(tzinfo=None)
        except Exception:
            pass  # malformed Date header — leave as None

    return {
        "message_id":    raw["id"],
        "thread_id":     raw.get("threadId"),
        "user_id":       user_id,
        "subject":       headers.get("subject"),
        "sender":        headers.get("from"),
        "recipient":     headers.get("to"),
        "date_str":      headers.get("date"),
        "date_parsed":   date_parsed,
        "snippet":       raw.get("snippet"),
        "body_plain":    plain,
        "body_html":     html,
        "label_ids":     ",".join(label_ids),
        "is_unread":     "UNREAD" in label_ids,
        "has_attachment": has_attachment,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_headers(headers: list[dict]) -> dict:
    """Return a lowercase-keyed dict of the headers we care about."""
    keep = {"subject", "from", "to", "date", "cc", "bcc", "message-id"}
    result = {}
    for h in headers:
        key = h.get("name", "").lower()
        if key in keep:
            result[key] = h.get("value", "")
    return result


def _decode_part(part: dict) -> Optional[str]:
    """Base64-decode a message part's body data."""
    data = part.get("body", {}).get("data")
    if not data:
        return None
    try:
        # Gmail uses URL-safe base64
        decoded_bytes = base64.urlsafe_b64decode(data + "==")
        return decoded_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        logger.debug("Failed to decode part: %s", exc)
        return None


def _extract_body(payload: dict) -> tuple[Optional[str], Optional[str]]:
    """
    Walk the MIME tree and extract text/plain and text/html bodies.
    Handles nested multipart/alternative, multipart/mixed, etc.
    Returns (plain_text, html_text).
    """
    plain: Optional[str] = None
    html:  Optional[str] = None

    def walk(part: dict):
        nonlocal plain, html
        mime = part.get("mimeType", "")

        if mime == "text/plain" and plain is None:
            plain = _decode_part(part)

        elif mime == "text/html" and html is None:
            html = _decode_part(part)

        # Recurse into multipart/* containers
        for subpart in part.get("parts", []):
            walk(subpart)

    walk(payload)
    return plain, html


def _has_attachment(payload: dict) -> bool:
    """Return True if any part of the message is a non-inline attachment."""
    def walk(part: dict) -> bool:
        # If it has a filename and an attachmentId it's a real attachment
        if part.get("filename") and part.get("body", {}).get("attachmentId"):
            return True
        return any(walk(p) for p in part.get("parts", []))

    return walk(payload)
