"""
vendor_outreach/sender.py
--------------------------
Thin wrapper around gmail_service.send_message bound to the one dedicated
vendor-outreach mailbox. Every caller goes through here so there is a single
place that knows which Gmail account vendor mail is sent from.
"""

from config import get_settings
from gmail_auth import get_gmail_service_for_user
from gmail_service import send_message, get_rfc_message_id
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


class VendorMailboxNotConfigured(Exception):
    """Raised when VENDOR_MAILBOX_USER_ID is unset or not yet authorized."""


def _vendor_service():
    if not settings.VENDOR_MAILBOX_USER_ID:
        raise VendorMailboxNotConfigured(
            "VENDOR_MAILBOX_USER_ID is not set. Authorize the vendor mailbox "
            "via /login?mailbox=vendor first, then set its email as "
            "VENDOR_MAILBOX_USER_ID."
        )
    return get_gmail_service_for_user(settings.VENDOR_MAILBOX_USER_ID)


def send_vendor_rfq(unique_code: str, vendor_email: str, subject: str, body: str) -> dict:
    """
    Send a fresh RFQ to a vendor. Returns the ids needed to later match a
    reply (thread_id) and thread a reminder correctly (rfc_message_id).
    """
    service = _vendor_service()
    sent = send_message(service, to=vendor_email, subject=subject, html_body=body)
    rfc_message_id = get_rfc_message_id(service, sent["id"])

    logger.info(
        "Vendor RFQ sent | unique_code=%s | to=%s | message_id=%s | thread_id=%s",
        unique_code, vendor_email, sent["id"], sent["thread_id"],
    )
    return {
        "message_id": sent["id"],
        "thread_id": sent["thread_id"],
        "rfc_message_id": rfc_message_id,
    }


def send_vendor_reminder(
    vendor_email: str,
    subject: str,
    thread_id: str,
    rfc_message_id: str | None,
) -> dict:
    """
    Send a polite follow-up in the same Gmail thread as the original RFQ.
    """
    service = _vendor_service()
    reminder_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    reminder_body = """
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">
  <p>Dear Team,</p>
  <p>This is a gentle follow-up on the RFQ below — we have not yet received your offer.</p>
  <p>Kindly share your best price and lead time at the earliest convenience.</p>
  <p>Warm regards,<br/>FIAPL Procurement Team<br/>Fidus India Pvt. Ltd.</p>
</div>
""".strip()

    sent = send_message(
        service,
        to=vendor_email,
        subject=reminder_subject,
        html_body=reminder_body,
        thread_id=thread_id,
        in_reply_to_rfc_message_id=rfc_message_id,
    )
    logger.info(
        "Vendor reminder sent | to=%s | thread_id=%s | message_id=%s",
        vendor_email, thread_id, sent["id"],
    )
    return {"message_id": sent["id"], "thread_id": sent["thread_id"]}
