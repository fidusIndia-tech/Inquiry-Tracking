"""
gmail_service.py  (flat-import edition)
"""

import base64
import re
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
from typing import Generator
from googleapiclient.errors import HttpError
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


def fetch_message_ids(service, max_results: int | None = None) -> list[dict]:
    max_results = max_results or settings.GMAIL_FETCH_MAX_RESULTS
    messages: list[dict] = []
    page_token: str | None = None

    logger.info("Fetching up to %d message IDs…", max_results)

    while True:
        kwargs: dict = {
            "userId": "me",
            "maxResults": min(200, max_results - len(messages)),
            "labelIds": ["INBOX"],
            "q": "in:inbox -in:sent -in:drafts -in:trash -in:spam",
        }
        if page_token:
            kwargs["pageToken"] = page_token

        response = service.users().messages().list(**kwargs).execute()
        batch = response.get("messages", [])
        messages.extend(batch)
        page_token = response.get("nextPageToken")

        if not page_token or len(messages) >= max_results:
            break

    logger.info("Total message IDs fetched: %d", len(messages))
    return messages


def chunk_messages(
    messages: list[dict],
    chunk_size: int | None = None,
) -> Generator[list[dict], None, None]:
    chunk_size = chunk_size or settings.GMAIL_CHUNK_SIZE
    for i in range(0, len(messages), chunk_size):
        yield messages[i : i + chunk_size]


def get_full_message(service, msg_id: str) -> dict:
    return (
        service.users()
        .messages()
        .get(userId="me", id=msg_id, format="full")
        .execute()
    )


def is_processable_inbox_message(raw: dict) -> bool:
    labels = set(raw.get("labelIds") or [])
    blocked = {"SENT", "DRAFT", "TRASH", "SPAM"}
    return "INBOX" in labels and labels.isdisjoint(blocked)


def mark_as_spam(service, msg_id: str) -> None:
    """Move a message out of the inbox into Gmail Spam. Requires gmail.modify scope."""
    service.users().messages().modify(
        userId="me",
        id=msg_id,
        body={"addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX", "UNREAD"]},
    ).execute()


class HistoryExpiredError(Exception):
    """Gmail returned 404 for the historyId — it is too old (Gmail keeps ~30 days)."""


def fetch_new_message_ids_from_history(
    service,
    start_history_id: str,
) -> tuple[list[dict], str | None]:
    """
    Return only messages *added* to the mailbox since `start_history_id`.

    Returns:
        new_messages      – list of {"id": msg_id} stubs (deduped)
        latest_history_id – newest historyId from the response; save as next checkpoint.
                            None only when the history response is completely empty.

    Raises:
        HistoryExpiredError – historyId is too old; caller must re-seed from profile.
        HttpError           – any other Gmail API error.
    """
    messages: list[dict] = []
    latest_history_id: str | None = None
    page_token: str | None = None

    try:
        while True:
            kwargs: dict = {
                "userId": "me",
                "startHistoryId": start_history_id,
                "historyTypes": ["messageAdded"],
                "labelId": "INBOX",
            }
            if page_token:
                kwargs["pageToken"] = page_token

            resp = service.users().history().list(**kwargs).execute()

            if resp.get("historyId"):
                latest_history_id = str(resp["historyId"])

            for record in resp.get("history", []):
                for added in record.get("messagesAdded", []):
                    msg_id = added.get("message", {}).get("id")
                    if msg_id:
                        messages.append({"id": msg_id})

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    except HttpError as exc:
        if exc.resp.status == 404:
            raise HistoryExpiredError(
                f"historyId {start_history_id!r} has expired. "
                "Call /start-fetch?reseed=true to re-seed."
            ) from exc
        raise

    # Deduplicate — the same message can appear in multiple history records
    seen: set[str] = set()
    unique: list[dict] = []
    for m in messages:
        if m["id"] not in seen:
            seen.add(m["id"])
            unique.append(m)

    logger.info(
        "History API | start=%s latest=%s new_msgs=%d",
        start_history_id, latest_history_id, len(unique),
    )
    return unique, latest_history_id


