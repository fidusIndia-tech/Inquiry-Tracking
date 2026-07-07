"""
vendor_outreach
----------------
Sends vendor RFQ drafts and reminder follow-ups through the single dedicated
vendor-outreach mailbox (config.VENDOR_MAILBOX_USER_ID). Centralizing all
vendor mail through one mailbox — instead of the 12-13 individual employee
mailboxes — keeps the reply-matching pipeline simple: there is exactly one
inbox to poll for vendor price replies.

Public API:
    send_vendor_rfq(unique_code, vendor_email, subject, body) -> dict
    send_vendor_reminder(vendor_email, subject, thread_id, rfc_message_id) -> dict
"""

from .sender import send_vendor_rfq, send_vendor_reminder

__all__ = ["send_vendor_rfq", "send_vendor_reminder"]
