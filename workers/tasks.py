"""
workers/tasks.py
----------------
Full pipeline — sends ONE parsed RFQ row per email to the Next.js backend.
"""

import re
import traceback
from datetime import datetime, timezone
from celery import Task
from googleapiclient.errors import HttpError

from workers.celery_app import celery_app
from gmail_auth import get_gmail_service_for_user
from gmail_service import (
    get_full_message,
    is_processable_inbox_message,
    fetch_new_message_ids_from_history,
    HistoryExpiredError,
)
from history_tracker import get_latest_history_id, save_latest_history_id, get_all_user_ids
from email_parser import parse_email
from rfq_filter import is_rfq_candidate, is_client_reminder
from attachment_handler import extract_attachment_text
from llm_extractor import is_rfq_email, extract_rfq_data, get_buyer_identity
from next_api_client import (
    post_rfq_item,
    post_reminder_item,
    get_drafts_for_inquiry,
    get_stale_drafts,
    patch_draft,
    post_vendor_quote,
)
from vendor_discovery import discover_and_store_vendors
from vendor_outreach import send_vendor_reminder
from vendor_reply import match_inquiry_code, extract_quote
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _route_to_reminder(msg_id: str, parsed: dict, items: list) -> None:
    """Post an email to the Reminders panel with any extracted line items."""
    try:
        post_reminder_item({
            "message_id":  msg_id,
            "thread_id":   parsed.get("thread_id"),
            "sender":      parsed.get("sender"),
            "subject":     parsed.get("subject"),
            "llm_summary": None,
            "email_date":  parsed.get("date_str"),
            "line_items":  items or [],
        })
        logger.info(
            "Reminder routed | %s | %s | items=%d",
            parsed.get("sender", ""), parsed.get("subject", ""), len(items or []),
        )
    except Exception as exc:
        logger.error("Failed to post reminder %s: %s", msg_id, exc)


