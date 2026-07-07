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
    # Prefer the dedicated vendor outreach mailbox (rfq@fidusindia.com).
    # Fall back to the client mailbox if vendor mailbox is not yet configured,
    # so PO sends work even before rfq@fidusindia.com is authorized.
    user_id = settings.VENDOR_MAILBOX_USER_ID or settings.CLIENT_MAILBOX_USER_ID
    if not user_id:
        raise VendorMailboxNotConfigured(
            "No mailbox configured for sending vendor emails. "
            "Set VENDOR_MAILBOX_USER_ID=rfq@fidusindia.com in Railway env vars "
            "and authorize it via /login?mailbox=vendor first."
        )
    return get_gmail_service_for_user(user_id)


def send_vendor_rfq(
    unique_code: str,
    vendor_email: str,
    subject: str,
    body: str,
    attachments: list[dict] | None = None,
) -> dict:
    """
    Send a fresh RFQ to a vendor, optionally with file attachments.
    `attachments` is [{filename, bytes, mime_type}].
    Returns the ids needed to later match a reply (thread_id) and thread
    a reminder correctly (rfc_message_id).
    """
    service = _vendor_service()
    sent = send_message(
        service,
        to=vendor_email,
        subject=subject,
        html_body=body,
        attachments=attachments,
    )
    rfc_message_id = get_rfc_message_id(service, sent["id"])

    logger.info(
        "Vendor RFQ sent | unique_code=%s | to=%s | message_id=%s | thread_id=%s | attachments=%d",
        unique_code, vendor_email, sent["id"], sent["thread_id"], len(attachments or []),
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
    reminder_number: int = 1,
) -> dict:
    """
    Send reminder N (1/2/3) in the same Gmail thread as the original RFQ.
    Subject is always Re: <original> for correct threading; the body and
    a brief label in the intro vary by reminder number.
    """
    service = _vendor_service()
    reminder_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"

    if reminder_number == 1:
        intro = "This is a gentle follow-up on the RFQ below — we have not yet received your offer."
        final_note = ""
    elif reminder_number == 2:
        intro = "We are following up again on the RFQ below and are still awaiting your quotation."
        final_note = ""
    else:
        intro = "This is our final reminder for the RFQ below. We are still awaiting your best offer."
        final_note = "<p>Please note that this is our final reminder for this requirement.</p>\n  "

    reminder_body = f"""<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">
  <p>Dear Team,</p>
  <p>{intro}</p>
  <p>Kindly share your best price, availability, and lead time at the earliest convenience.</p>
  {final_note}<p>Warm regards,<br/>FIAPL Procurement Team<br/>Fidus India Pvt. Ltd.</p>
</div>""".strip()

    sent = send_message(
        service,
        to=vendor_email,
        subject=reminder_subject,
        html_body=reminder_body,
        thread_id=thread_id,
        in_reply_to_rfc_message_id=rfc_message_id,
    )
    logger.info(
        "Vendor reminder %d sent | to=%s | thread_id=%s | message_id=%s",
        reminder_number, vendor_email, thread_id, sent["id"],
    )
    return {"message_id": sent["id"], "thread_id": sent["thread_id"]}
