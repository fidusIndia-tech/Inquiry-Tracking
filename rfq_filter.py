"""
rfq_filter.py
-------------
Layer 1: Fast rule-based filter.
Runs BEFORE calling the LLM — eliminates obvious non-RFQs for free.

Returns True if the email is worth sending to the LLM.

Pipeline (short-circuits on first match):
  1. Hard-drop known spam/marketing sender domains
  2. Hard-drop by subject pattern
  3. Hard-drop Google system emails
  4. Hard-drop seller/newsletter signals  — checked against BOTH plain AND HTML body
  5. Fast-accept strong RFQ signals in subject
  6. Fast-accept strong RFQ signals in body
  7. Default uncertain → forward to LLM (Layer 2)

Critical: HTML-only emails (newsletters, supplier blasts) have empty body_plain.
Step 4 therefore strips body_html tags and checks that too, so unsubscribe links,
"view in browser", "our main range", etc. are always caught.
"""

import re
from logging_setup import get_logger

logger = get_logger(__name__)

INTERNAL_FIDUS_SENDER_RE = re.compile(
    r"(?:^|<|\s)(?:fidusindia\d*@gmail\.com|[A-Z0-9._%+-]+@fidusindia\.com)(?:>|\s|$)",
    re.IGNORECASE,
)

FORWARDED_MARKER_RE = re.compile(
    r"(?im)^[-\s]*(forwarded\s+message|begin\s+forwarded\s+message|original\s+message)[-\s]*$",
    re.IGNORECASE,
)

FORWARDED_HEADER_RE = re.compile(
    r"(?is)\bfrom:\s*.+?\b(?:sent|date):\s*.+?\bto:\s*.+?\b(?:cc:\s*.+?)?\bsubject:\s*",
)

# ── Hard-drop: numbered/logistics Fidus addresses (never client inquiries) ───
# fidusindia1-19@gmail.com are internal shared accounts; scm@fidusindia.com is logistics team.
ALWAYS_DROP_SENDER_ADDRS = frozenset({
    "scm@fidusindia.com",
})
_ALWAYS_DROP_NUMBERED_RE = re.compile(
    r"(?:^|<|\s)fidusindia(?:[1-9]|1[0-9])@gmail\.com(?:>|\s|$)",
    re.IGNORECASE,
)

# ── Priority senders: admin / purchase-head / trusted employees forwarding RFQs
# These bypass all filters and are accepted unconditionally.
PRIORITY_SENDER_ADDRS = frozenset({
    "fidusindia@gmail.com",
    "purchasehead@gmail.com",
    "purchase.head@fidusindia.com",
    "fidusindia7@gmail.com",        # Bharti — forwards client RFQs
})

# ── Sender domains that are NEVER RFQs ───────────────────────────────────────
SPAM_DOMAINS = {
    "machinebidder.com", "fluidhandlingpro.com", "netlabindia.com",
    "valvesonline.co.uk", "springerpumps.com", "machineryandequipment.com",
    "mailer.sirus.in", "email.pilotjohn.com", "elgiaircompressors.com",
    "trackso.in", "bjhengrui.cn", "wtwhmedia.com", "soselectronic.com",
    "mksinst.com", "ccsend.com", "mailchimpapp.com", "shared1.ccsend.com",
    "cx.endress.com", "smcelectric.com", "inform.wtwhmedia.com",
    # confirmed marketing/spam senders
    "zitong360.com", "apacfan.com", "china-power-contractor.cn",
    # bulk e-procurement platforms (spam volume)
    "vend-x.com", "mail.vend-x.com",
}