class BaseTask(Task):
    abstract = True
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("Task %s [%s] FAILED: %s\n%s", self.name, task_id, exc, einfo)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.process_email_message",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
    rate_limit="30/s",
)
def process_email_message(self, user_id: str, message_id: str) -> dict:
    logger.info(
        "Task %s | user=%s | message=%s | attempt=%d",
        self.request.id, user_id, message_id, self.request.retries + 1,
    )

    try:
        service = get_gmail_service_for_user(user_id)
    except ValueError as exc:
        logger.error("Auth error for '%s': %s", user_id, exc)
        raise

    stats = {
        "total": 1,
        "parsed": 0,
        "layer1_dropped": 0,
        "layer2_dropped": 0,
        "rfq_exported": 0,
        "reminder_routed": 0,
        "failed": 0,
    }

    for msg_id in [message_id]:
        try:
            # 1. Fetch and flatten the full email from Gmail.
            raw = get_full_message(service, msg_id)
            if not is_processable_inbox_message(raw):
                logger.info(
                    "DROP non-inbox/outgoing Gmail message | %s | labels=%s",
                    msg_id,
                    raw.get("labelIds", []),
                )
                stats["layer1_dropped"] += 1
                continue

            parsed = parse_email(raw, user_id)
            stats["parsed"] += 1

            # 2. Layer 1: fast rule-based filter.
            if not is_rfq_candidate(parsed):
                if is_client_reminder(parsed):
                    # Extract attachments + run LLM extractor so the admin
                    # sees the items when reviewing in the Reminders panel.
                    att = ""
                    if parsed.get("has_attachment"):
                        try:
                            att = extract_attachment_text(
                                service, msg_id, raw.get("payload", {})
                            )
                        except Exception as e:
                            logger.warning("Attachment fetch failed for reminder %s: %s", msg_id, e)
                    try:
                        reminder_items = extract_rfq_data(parsed, att)
                    except Exception as e:
                        logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                        reminder_items = []
                    _route_to_reminder(msg_id, parsed, reminder_items)
                    stats["reminder_routed"] += 1
                stats["layer1_dropped"] += 1
                continue

            # 3. Reminder interception — runs BEFORE Layer 2 so re: chains
            #    never auto-create an inquiry regardless of quoted RFQ content.
            #    Layer 1 already dropped logistics/spam/noise re: emails.
            if is_client_reminder(parsed):
                att = ""
                if parsed.get("has_attachment"):
                    try:
                        att = extract_attachment_text(
                            service, msg_id, raw.get("payload", {})
                        )
                    except Exception as e:
                        logger.warning("Attachment fetch failed for reminder %s: %s", msg_id, e)
                try:
                    reminder_items = extract_rfq_data(parsed, att)
                except Exception as e:
                    logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                    reminder_items = []
                _route_to_reminder(msg_id, parsed, reminder_items)
                stats["reminder_routed"] += 1
                continue

            # 4. Extract text from attachments before LLM extraction.
            attachment_text = ""
            if parsed.get("has_attachment"):
                attachment_text = extract_attachment_text(
                    service, msg_id, raw.get("payload", {})
                )

            # 5. Layer 2: LLM yes/no classifier.
            if not is_rfq_email(parsed):
                if is_client_reminder(parsed):
                    try:
                        reminder_items = extract_rfq_data(parsed, attachment_text)
                    except Exception as e:
                        logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                        reminder_items = []
                    _route_to_reminder(msg_id, parsed, reminder_items)
                    stats["reminder_routed"] += 1
                stats["layer2_dropped"] += 1
                logger.debug("L2 DROP | %s | %s", parsed["sender"], parsed["subject"])
                continue

            logger.info("RFQ | %s | %s", parsed.get("sender", ""), parsed.get("subject", ""))

            # 5. Layer 3: LLM structured extractor.
            line_items = extract_rfq_data(parsed, attachment_text)

            if not line_items:
                # Extractor found nothing — if this email looks like a reminder
                # (e.g. portal notification with a link but no inline items),
                # route to Reminders panel so the admin can act on it.
                if is_client_reminder(parsed):
                    _route_to_reminder(msg_id, parsed, [])
                    stats["reminder_routed"] += 1
                logger.warning("No items extracted for %s", msg_id)
                continue

            buyer_name, buyer_email = get_buyer_identity(parsed)

            # 6. Collapse all items into one parser row for the Next.js API.
            client_name = None
            username = None
            sender_email = None
            location = None
            for item in line_items:
                if isinstance(item, dict):
                    client_name = client_name or item.get("client_name")
                    username = username or item.get("username")
                    sender_email = sender_email or item.get("sender_email")
                    location = location or item.get("location")

            username = buyer_name or username
            sender_email = buyer_email or sender_email

            for item in line_items:
                if isinstance(item, dict):
                    if buyer_name:
                        item["username"] = buyer_name
                    if buyer_email:
                        item["sender_email"] = buyer_email

            brands = ", ".join(
                str(i.get("brand") or "") for i in line_items if isinstance(i, dict)
            )
            part_numbers = ", ".join(
                str(i.get("part_number") or "") for i in line_items if isinstance(i, dict)
            )
            quantities = ", ".join(
                str(i.get("quantity") or "") for i in line_items if isinstance(i, dict)
            )
            notes = ", ".join(
                str(i.get("notes") or "") for i in line_items if isinstance(i, dict)
            )

            result = post_rfq_item({
                "message_id": msg_id,
                "thread_id": parsed.get("thread_id"),
                "user_id": user_id,
                "client_name": client_name,
                "username": username,
                "sender_email": sender_email,
                "location": location,
                "brands": brands,
                "part_numbers": part_numbers,
                "quantities": quantities,
                "notes": notes,
                "line_items": line_items,
                "sender": parsed.get("sender"),
                "subject": parsed.get("subject"),
                "email_date": parsed.get("date_str"),
            })

            stats["rfq_exported"] += 1

            logger.info(
                "Exported RFQ | %s | %s | items=%s",
                result.get("uniqueCode"),
                username or parsed.get("sender", ""),
                result.get("itemCount"),
            )

            # Trigger async vendor discovery. Runs 10s after RFQ export so the
            # inquiry is fully committed to DB first. Routes to "vendors" queue.
            unique_code = result.get("uniqueCode")
            if unique_code and line_items:
                try:
                    task = discover_vendors_task.apply_async(
                        args=[unique_code, line_items],
                        countdown=10,
                    )
                    logger.info(
                        "Vendor discovery queued | task_id=%s | unique_code=%s | items=%d",
                        task.id, unique_code, len(line_items),
                    )
                except Exception as exc:
                    logger.error("Failed to queue vendor discovery for %s: %s", unique_code, exc)
            else:
                logger.warning(
                    "Vendor discovery skipped | unique_code=%s | line_items=%s",
                    unique_code, line_items,
                )

        except HttpError as exc:
            status = exc.resp.status if exc.resp else "unknown"
            if status == 404:
                logger.warning("Message %s not found, skipping", msg_id)
            elif status == 429:
                logger.warning("Rate limited, retrying chunk")
                raise
            else:
                logger.error("HttpError %s on %s: %s", status, msg_id, exc)
            stats["failed"] += 1

        except Exception as exc:
            logger.error("Error on %s: %s\n%s", msg_id, exc, traceback.format_exc())
            stats["failed"] += 1

    logger.info(
        "Chunk done | total=%d | parsed=%d | L1_drop=%d | L2_drop=%d | exported=%d | reminders=%d | failed=%d",
        stats["total"], stats["parsed"],
        stats["layer1_dropped"], stats["layer2_dropped"],
        stats["rfq_exported"], stats["reminder_routed"], stats["failed"],
    )
    return stats


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.process_email_chunk",
)
def process_email_chunk(self, user_id: str, messages: list[dict]) -> dict:
    """
    Backward-compatible wrapper for any old callers.
    New SaaS workflow queues process_email_message(user_id, message_id).
    """
    task_ids = []
    for msg in messages:
        msg_id = msg["id"] if isinstance(msg, dict) else str(msg)
        task = process_email_message.apply_async(args=[user_id, msg_id], queue="emails")
        task_ids.append(task.id)
    return {"status": "queued", "user_id": user_id, "messages_queued": len(task_ids), "task_ids": task_ids}


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.poll_inbox",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
)
def poll_inbox(self, user_id: str) -> dict:
    """
    Incremental sync for one user.
    Fetches only emails that arrived since the stored historyId checkpoint.
    Called by poll_all_users (beat) or directly via /poll.
    """
    stored_id = get_latest_history_id(user_id)
    if not stored_id:
        logger.warning("poll_inbox | no historyId for %s — skipping (re-login to seed)", user_id)
        return {"status": "no_history_id", "user_id": user_id}

    try:
        service = get_gmail_service_for_user(user_id)
    except ValueError as exc:
        logger.error("poll_inbox | auth error for %s: %s", user_id, exc)
        return {"status": "auth_error", "detail": str(exc)}

    try:
        new_msgs, latest_id = fetch_new_message_ids_from_history(service, stored_id)
    except HistoryExpiredError as exc:
        logger.error("poll_inbox | historyId expired for %s: %s", user_id, exc)
        return {"status": "history_expired", "detail": str(exc)}

    if latest_id:
        save_latest_history_id(user_id, latest_id)

    if not new_msgs:
        logger.debug("poll_inbox | no new messages for %s", user_id)
        return {"status": "no_new_messages", "user_id": user_id}

    task_ids = []
    for msg in new_msgs:
        t = process_email_message.apply_async(args=[user_id, msg["id"]], queue="emails")
        task_ids.append(t.id)

    logger.info(
        "poll_inbox | user=%s new=%d chunks=%d latest_id=%s",
        user_id, len(new_msgs), len(task_ids), latest_id,
    )
    return {
        "status":            "queued",
        "user_id":           user_id,
        "new_messages":      len(new_msgs),
        "messages_queued":   len(task_ids),
        "latest_history_id": latest_id,
    }


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.poll_all_users",
)
def poll_all_users(self) -> dict:
    """
    Beat entry point — runs every 60 s.
    Dispatches poll_inbox for every user that has a stored historyId.

    Excludes VENDOR_MAILBOX_USER_ID: that mailbox is exclusively polled by
    poll_vendor_replies on its own queue. If it went through here too, vendor
    price replies would also get fed into the client RFQ pipeline (rfq_filter
    + GPT classifier), which has no concept of vendor quotes and would either
    drop them as noise or create bogus duplicate inquiries.
    """
    user_ids = [
        uid for uid in get_all_user_ids()
        if uid != settings.VENDOR_MAILBOX_USER_ID
    ]
    if not user_ids:
        logger.debug("poll_all_users | no users registered yet")
        return {"status": "no_users"}

    dispatched = []
    for uid in user_ids:
        t = poll_inbox.apply_async(args=[uid], queue="emails")
        dispatched.append(t.id)
        logger.info("poll_all_users | dispatched poll for %s task=%s", uid, t.id)

    return {"status": "dispatched", "users": len(user_ids), "task_ids": dispatched}


