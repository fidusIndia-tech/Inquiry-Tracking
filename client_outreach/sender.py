"""
client_outreach/sender.py
--------------------------
Thin wrapper around gmail_service.send_message bound to the one dedicated
client-reply mailbox. Threads the quotation as a reply to the original
inquiry email so it lands in the same conversation the client started.
"""

from config import get_settings
from gmail_auth import get_gmail_service_for_user
from gmail_service import send_message, get_rfc_message_id
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


class ClientMailboxNotConfigured(Exception):
    """Raised when CLIENT_MAILBOX_USER_ID is unset or not yet authorized."""


def _client_service():
    if not settings.CLIENT_MAILBOX_USER_ID:
        raise ClientMailboxNotConfigured(
            "CLIENT_MAILBOX_USER_ID is not set. Authorize the client-reply "
            "mailbox via /login?mailbox=client first, then set its email as "
            "CLIENT_MAILBOX_USER_ID."
        )
    return get_gmail_service_for_user(settings.CLIENT_MAILBOX_USER_ID)


def send_client_quote(
    client_email: str,
    subject: str,
    body: str,
    thread_id: str | None = None,
    in_reply_to_message_id: str | None = None,
) -> dict:
    """
    in_reply_to_message_id is the Gmail API message id of the ORIGINAL client
    RFQ email (not an RFC822 Message-ID) — we look up its Message-ID header
    here so the quote threads correctly in the client's inbox.
    """
    service = _client_service()
    rfc_message_id = (
        get_rfc_message_id(service, in_reply_to_message_id)
        if in_reply_to_message_id
        else None
    )
    quote_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"

    sent = send_message(
        service,
        to=client_email,
        subject=quote_subject,
        html_body=body,
        thread_id=thread_id,
        in_reply_to_rfc_message_id=rfc_message_id,
    )
    logger.info(
        "Client quote sent | to=%s | thread_id=%s | message_id=%s",
        client_email, thread_id, sent["id"],
    )
    return {"message_id": sent["id"], "thread_id": sent["thread_id"]}
