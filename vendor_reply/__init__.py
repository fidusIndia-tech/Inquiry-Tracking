"""
vendor_reply
-------------
Handles incoming mail on the dedicated vendor-outreach mailbox.

Every RFQ we send embeds the inquiry's unique_code in the subject as
"[FIAPL0000399]". Subject-tag matching is the primary signal for routing a
reply — it survives "Re:" prefixing, forwarding, and most mail clients,
unlike relying on Gmail thread_id alone (which breaks if the vendor doesn't
hit "Reply" in the exact same thread).

Public API:
    match_inquiry_code(subject) -> str | None
    extract_quote(body, items_hint) -> list[dict]
"""

from .matcher import match_inquiry_code
from .extractor import extract_quote

__all__ = ["match_inquiry_code", "extract_quote"]
