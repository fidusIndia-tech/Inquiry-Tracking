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
}

# ── Subject line patterns → NOT an RFQ ──────────────────────────────────────
REJECT_SUBJECT_PATTERNS = [
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
    "please send us your",
    "send us your requirement",
    "feel free to contact us",
    "please feel free to contact",

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

# ── Keywords that STRONGLY suggest an inbound RFQ ────────────────────────────
RFQ_SUBJECT_KEYWORDS = [
    "rfq", "request for quotation", "request for quote",
    "quotation", "quote", "pricing", "price inquiry",
    "purchase order", "po ", " po#", "enquiry", "inquiry",
    "requirement", "requirment",
    # more specific spare-part requests (bare "spare" removed — too generic)
    "spare parts required", "spare parts needed", "spare parts enquiry",
    "re:", "fwd:",
    "quotation req", "rate inquiry", "rate request",
]

RFQ_BODY_KEYWORDS = [
    # buyer-specific request phrases
    "please quote", "please provide", "kindly quote", "kindly provide",
    "share quotation", "share quote",
    "provide rates", "provide rate",
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

_REJECT_RE = re.compile("|".join(REJECT_SUBJECT_PATTERNS), re.IGNORECASE)
_SELLER_RE = re.compile("|".join(re.escape(s) for s in SELLER_BODY_SIGNALS), re.IGNORECASE)


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


def is_rfq_candidate(email_dict: dict) -> bool:
    """
    Returns True  → pass to LLM (Layer 2)
    Returns False → discard immediately
    """
    sender  = (email_dict.get("sender")  or "").lower()
    subject = (email_dict.get("subject") or "").lower()

    plain, html_stripped = _extract_text(email_dict)

    # best single source for keyword matching
    body = plain if len(plain) >= 100 else html_stripped
    # combined source for seller signal detection (catches HTML-only emails)
    body_all = plain + " " + html_stripped

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
