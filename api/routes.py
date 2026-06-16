"""
api/routes.py
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse

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
def login(request: Request):
    try:
        flow = build_oauth_flow()
        authorization_url, state = get_authorization_url(flow)
        request.session["oauth_state"] = state
        request.session["oauth_code_verifier"] = getattr(flow, "code_verifier", None)
        return RedirectResponse(authorization_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/auth/google/callback")
def oauth_callback(request: Request):
    session_state = request.session.get("oauth_state")
    if not session_state or session_state != request.query_params.get("state"):
        raise HTTPException(status_code=400, detail="Invalid OAuth state.")

    flow = build_oauth_flow(state=session_state)
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


@router.get("/debug/vendors")
def debug_vendors(brand: str = "SERO", part_number: str = "SOHB113WG2V10"):
    """
    Manually run the full vendor discovery pipeline and return step-by-step results.
    Use ?brand=XXX&part_number=YYY to test any specific part.
    """
    report = {
        "config": {
            "SERPAPI_KEY": "SET" if settings.SERPAPI_KEY else "NOT SET — discovery will be skipped",
            "NEXT_VENDORS_API_URL": settings.NEXT_VENDORS_API_URL or "NOT SET",
        },
        "brand": brand,
        "part_number": part_number,
        "steps": {},
    }

    # Step 1: Check if serpapi package is importable
    try:
        from serpapi import GoogleSearch
        report["steps"]["package_import"] = {"status": "ok", "package": "serpapi/GoogleSearch imported"}
    except ImportError as exc:
        report["steps"]["package_import"] = {
            "status": "ERROR — package not installed",
            "detail": str(exc),
            "fix": "Add 'google-search-results>=2.4.2' to requirements.txt and redeploy",
        }
        return report

    # Step 2: Raw SerpAPI call (one query, expose full response)
    try:
        search = GoogleSearch({
            "q":       f'"{brand}" {part_number} distributor India',
            "api_key": settings.SERPAPI_KEY,
            "num":     5,
            "gl":      "in",
            "hl":      "en",
        })
        raw = search.get_dict()
        organic = raw.get("organic_results", [])
        error   = raw.get("error", None)
        report["steps"]["serpapi_raw"] = {
            "status":          "error" if error else ("ok" if organic else "empty"),
            "serpapi_error":   error,
            "results_count":   len(organic),
            "sample_titles":   [r.get("title") for r in organic[:3]],
            "account_info":    raw.get("search_metadata", {}).get("status"),
        }
        if error or not organic:
            return report
    except Exception as exc:
        report["steps"]["serpapi_raw"] = {"status": "exception", "detail": str(exc)}
        return report

    # Step 3: Full discovery search
    try:
        from vendor_discovery.searcher import search_vendors
        results = search_vendors(brand, part_number)
        report["steps"]["serpapi_search"] = {
            "status": "ok" if results else "empty",
            "results_count": len(results),
            "sample": results[:3],
        }
    except Exception as exc:
        report["steps"]["serpapi_search"] = {"status": "error", "detail": str(exc)}
        return report

    if not results:
        return report

    # Step 2: Contact extraction on first result
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

    # Step 3: POST to Next.js vendor API
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
