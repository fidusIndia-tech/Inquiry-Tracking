"""
api/routes.py
"""

import base64

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from googleapiclient.discovery import build

from gmail_auth import build_oauth_flow, get_authorization_url, get_gmail_service_for_user
from gmail_service import (
    fetch_new_message_ids_from_history,
    HistoryExpiredError,
)
from history_tracker import get_latest_history_id, save_latest_history_id
from models.user_model import save_user_credentials
from workers.tasks import process_email_message
from next_api_client import get_inquiries
from vendor_outreach import send_vendor_rfq
from vendor_outreach.sender import VendorMailboxNotConfigured
from client_outreach import send_client_quote
from client_outreach.sender import ClientMailboxNotConfigured
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter()


@router.get("/")
def home():
    return {"status": "ok", "service": "gmail-rfq-processor"}


@router.get("/debug")
def debug():
    return {
        "GOOGLE_CLIENT_ID":     settings.GOOGLE_CLIENT_ID[:8] + "..." if settings.GOOGLE_CLIENT_ID else "NOT SET",
        "GOOGLE_CLIENT_SECRET": "SET" if settings.GOOGLE_CLIENT_SECRET else "NOT SET",
        "GOOGLE_REDIRECT_URI":  settings.GOOGLE_REDIRECT_URI or "NOT SET",
    }