# ── Subject line patterns → NOT an RFQ ──────────────────────────────────────
REJECT_SUBJECT_PATTERNS = [
    # ── Purchase order / order confirmation (not an inbound RFQ) ─────────────
    r"purchase\s+order",                         # "Purchase Order #1234"
    r"\bpo\s*(?:no\.?|number|#|num\.?)[\s.:/#-]*\d",  # "PO No. 5678"
    r"order\s+confirmation",                     # "Order Confirmation"
    # generic non-RFQ content
    r"unsubscribe", r"newsletter", r"webinar", r"auction",
    r"sale closes",
    r"happy\s+(monday|friday|ganesh|krishna|independence|ganpati)",
    r"weekly e-update", r"technology focus", r"market focus",
    r"upcoming.*auction", r"ends in \d+ hour",
    r"congratulations", r"invitation", r"expo 20\d\d",
    # supplier/marketing subjects
    r"how to choose",                       # "How to choose a supplier"
    r"from china",                          # "Spare Part from China"
    r"competitive.*supplier",
    r"reliable.*supplier",
    r"solutions?:\s",                       # "Siemens Solutions: Advanced PLCs…"
    r"advanced\s+plc",
    r"introducing\s+our",
    r"exclusive\s+(offer|deal|discount)",
    r"new\s+product",
    r"product\s+(catalog|catalogue|brochure)",
    r"price\s+list",                        # "Price List 2024"
    r"promotion",
    r"e.?catalog",
    r"new\s+arrival",
    r"special\s+offer",
    r"hot\s+sale",
    r"good\s+price",
]

# ── Seller / newsletter signals in the body ───────────────────────────────────
# Checked against plain text AND stripped HTML, so HTML-only emails are caught.
# Each phrase here is unambiguous seller language — none appear in genuine RFQs.
SELLER_BODY_SIGNALS = [
    # ── Newsletter / HTML email markers ──────────────────────────────────
    "unsubscribe",
    "view in browser",
    "view this email in",
    "click here to unsubscribe",
    "to unsubscribe from",

    # ── Supplier product promotion ────────────────────────────────────────
    "our main range",
    "our main products",
    "our main business",
    "our products include",
    "our product line",
    "our product range",

    # ── Seller offering supply ────────────────────────────────────────────
    "we can supply",
    "we are a supplier",
    "we are supplier",
    "we supply",
    "we stock",

    # ── Chinese supplier outreach ─────────────────────────────────────────
    "produced in china",
    "manufactured in china",
    "made in china",
    "spare part from china",
    "gearbox from china",
    "factory in china",
    "wechat:",                  # Chinese supplier contact detail

    # ── Seller soliciting enquiries ───────────────────────────────────────
    "if interested, pls",
    "if interested, please",
    "pls send us email",
    # "please send us your" was too broad — genuine buyers write "please send us your
    # best offer", matching this incorrectly. Kept the unambiguous seller variant below.
    "send us your requirement",

    # ── Price promotion ───────────────────────────────────────────────────
    "with good discount",
    "can provide competitive",
    "provide competitive price",
    "good price",

    # ── Mass-email openers used by Chinese suppliers ──────────────────────
    "glad to know you are in our",
    "you are in our customer list",
    "thanks for your supports",
    "we will quote good price",
    "reply me now we will",
]

# ── Logistics / post-order signals → drop when found in reply new content ────
# These indicate order-fulfillment/transport operations, not RFQ follow-ups.
LOGISTICS_BODY_SIGNALS = [
    "transport id",
    "transporter id",
    "e-way bill",
    "ewaybill",
    "docket no",
    "docket number",
    "arrange the pickup",
    "pick-up request",
    "case number is",
]

# ── Keywords that STRONGLY suggest an inbound RFQ ────────────────────────────
RFQ_SUBJECT_KEYWORDS = [
    "rfq", "request for quotation", "request for quote",
    "quotation", "quote", "pricing", "price inquiry",
    "enquiry", "inquiry",
    "requirement", "requirment",
    # more specific spare-part requests (bare "spare" removed — too generic)
    "spare parts required", "spare parts needed", "spare parts enquiry",
    "quotation req", "rate inquiry", "rate request",
    # NOTE: "re:" and "fwd:" removed — reply/forward chains go to LLM classifier
    # which distinguishes genuine new RFQs from reminders/follow-ups.
]

RFQ_BODY_KEYWORDS = [
    # buyer-specific request phrases
    "please quote", "please provide", "kindly quote", "kindly provide",
    "share quotation", "share quote",
    "provide rates", "provide rate",
    "arrange the quotation", "arrange quotation",
    # part identification (buyer listing what they need)
    "part number", "part no", "p/n", "pn:", "model no", "model number",
    "article no", "article number",
    # quantity markers in purchase context
    "qty", "nos.",
    "units required",
    # attachment references from buyer
    "see attachment", "refer attachment",
    "techno commercial offer",          # Polycab-specific opener
]