@celery_app.task(
    base=BaseTask,
    name="workers.tasks.discover_vendors_task",
    autoretry_for=(ConnectionError, TimeoutError),
    max_retries=2,
    retry_backoff=30,
    retry_jitter=True,
    # Multiple brands × 8 SerpAPI queries × scraping candidates can legitimately
    # run several minutes — longer than the global task_time_limit default.
    time_limit=900,
    soft_time_limit=840,
)
def discover_vendors_task(unique_code: str, line_items: list[dict]) -> dict:
    """
    Discover vendors for every unique brand in an exported RFQ.
    Triggered automatically after a successful RFQ export (10s countdown).
    Runs on the dedicated "vendors" queue so it never blocks email processing.
    Results are stored via Next.js API → PostgreSQL vendor tables.
    """
    logger.info(
        "discover_vendors_task START | unique_code=%s | items=%d",
        unique_code, len(line_items),
    )

    # Deduplicate by brand — queries are brand-focused so running the same
    # brand multiple times (e.g. 5 Siemens parts in one RFQ) wastes SerpAPI
    # credits and produces identical results. One run per unique brand.
    seen_brands: set[str] = set()
    total_stored = 0

    for item in line_items:
        if not isinstance(item, dict):
            continue
        brand       = (item.get("brand") or "").strip()
        part_number = (item.get("part_number") or "").strip()
        if not brand or not part_number:
            continue

        brand_key = brand.lower()
        if brand_key in seen_brands:
            logger.info(
                "Vendor discovery skipping duplicate brand | %s | %s", unique_code, brand
            )
            continue
        seen_brands.add(brand_key)

        try:
            vendors = discover_and_store_vendors(brand, part_number, unique_code)
            total_stored += len(vendors)
            logger.info(
                "Vendor discovery brand done | %s | brand=%s | found=%d",
                unique_code, brand, len(vendors),
            )
        except Exception as exc:
            logger.error(
                "Vendor discovery failed | %s | brand=%s: %s",
                unique_code, brand, exc,
            )

    logger.info(
        "Vendor discovery task done | %s | brands=%d | vendors_stored=%d",
        unique_code, len(seen_brands), total_stored,
    )
    return {
        "unique_code":    unique_code,
        "brands_searched": len(seen_brands),
        "vendors_stored": total_stored,
    }