def _normalize_to_addresses(raw: str) -> str:
    """
    Accept one or more email addresses separated by spaces, commas, or
    semicolons and return a clean comma-separated address list suitable for
    a MIME To header. Raises ValueError if no valid address is found.
    """
    parts = re.split(r"[\s,;]+", raw.strip())
    valid = [addr for _, addr in (parseaddr(p) for p in parts if p) if addr]
    if not valid:
        raise ValueError(f"Invalid or empty 'to' address: {raw!r}")
    return ", ".join(valid)


def send_message(
    service,
    to: str,
    subject: str,
    html_body: str,
    thread_id: str | None = None,
    in_reply_to_rfc_message_id: str | None = None,
    attachments: list[dict] | None = None,
    # Legacy single-attachment params — kept for callers that pass a PDF
    attachment_filename: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_mime_type: str = "application/pdf",
) -> dict:
    """
    Send an HTML email via the Gmail API, optionally with file(s) attached.

    `attachments` is a list of dicts: [{filename, bytes, mime_type}].
    The legacy single-attachment params are still accepted and merged in.

    Pass thread_id + in_reply_to_rfc_message_id when following up on a
    previously sent message (reminders) so the new mail threads correctly
    in the recipient's inbox instead of arriving as an unrelated email.

    Returns {"id": <gmail message id>, "thread_id": <gmail thread id>}.
    """
    clean_to = _normalize_to_addresses(to)

    # Merge legacy single-attachment params into the list
    all_attachments: list[dict] = list(attachments or [])
    if attachment_filename and attachment_bytes:
        all_attachments.insert(0, {
            "filename": attachment_filename,
            "bytes": attachment_bytes,
            "mime_type": attachment_mime_type,
        })

    has_attachments = bool(all_attachments)
    msg = MIMEMultipart("mixed") if has_attachments else MIMEMultipart("alternative")
    msg["To"] = clean_to
    msg["Subject"] = subject
    if in_reply_to_rfc_message_id:
        msg["In-Reply-To"] = in_reply_to_rfc_message_id
        msg["References"] = in_reply_to_rfc_message_id

    if has_attachments:
        body_part = MIMEMultipart("alternative")
        body_part.attach(MIMEText(html_body, "html"))
        msg.attach(body_part)

        for att in all_attachments:
            mime_type = att.get("mime_type", "application/octet-stream")
            main_type, _, sub_type = mime_type.partition("/")
            part = MIMEBase(main_type, sub_type or "octet-stream")
            part.set_payload(att["bytes"])
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=att["filename"])
            msg.attach(part)
    else:
        msg.attach(MIMEText(html_body, "html"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    body: dict = {"raw": raw}
    if thread_id:
        body["threadId"] = thread_id

    sent = service.users().messages().send(userId="me", body=body).execute()
    return {"id": sent.get("id"), "thread_id": sent.get("threadId")}


def get_rfc_message_id(service, message_id: str) -> str | None:
    """
    Fetch the RFC 822 Message-ID header for a just-sent message — needed as
    the In-Reply-To value when sending a reminder in the same thread.
    """
    msg = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="metadata", metadataHeaders=["Message-ID"])
        .execute()
    )
    headers = msg.get("payload", {}).get("headers", [])
    for h in headers:
        if h.get("name", "").lower() == "message-id":
            return h.get("value")
    return None


def parse_headers(email_data: dict) -> dict:
    headers = email_data.get("payload", {}).get("headers", [])
    header_map = {h["name"].lower(): h["value"] for h in headers}
    return {
        "subject": header_map.get("subject", "(no subject)"),
        "from":    header_map.get("from", ""),
        "to":      header_map.get("to", ""),
        "date":    header_map.get("date", ""),
    }