FRESH_REPLY_RFQ_KEYWORDS = [
    "please quote", "kindly quote", "quote for", "quotation for",
    "new requirement", "below requirement", "required qty", "required quantity",
    "please send offer", "send your offer", "share quotation", "share quote",
]

PART_LIKE_RE = re.compile(
    r"\b(?:part\s*(?:no|number)|p/n|model\s*(?:no|number)|qty|quantity|uom)\b|"
    r"\b[A-Z0-9]{2,}[-/][A-Z0-9][A-Z0-9-/]{2,}\b",
    re.IGNORECASE,
)

REPLY_FOLLOWUP_RE = re.compile(
    r"\b("
    r"follow\s*up|gentle\s+follow|reminder|please\s+confirm|kindly\s+confirm|"
    r"confirm\s+(?:delivery|lead|price|availability|technical|pumping|working)|"
    r"delivery\s+(?:date|status|time)|lead\s*time|status\s+update|any\s+update|"
    r"working\s+temperature|pumping\s+medium|"
    r"revised\s+quotation|technical\s+datasheet|data\s+sheet|commercial\s+offer|"
    r"please\s+find\s+(?:the\s+)?(?:attached|enclosed)|attached\s+(?:quotation|quote|offer)|"
    r"enclosed\s+(?:quotation|quote|offer)|submit\s+our\s+commercial\s+offer|"
    r"we\s+are\s+pleased\s+to\s+submit|offer\s+for\s+your\s+kind\s+perusal|"
    r"quotation\s+with\s+technical|quote\s+with\s+technical|revised\s+quote|"
    r"find\s+the\s+revised\s+quotation|find\s+attached\s+(?:quotation|quote|offer)|"
    r"please\s+revert|kindly\s+revert|"
    r"please\s+expedite|kindly\s+expedite|"
    r"still\s+awaiting|pending\s+(?:from\s+your\s+)?(?:side|end)|"
    r"update\s+(?:required|needed)|no\s+response\s+(?:received|from\s+your\s+side)"
    r")\b",
    re.IGNORECASE,
)

# ── Urgent-awaiting patterns: client chasing a quote, new content is short
# but the quoted chain holds the original 27+ item RFQ. Returning False from
# is_reply_chain_noise lets these through to the LLM so the extractor can
# pull the items. Fingerprint dedup in Next.js prevents duplicate inquiries.
URGENT_AWAITING_RE = re.compile(
    r"\b("
    r"awaiting\s+your\s+(?:reply|response|quote|quotation|qoutes?)|"
    r"awaiting\s+(?:reply|response)|"
    r"still\s+waiting\s+for\s+your\s+(?:reply|response|quote|quotation)|"
    r"we\s+(?:are\s+)?still\s+waiting\s+for\s+your|"
    r"we\s+have\s+not\s+(?:yet\s+)?received\s+your\s+(?:quotation|quote|response)|"
    r"not\s+yet\s+received\s+your\s+(?:quotation|quote)|"
    r"quotation\s+(?:still\s+)?awaited|"
    r"(?:please|kindly)\s+expedite\s+(?:the\s+)?quotation\s+submission|"
    r"request\s+you\s+to\s+share\s+your\s+best\s+price|"
    r"kindly\s+treat\s+this\s+as\s+urgent\s+and\s+provide|"
    r"pending\s+quotation\s+for|"
    r"urgent\s*[:\-]?\s*quotation\s+(?:still\s+)?awaited"
    r")\b",
    re.IGNORECASE,
)

_REJECT_RE   = re.compile("|".join(REJECT_SUBJECT_PATTERNS), re.IGNORECASE)
_SELLER_RE   = re.compile("|".join(re.escape(s) for s in SELLER_BODY_SIGNALS), re.IGNORECASE)
_LOGISTICS_RE = re.compile("|".join(re.escape(s) for s in LOGISTICS_BODY_SIGNALS), re.IGNORECASE)

