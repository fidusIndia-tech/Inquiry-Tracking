"""
vendor_reply/matcher.py
------------------------
Pulls the inquiry unique_code out of a vendor reply's subject line.

We always send vendor RFQs with a subject like:
    RFQ [FIAPL0000399] - SUMITOMO | ABC123
A reply keeps that tag through "Re:" prefixing and forwarding in virtually
every mail client, so this is the primary match signal — far more reliable
than Gmail thread_id, which breaks if the vendor starts a new thread or a
colleague replies from a different one.
"""

import re

_CODE_RE = re.compile(r"\[([A-Z]{2,}\d{4,})\]")


def match_inquiry_code(subject: str | None) -> str | None:
    if not subject:
        return None
    m = _CODE_RE.search(subject)
    return m.group(1) if m else None
