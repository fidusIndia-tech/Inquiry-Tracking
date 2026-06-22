"""
client_outreach
-----------------
Sends the final client-facing quotation through the single dedicated
client-reply mailbox (config.CLIENT_MAILBOX_USER_ID — typically
sales@fidusindia.com), replying in the original inquiry's Gmail thread.

Public API:
    send_client_quote(client_email, subject, body, thread_id, in_reply_to_message_id) -> dict
"""

from .sender import send_client_quote

__all__ = ["send_client_quote"]