# Patterns that mark the start of a quoted reply block
_QUOTE_START_RE = re.compile(
    r'^(>|\s*on .{5,80} wrote:\s*$|[-_]{4,}|from:.*sent:|-----original message)',
    re.IGNORECASE,
)


def _strip_quoted_reply(text: str) -> str:
    """
    Remove the quoted reply chain from an email body.
    Returns only the fresh top-of-email content the sender actually wrote.
    """
    if not text:
        return ""
    clean = []
    for line in text.split('\n'):
        if _QUOTE_START_RE.match(line.strip()):
            break
        clean.append(line)
    return '\n'.join(clean).strip()


def _extract_text(email_dict: dict) -> tuple[str, str]:
    """
    Return (body_plain, body_html_stripped) both lowercased.
    body_html_stripped is the HTML body with all tags removed — used to catch
    seller signals that live only in the HTML (unsubscribe links, etc.).
    """
    plain = (email_dict.get("body_plain") or "").lower()
    html_raw = email_dict.get("body_html") or ""
    if html_raw:
        stripped = re.sub(r'<[^>]+>', ' ', html_raw)
        stripped = re.sub(r'\s+', ' ', stripped).lower()
    else:
        stripped = ""
    return plain, stripped


def _latest_reply_text(body: str) -> str:
    markers = [
        r"(?im)^[-\s]*(forwarded\s+message|begin\s+forwarded\s+message|original\s+message)[-\s]*$",
        r"(?im)^from:\s*.+$",
        r"(?im)^on\s+.+\s+wrote:\s*$",
    ]
    cut_at = len(body)
    for pattern in markers:
        match = re.search(pattern, body)
        if match:
            cut_at = min(cut_at, match.start())
    return body[:cut_at].strip()


def is_reply_chain_noise(email_dict: dict) -> bool:
    subject = (email_dict.get("subject") or "").strip().lower()
    if not subject.startswith("re:"):
        return False
    if subject.startswith(("re: fwd:", "re: fw:")):
        return False

    plain, html_stripped = _extract_text(email_dict)
    body = plain if plain.strip() else html_stripped
    latest = _latest_reply_text(body)

    if not latest:
        return True

    latest_lower = latest.lower()
    has_fresh_request = any(keyword in latest_lower for keyword in FRESH_REPLY_RFQ_KEYWORDS)
    has_part_like_data = bool(PART_LIKE_RE.search(latest))
    has_followup_noise = bool(REPLY_FOLLOWUP_RE.search(latest))

    if has_fresh_request and has_part_like_data:
        return False

    if has_followup_noise:
        return True

    return not has_part_like_data