@router.get("/login")
def login(request: Request, mailbox: str = "default"):
    """
    mailbox=vendor or mailbox=client requests the broader scope set (adds
    gmail.send) — use this once to (re-)authorize the single dedicated
    vendor-outreach mailbox or the single client-facing reply mailbox.
    Every other account should keep using the default read-only login.
    """
    try:
        scopes = settings.GOOGLE_SCOPES_VENDOR_MAILBOX if mailbox != "default" else settings.GOOGLE_SCOPES
        flow = build_oauth_flow(scopes=scopes)
        authorization_url, state = get_authorization_url(flow)
        request.session["oauth_state"] = state
        request.session["oauth_code_verifier"] = getattr(flow, "code_verifier", None)
        request.session["oauth_scopes"] = scopes
        return RedirectResponse(authorization_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/auth/google/callback")
def oauth_callback(request: Request):
    session_state = request.session.get("oauth_state")
    if not session_state or session_state != request.query_params.get("state"):
        raise HTTPException(status_code=400, detail="Invalid OAuth state.")

    flow = build_oauth_flow(state=session_state, scopes=request.session.get("oauth_scopes"))
    flow.code_verifier = request.session.get("oauth_code_verifier")

    try:
        # Railway terminates SSL at proxy — internal URL is http:// but must be https://
        callback_url = str(request.url).replace("http://", "https://", 1)
        flow.fetch_token(authorization_response=callback_url)
        credentials = flow.credentials
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    try:
        gmail_svc = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        profile = gmail_svc.users().getProfile(userId="me").execute()
        user_id = profile["emailAddress"]
        history_id = profile.get("historyId")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not get Gmail profile: {exc}")

    save_user_credentials(
        email=user_id,
        refresh_token=credentials.refresh_token,
        access_token=credentials.token,
        access_token_expiry=credentials.expiry,
        history_id=history_id,
        scopes=list(credentials.scopes or settings.GOOGLE_SCOPES),
    )

    # Capture initial historyId — becomes the incremental sync checkpoint
    logger.info("Initial Gmail profile captured | user=%s historyId=%s", user_id, history_id)

    request.session["user_id"] = user_id
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_code_verifier", None)
    return RedirectResponse("/start-fetch")


@router.get("/start-fetch")
def start_fetch(request: Request):
    """
    Incremental fetch using Gmail History API.

    This endpoint only captures the current historyId checkpoint.
    Fresh mail will then be picked up by Celery beat through the History API.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        service = get_gmail_service_for_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auth error: {exc}")

    stored_id = get_latest_history_id(user_id)

    # Only seed the current checkpoint. Do not backfill old messages.
    if not stored_id:
        try:
            profile = service.users().getProfile(userId="me").execute()
            history_id = profile.get("historyId")
            if history_id:
                save_latest_history_id(user_id, history_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not capture historyId: {exc}")

        return JSONResponse({
            "status": "checkpoint_saved",
            "history_id": history_id,
            "note": "Old mail was not scanned. New mail will be picked up by the 60-second history poll.",
        })

    # ── Incremental fetch via History API ─────────────────────────────────
    try:
        new_msgs, latest_id = fetch_new_message_ids_from_history(service, stored_id)
    except HistoryExpiredError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"{exc}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gmail History API error: {exc}")

    if latest_id:
        save_latest_history_id(user_id, latest_id)

    if not new_msgs:
        return JSONResponse({"status": "no_new_messages", "latest_history_id": latest_id})

    task_ids = []
    for msg in new_msgs:
        task = process_email_message.apply_async(args=[user_id, msg["id"]], queue="emails")
        task_ids.append(task.id)

    return JSONResponse({
        "status":             "queued",
        "new_messages":       len(new_msgs),
        "messages_queued":    len(task_ids),
        "latest_history_id":  latest_id,
    })


@router.get("/poll")
def poll(request: Request):
    """
    Lightweight endpoint for the scheduler — dispatches a Celery poll_inbox task.
    The task calls the History API and queues only new emails.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    from workers.tasks import poll_inbox
    task = poll_inbox.apply_async(args=[user_id], queue="emails")
    return JSONResponse({"status": "poll_queued", "task_id": task.id})


# ── RFQ endpoints ─────────────────────────────────────────────────────────────

@router.get("/rfq")
def list_rfq(
    request: Request,
    page: int = 1,
    per_page: int = 50,
    brand: str = None,
    location: str = None,
    username: str = None,
):
    """
    List extracted RFQs from the Next.js/PostgreSQL backend.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        data = get_inquiries()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Next.js API error: {exc}")

    inquiries = data.get("inquiries", [])

    def matches(inquiry):
        items = inquiry.get("items", [])
        brand_text = " ".join(str(item.get("brand") or "") for item in items)
        if brand and brand.lower() not in brand_text.lower():
            return False
        if location and location.lower() not in str(inquiry.get("location") or "").lower():
            return False
        if username and username.lower() not in str(inquiry.get("client_name") or "").lower():
            return False
        return True

    filtered = [inquiry for inquiry in inquiries if matches(inquiry)]
    start = (page - 1) * per_page
    end = start + per_page

    return {
        "total": len(filtered),
        "page": page,
        "per_page": per_page,
        "rfq_items": filtered[start:end],
    }


@router.get("/rfq/export")
def export_rfq_csv(request: Request):
    """
    Download RFQ data from the Next.js/PostgreSQL backend as a CSV file.
    """
    import csv
    import io
    from fastapi.responses import StreamingResponse

    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        data = get_inquiries()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Next.js API error: {exc}")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "date", "client_name", "location",
        "brand", "part_number", "quantity", "notes",
        "sender", "subject", "unique_code"
    ])
    for inquiry in data.get("inquiries", []):
        items = inquiry.get("items") or [{}]
        for item in items:
            writer.writerow([
                inquiry.get("email_date"),
                inquiry.get("client_name"),
                inquiry.get("location"),
                item.get("brand"),
                item.get("partNumber"),
                item.get("quantity"),
                item.get("itemNotes") or inquiry.get("notes"),
                inquiry.get("sender_email") or inquiry.get("sender_name"),
                inquiry.get("subject"),
                inquiry.get("unique_code"),
            ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=rfq_export.csv"}
    )


@router.get("/stats")
def stats(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        data = get_inquiries()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Next.js API error: {exc}")

    inquiries = data.get("inquiries", [])

    return {
        "user_id": user_id,
        "rfq_emails_found": len(inquiries),
        "new": sum(1 for inquiry in inquiries if inquiry.get("status") == "new"),
        "in_progress": sum(1 for inquiry in inquiries if inquiry.get("status") == "in_progress"),
    }


@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "logged_out"}


@router.get("/trigger-vendors")
def trigger_vendors(unique_code: str, brand: str, part_number: str):
    """
    Manually run vendor discovery for a specific inquiry line item.
    Runs synchronously (bypasses Celery) so you can see the result immediately.
    Example: /trigger-vendors?unique_code=FIAPL0000357&brand=3M&part_number=CT4BK18-C
    """
    from vendor_discovery import discover_and_store_vendors

    report = {
        "unique_code": unique_code,
        "brand": brand,
        "part_number": part_number,
        "NEXT_VENDORS_API_URL": settings.NEXT_VENDORS_API_URL,
        "SEARCHAPI_KEY": "SET" if settings.SEARCHAPI_KEY else "NOT SET",
    }

    try:
        vendors = discover_and_store_vendors(brand, part_number, unique_code)
        report["status"] = "ok"
        report["vendors_stored"] = len(vendors)
        report["vendors"] = vendors
    except Exception as exc:
        report["status"] = "error"
        report["detail"] = str(exc)

    return report


class DiscoverVendorsRequest(BaseModel):
    unique_code: str
    line_items: list[dict]


@router.post("/discover-vendors")
def discover_vendors(payload: DiscoverVendorsRequest):
    """
    Enqueue the real async vendor discovery task for an inquiry. Called by
    the Next.js "Search Vendors" button in the Vendors tab — discovery now
    only ever runs on-demand, not automatically on every RFQ export.
    """
    from workers.tasks import discover_vendors_task

    if not payload.line_items:
        raise HTTPException(status_code=400, detail="line_items is required")

    task = discover_vendors_task.apply_async(args=[payload.unique_code, payload.line_items])
    logger.info(
        "Vendor discovery queued on-demand | task_id=%s | unique_code=%s | items=%d",
        task.id, payload.unique_code, len(payload.line_items),
    )
    return {"status": "queued", "task_id": task.id}


@router.get("/list-email-attachments")
def list_email_attachments(message_id: str, user_id: str):
    """
    Return the attachment metadata (id, filename, mime_type, size) for a
    Gmail message in the given user's mailbox. Used by the vendor-RFQ UI so
    employees can forward client-supplied images / drawings to vendors.
    """
    try:
        service = get_gmail_service_for_user(user_id)
        msg = service.users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        logger.error("list_email_attachments | message_id=%s user_id=%s: %s", message_id, user_id, exc)
        raise HTTPException(status_code=502, detail=f"Gmail fetch failed: {exc}")

    payload = msg.get("payload", {})
    found: list[dict] = []

    def walk(part: dict) -> None:
        filename = part.get("filename", "")
        body = part.get("body", {})
        attachment_id = body.get("attachmentId")
        if filename and attachment_id:
            found.append({
                "attachment_id": attachment_id,
                "filename": filename,
                "mime_type": part.get("mimeType", "application/octet-stream"),
                "size": body.get("size", 0),
            })
        for sub in part.get("parts", []):
            walk(sub)

    walk(payload)
    return {"attachments": found, "message_id": message_id}


class ClientAttachment(BaseModel):
    attachment_id: str
    filename: str
    mime_type: str
    message_id: str
    user_id: str


class UploadedAttachment(BaseModel):
    filename: str
    data_base64: str
    mime_type: str


class SendVendorRfqRequest(BaseModel):
    draft_id: int
    unique_code: str
    vendor_email: str
    subject: str
    body: str
    client_attachments: list[ClientAttachment] = []
    uploaded_attachments: list[UploadedAttachment] = []


@router.post("/send-vendor-rfq")
def send_vendor_rfq_endpoint(payload: SendVendorRfqRequest):
    """
    Sends one vendor RFQ draft via the single dedicated vendor-outreach
    mailbox. Runs synchronously (one Gmail API call, ~1-2s) so the employee
    gets an immediate one-click send/fail result instead of polling a task.
    Optionally attaches files — either forwarded from the original client
    email (fetched via the client mailbox) or uploaded by the employee.
    """
    # Build a normalised attachment list: [{filename, bytes, mime_type}]
    attachments: list[dict] = []

    for att in payload.client_attachments:
        try:
            svc = get_gmail_service_for_user(att.user_id)
            result_att = (
                svc.users().messages().attachments()
                .get(userId="me", messageId=att.message_id, id=att.attachment_id)
                .execute()
            )
            raw_bytes = base64.urlsafe_b64decode(result_att.get("data", "") + "==")
            attachments.append({
                "filename": att.filename,
                "bytes": raw_bytes,
                "mime_type": att.mime_type,
            })
            logger.info(
                "send_vendor_rfq | fetched client attachment %s (%d bytes)",
                att.filename, len(raw_bytes),
            )
        except Exception as exc:
            logger.warning(
                "send_vendor_rfq | could not fetch client attachment %s: %s",
                att.filename, exc,
            )

    for att in payload.uploaded_attachments:
        try:
            raw_bytes = base64.b64decode(att.data_base64)
            attachments.append({
                "filename": att.filename,
                "bytes": raw_bytes,
                "mime_type": att.mime_type,
            })
        except Exception as exc:
            logger.warning(
                "send_vendor_rfq | could not decode uploaded attachment %s: %s",
                att.filename, exc,
            )

    try:
        result = send_vendor_rfq(
            unique_code=payload.unique_code,
            vendor_email=payload.vendor_email,
            subject=payload.subject,
            body=payload.body,
            attachments=attachments or None,
        )
    except VendorMailboxNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("send_vendor_rfq failed | draft_id=%s: %s", payload.draft_id, exc)
        raise HTTPException(status_code=502, detail=f"Gmail send failed: {exc}")

    return {
        "status": "sent",
        "message_id": result["message_id"],
        "thread_id": result["thread_id"],
        "rfc_message_id": result["rfc_message_id"],
    }


class SendClientQuoteRequest(BaseModel):
    unique_code: str
    client_email: str
    subject: str
    body: str
    thread_id: str | None = None
    in_reply_to_message_id: str | None = None
    attachment_filename: str | None = None
    attachment_base64: str | None = None


@router.post("/send-client-quote")
def send_client_quote_endpoint(payload: SendClientQuoteRequest):
    """
    Sends the final quotation to the client via the single dedicated
    client-reply mailbox, threaded as a reply to their original RFQ email.
    """
    attachment_bytes = base64.b64decode(payload.attachment_base64) if payload.attachment_base64 else None
    try:
        result = send_client_quote(
            client_email=payload.client_email,
            subject=payload.subject,
            body=payload.body,
            thread_id=payload.thread_id,
            in_reply_to_message_id=payload.in_reply_to_message_id,
            attachment_filename=payload.attachment_filename,
            attachment_bytes=attachment_bytes,
        )
    except ClientMailboxNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("send_client_quote failed | unique_code=%s: %s", payload.unique_code, exc)
        raise HTTPException(status_code=502, detail=f"Gmail send failed: {exc}")

    return {"status": "sent", "message_id": result["message_id"], "thread_id": result["thread_id"]}


class SendVendorPoRequest(BaseModel):
    po_id: int
    vendor_email: str
    subject: str
    body: str
    pdf_base64: str | None = None
    filename: str | None = None


@router.post("/send-vendor-po")
def send_vendor_po_endpoint(payload: SendVendorPoRequest):
    """
    Sends a Purchase Order PDF to the vendor via the dedicated vendor-outreach
    mailbox. Accepts the pre-rendered PDF as base64 from the Next.js layer.
    """
    attachment_bytes = base64.b64decode(payload.pdf_base64) if payload.pdf_base64 else None
    try:
        from vendor_outreach.sender import _vendor_service
        service = _vendor_service()
        from gmail_service import send_message, get_rfc_message_id
        sent = send_message(
            service,
            to=payload.vendor_email,
            subject=payload.subject,
            html_body=payload.body,
            attachment_filename=payload.filename or f"PO-{payload.po_id}.pdf",
            attachment_bytes=attachment_bytes,
        )
        rfc_message_id = get_rfc_message_id(service, sent["id"])
    except VendorMailboxNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("send_vendor_po failed | po_id=%s: %s", payload.po_id, exc)
        raise HTTPException(status_code=502, detail=f"Gmail send failed: {exc}")

    logger.info("Vendor PO sent | po_id=%s | to=%s | message_id=%s", payload.po_id, payload.vendor_email, sent["id"])
    return {
        "status": "sent",
        "message_id": sent["id"],
        "thread_id": sent["thread_id"],
        "rfc_message_id": rfc_message_id,
    }


@router.get("/debug/vendors")
def debug_vendors(brand: str = "SERO", part_number: str = "SOHB113WG2V10"):
    """
    Manually run the full vendor discovery pipeline and return step-by-step results.
    Use ?brand=XXX&part_number=YYY to test any specific part.
    """
    report = {
        "config": {
            "SEARCHAPI_KEY": "SET" if settings.SEARCHAPI_KEY else "NOT SET — discovery will be skipped",
            "NEXT_VENDORS_API_URL": settings.NEXT_VENDORS_API_URL or "NOT SET",
        },
        "brand": brand,
        "part_number": part_number,
        "steps": {},
    }

    # Step 1: Raw SearchApi.io call (one query, expose full response)
    try:
        from vendor_discovery.searcher import _searchapi_request
        raw = _searchapi_request(f'"{brand}" {part_number} distributor India', num=5, gl="in")
        organic = raw.get("organic_results", [])
        error   = raw.get("error", None)
        report["steps"]["searchapi_raw"] = {
            "status":          "error" if error else ("ok" if organic else "empty"),
            "searchapi_error": error,
            "results_count":   len(organic),
            "sample_titles":   [r.get("title") for r in organic[:3]],
        }
        if error or not organic:
            return report
    except Exception as exc:
        report["steps"]["searchapi_raw"] = {"status": "exception", "detail": str(exc)}
        return report

    # Step 2: Full discovery search
    try:
        from vendor_discovery.searcher import search_vendors
        results = search_vendors(brand, part_number)
        report["steps"]["searchapi_search"] = {
            "status": "ok" if results else "empty",
            "results_count": len(results),
            "sample": results[:3],
        }
    except Exception as exc:
        report["steps"]["searchapi_search"] = {"status": "error", "detail": str(exc)}
        return report

    if not results:
        return report

    # Step 3: Contact extraction on first result
    try:
        from vendor_discovery.scraper import fetch_vendor_page, extract_contacts
        first = results[0]
        snippet_contacts = extract_contacts(first.get("snippet", ""))
        page_text = fetch_vendor_page(first["url"])
        page_contacts = extract_contacts(page_text) if page_text else {}
        report["steps"]["contact_extraction"] = {
            "url": first["url"],
            "snippet_contacts": snippet_contacts,
            "page_fetched": bool(page_text),
            "page_contacts": page_contacts,
        }
    except Exception as exc:
        report["steps"]["contact_extraction"] = {"status": "error", "detail": str(exc)}

    # Step 4: POST to Next.js vendor API
    try:
        from vendor_discovery.client import post_vendor
        test_payload = {
            "name": "DEBUG TEST VENDOR",
            "website": "https://example.com",
            "domain": "debug-test-vendor-do-not-keep.example.com",
            "email": "test@example.com",
            "phone": None,
            "city": None,
            "country": None,
            "is_authorized_dealer": False,
            "brand": brand,
            "part_number": part_number,
            "inquiry_unique_code": "DEBUG",
            "source": "debug",
        }
        post_result = post_vendor(test_payload)
        report["steps"]["post_to_nextjs"] = {"status": "ok", "result": post_result}
    except Exception as exc:
        report["steps"]["post_to_nextjs"] = {"status": "error", "detail": str(exc)}

    return report