# ── Vendor reply pipeline ───────────────────────────────────────────────────
# Everything below operates on the single dedicated vendor-outreach mailbox
# (settings.VENDOR_MAILBOX_USER_ID), never the per-employee client mailboxes.
# It runs on its own "vendor_replies" queue so a slow GPT extraction call can
# never delay client RFQ polling.

_SENDER_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)


def _extract_sender_email(sender: str | None) -> str | None:
    if not sender:
        return None
    m = _SENDER_EMAIL_RE.search(sender)
    return m.group(0) if m else None


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.poll_vendor_replies",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
)
def poll_vendor_replies(self) -> dict:
    """
    Incremental sync for the vendor-outreach mailbox (beat-scheduled).
    Any new message is just queued for extract_vendor_quote — the actual
    [UNIQUE_CODE] subject match happens there so this stays a thin, fast poll.
    """
    user_id = settings.VENDOR_MAILBOX_USER_ID
    if not user_id:
        logger.debug("poll_vendor_replies | VENDOR_MAILBOX_USER_ID not set — skipping")
        return {"status": "not_configured"}

    stored_id = get_latest_history_id(user_id)
    if not stored_id:
        logger.warning("poll_vendor_replies | no historyId for %s — re-login to seed", user_id)
        return {"status": "no_history_id"}

    try:
        service = get_gmail_service_for_user(user_id)
    except ValueError as exc:
        logger.error("poll_vendor_replies | auth error: %s", exc)
        return {"status": "auth_error", "detail": str(exc)}

    try:
        new_msgs, latest_id = fetch_new_message_ids_from_history(service, stored_id)
    except HistoryExpiredError as exc:
        logger.error("poll_vendor_replies | historyId expired: %s", exc)
        return {"status": "history_expired", "detail": str(exc)}

    if latest_id:
        save_latest_history_id(user_id, latest_id)

    if not new_msgs:
        return {"status": "no_new_messages"}

    queued = 0
    for msg in new_msgs:
        extract_vendor_quote.apply_async(args=[msg["id"]], queue="vendor_replies")
        queued += 1

    logger.info("poll_vendor_replies | new=%d queued=%d", len(new_msgs), queued)
    return {"status": "queued", "new_messages": len(new_msgs), "queued": queued}


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.extract_vendor_quote",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=2,
    retry_backoff=30,
    retry_jitter=True,
)
def extract_vendor_quote(self, message_id: str) -> dict:
    """
    Quote Extraction Agent. Matches a vendor reply back to its inquiry via
    the [UNIQUE_CODE] subject tag, then GPT-extracts price/lead-time per part.
    """
    user_id = settings.VENDOR_MAILBOX_USER_ID
    if not user_id:
        return {"status": "not_configured"}

    service = get_gmail_service_for_user(user_id)
    raw = get_full_message(service, message_id)

    if not is_processable_inbox_message(raw):
        logger.debug("extract_vendor_quote | skip non-inbox message %s", message_id)
        return {"status": "skipped_non_inbox"}

    parsed = parse_email(raw, user_id)
    unique_code = match_inquiry_code(parsed.get("subject"))
    if not unique_code:
        logger.debug(
            "extract_vendor_quote | no inquiry code in subject — not a tracked vendor reply | subject=%s",
            parsed.get("subject"),
        )
        return {"status": "no_match"}

    # Draft lookup is only used for part-number hints and vendor/thread
    # matching — a nice-to-have, not essential. A failure here (Next.js
    # down, bad URL, etc.) shouldn't drop the vendor's price on the floor;
    # fall back to extracting without those hints instead.
    try:
        drafts = get_drafts_for_inquiry(unique_code)
    except Exception as exc:
        logger.warning("extract_vendor_quote | draft lookup failed for %s: %s", unique_code, exc)
        drafts = []
    thread_id = parsed.get("thread_id")
    sender_email = _extract_sender_email(parsed.get("sender"))

    draft = next((d for d in drafts if d.get("thread_id") == thread_id), None)
    if draft is None and sender_email:
        draft = next(
            (d for d in drafts if (d.get("vendor_email") or "").lower() == sender_email.lower()),
            None,
        )

    part_numbers = [p.strip() for p in (draft.get("part_number") or "").split(",") if p.strip()] if draft else []
    quotes = extract_quote(parsed.get("body_plain"), parsed.get("body_html"), part_numbers)

    if not quotes:
        logger.info("extract_vendor_quote | no price found in reply | unique_code=%s", unique_code)
        return {"status": "no_quote_found", "unique_code": unique_code}

    post_vendor_quote({
        "unique_code": unique_code,
        "draft_id": draft.get("id") if draft else None,
        "vendor_name": draft.get("vendor_name") if draft else None,
        "vendor_email": (draft.get("vendor_email") if draft else None) or sender_email,
        "brand": draft.get("brand") if draft else None,
        "raw_reply": parsed.get("body_plain") or parsed.get("body_html"),
        "quotes": quotes,
    })

    logger.info("Vendor quote extracted | unique_code=%s | parts=%d", unique_code, len(quotes))
    return {"status": "ok", "unique_code": unique_code, "quotes": len(quotes)}


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.send_vendor_reminders",
)
def send_vendor_reminders(self) -> dict:
    """
    Reminder Agent (beat-scheduled). Follows up on sent RFQs that have had
    no vendor reply within VENDOR_REMINDER_AFTER_HOURS, once each.
    """
    if not settings.VENDOR_MAILBOX_USER_ID:
        return {"status": "not_configured"}

    stale = get_stale_drafts(settings.VENDOR_REMINDER_AFTER_HOURS)
    sent = 0
    for draft in stale:
        if not draft.get("thread_id") or not draft.get("vendor_email"):
            continue
        try:
            send_vendor_reminder(
                vendor_email=draft["vendor_email"],
                subject=draft["subject"],
                thread_id=draft["thread_id"],
                rfc_message_id=draft.get("rfc_message_id"),
            )
            patch_draft(draft["id"], reminded_at=datetime.now(timezone.utc).isoformat())
            sent += 1
        except Exception as exc:
            logger.error("Vendor reminder failed | draft_id=%s: %s", draft.get("id"), exc)

    logger.info("send_vendor_reminders | candidates=%d sent=%d", len(stale), sent)
    return {"status": "ok", "candidates": len(stale), "sent": sent}