def is_rfq_candidate(email_dict: dict) -> bool:
    """
    Returns True  → pass to LLM (Layer 2)
    Returns False → discard immediately
    """
    sender  = (email_dict.get("sender")  or "").lower()
    subject = (email_dict.get("subject") or "").lower()

    _am = re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", sender)
    sender_addr = _am.group(0) if _am else ""

    # ── 0a. Priority senders: accept unconditionally (checked FIRST) ──────────
    # Must run before the always-drop so trusted numbered accounts like
    # fidusindia7@gmail.com are not killed by the numbered-account regex.
    if sender_addr in PRIORITY_SENDER_ADDRS:
        logger.debug("KEEP (priority sender) | %s | %s", sender, subject[:60])
        return True

    # ── 0b. Hard-drop specific internal Fidus addresses ──────────────────────
    if sender_addr in ALWAYS_DROP_SENDER_ADDRS or _ALWAYS_DROP_NUMBERED_RE.search(sender):
        logger.debug("DROP (internal always-drop) | %s | %s", sender, subject[:60])
        return False

    plain, html_stripped = _extract_text(email_dict)

    # For reply/forward chains, strip quoted content so old RFQ data in the
    # quoted block does not trigger a false fast-accept or a false seller drop.
    is_reply = subject.startswith(("re:", "fwd:", "fw:"))
    if is_reply:
        plain        = _strip_quoted_reply(plain)
        html_stripped = _strip_quoted_reply(html_stripped)

    # Use whichever source is richer — HTML-table emails have item data only in HTML.
    body = html_stripped if len(html_stripped) > len(plain) + 200 else (plain if plain else html_stripped)
    # combined source for seller signal detection (catches HTML-only emails)
    body_all = plain + " " + html_stripped

    if INTERNAL_FIDUS_SENDER_RE.search(sender):
        if FORWARDED_MARKER_RE.search(body_all) or FORWARDED_HEADER_RE.search(body_all):
            logger.debug("KEEP (internal forwarded client mail) | %s | %s", sender, subject[:60])
        else:
            logger.debug("DROP (internal fidus sender without forwarded client block) | %s | %s", sender, subject[:60])
            return False

    # ── 1. Hard-drop known spam / marketing domains ───────────────────────
    for domain in SPAM_DOMAINS:
        if domain in sender:
            logger.debug("DROP (spam domain) | %s | %s", sender, subject[:60])
            return False

    # ── 2. Drop by subject pattern ────────────────────────────────────────
    if _REJECT_RE.search(subject):
        logger.debug("DROP (subject pattern) | %s", subject[:60])
        return False

    # ── 3. Drop Google system emails ─────────────────────────────────────
    if "google" in sender and any(
        w in subject for w in ["storage", "gmail will stop", "quota", "working in"]
    ):
        logger.debug("DROP (google system) | %s", subject[:60])
        return False

    if is_reply_chain_noise(email_dict):
        logger.debug("DROP (reply-chain noise before LLM) | %s | %s", sender, subject[:60])
        return False

    # ── 4b. Drop logistics/transport signals in reply/fwd new content ─────────
    # Checks only the new text (before the quoted chain) so an old quoted RFQ
    # in the thread doesn't block the check.
    if subject.startswith(("re:", "fwd:", "fw:")):
        new_body = _latest_reply_text(body)
        m = _LOGISTICS_RE.search(new_body)
        if m:
            logger.debug("DROP (logistics '%s' in reply) | %s | %s", m.group(), sender, subject[:60])
            return False

    # ── 4. Drop seller / newsletter signals ──────────────────────────────
    # Runs BEFORE keyword fast-accepts and checks BOTH plain AND stripped HTML,
    # so HTML-only newsletters/supplier blasts are caught even when body_plain
    # is empty.
    m = _SELLER_RE.search(body_all)
    if m:
        logger.debug("DROP (seller signal '%s') | %s", m.group(), subject[:60])
        return False

    # ── 5. Fast accept — strong RFQ signals in subject ───────────────────
    for kw in RFQ_SUBJECT_KEYWORDS:
        if kw in subject:
            logger.debug("KEEP (subject keyword '%s') | %s", kw, subject[:60])
            return True

    # ── 6. Fast accept — strong RFQ signals in body ──────────────────────
    for kw in RFQ_BODY_KEYWORDS:
        if kw in body:
            logger.debug("KEEP (body keyword '%s') | %s", kw, subject[:60])
            return True

    # ── 7. Default: uncertain — forward to LLM classifier ────────────────
    logger.debug("UNCERTAIN — forwarding to LLM | %s", subject[:60])
    return True


_PLATFORM_REMINDER_RFQ_RE = re.compile(
    r"\b(rfq|quotation|quote|enquiry|inquiry)\b",
    re.IGNORECASE,
)


def is_client_reminder(email_dict: dict) -> bool:
    """
    Returns True when this email should land in the Reminders panel
    (admin reviews it and decides whether to create an inquiry).

    Two paths:
      1. Platform/portal RFQ reminder — subject contains "reminder" AND
         references rfq/quotation/quote/enquiry (e.g. "Reminder(2) for Group RFQ…")
      2. ANY RE: reply chain — admin always reviews reply threads regardless of
         content; Layer 1 already dropped logistics/spam re: emails before this runs.
    """
    subject = (email_dict.get("subject") or "").strip().lower()

    # Path 1 — platform/portal reminder notification
    if "reminder" in subject and _PLATFORM_REMINDER_RFQ_RE.search(subject):
        return True

    # Path 2 — all RE: reply chains go to admin review
    return subject.startswith("re:")
