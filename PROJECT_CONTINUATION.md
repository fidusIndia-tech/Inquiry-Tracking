# FidusSource / Inquiry Tracking — Project Documentation

Last updated: 2026-07-07. This file is the single source of truth for understanding the project. Update it whenever architecture, workflows, or working agreements change.

---

## 1. What This Project Is

Procurement automation platform for **Fidus India Pvt Ltd (FIAPL)**, an industrial automation parts distributor. Clients email RFQs (Requests for Quotation) → the system auto-extracts line items → employees find vendors → vendor RFQs go out → vendor replies get parsed → employee adds margin → final quotation PDF goes to the client.

**The problem it solves:** Without this, employees manually read every email, copy out part numbers/brands/quantities into spreadsheets, email vendors one by one, and track replies manually. This automates the extraction, vendor search, outreach, and reply parsing — employees only make judgment calls (margin, vendor selection, approval).

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Python backend | FastAPI + Celery + Redis |
| Frontend | Next.js 16 (App Router) + React 19 |
| Database | PostgreSQL (single instance, shared) |
| Gmail integration | Google OAuth 2.0, Gmail API v1 |
| AI extraction | OpenAI GPT-4o / GPT-4o-mini |
| Vendor search | SearchAPI.io (Google Search wrapper) |
| PDF generation | @react-pdf/renderer (Helvetica font — limited Unicode) |
| Deployment | Railway (separate services: backend + frontend + Redis + Postgres) |

**Repo structure:**
```
d:\miniproject\app\
├── main.py                  FastAPI entry point
├── api/routes.py            All HTTP endpoints
├── workers/
│   ├── celery_app.py        Celery config + queue definitions
│   └── tasks.py             All Celery task functions
├── gmail_auth.py            OAuth flow + per-user credential management
├── gmail_service.py         Gmail API helpers (fetch, send, history)
├── email_parser.py          Raw Gmail message → flat dict
├── rfq_filter.py            Layer-1 heuristic RFQ filter
├── llm_extractor.py         GPT Layer-2 filter + line-item extraction
├── attachment_handler.py    PDF/Excel attachment text extraction
├── history_tracker.py       Per-user Gmail History API checkpoint (DB-backed)
├── vendor_discovery/        SearchAPI + web scraping + contact extraction
├── vendor_outreach/         Send RFQ emails from vendor mailbox
├── vendor_reply/            Parse vendor quote replies
├── client_outreach/         Send final quotation to client
├── models/                  SQLAlchemy models (users, email, rfq)
├── next_api_client.py       HTTP calls from Python backend → Next.js API
├── config.py                All env vars via pydantic Settings
└── fidus-frontend/          Next.js app (complete frontend)
    ├── app/
    │   ├── admin-dashboard/page.jsx     Admin view
    │   ├── employee-dashboard/page.jsx  Employee view
    │   ├── login/page.jsx
    │   ├── api/                         Next.js API routes (DB queries)
    │   └── components/
    │       ├── InquiryDetailModal.jsx   Main inquiry work modal (largest file)
    │       ├── QuotationSummaryPanel.jsx
    │       ├── ManualQuotationForm.jsx
    │       └── PurchaseOrdersTab.jsx
    ├── lib/
    │   ├── db.js                        PostgreSQL pool (frontend DB access)
    │   ├── quotationPdf.jsx             Quotation PDF template
    │   └── purchaseOrderPdf.jsx         PO PDF template
    └── db/schema.sql                    Canonical DB schema
```

---

## 3. Full Email Processing Pipeline

### Step 1 — Gmail Ingestion (Celery beat, every 60s)

`poll_inbox` task runs for every connected Gmail account. Uses the **Gmail History API** (incremental, not full mailbox scan) — each account has its own `history_id` checkpoint stored in the `gmail_users` DB table. New message IDs are queued as individual `process_email_message` tasks on the `emails` queue.

### Step 2 — Layer 1: Heuristic Filter (`rfq_filter.py`)

Fast rule-based filter before any LLM call. Checks:
- Subject/body for RFQ signal words ("rfq", "request for quotation", "quotation needed", etc.)
- Drops known spam signals, newsletter patterns, auto-replies
- Checks if it's a **client reminder** (follow-up from client asking about their RFQ status) — routes those to the Reminders panel instead
- **Blocked clients**: admin can block a sender email; blocked senders are dropped silently + moved to Spam in Gmail

### Step 3 — Attachment Handling (`attachment_handler.py`)

If the email has attachments:
- **Excel files**: `download_and_parse_excel_rfq()` — deterministic fast-path that reads part numbers/brands/quantities directly from Excel cells, bypassing the LLM entirely for structured data
- **PDF files**: extracts text for LLM processing
- Attachment text is merged into the email body before GPT processing

### Step 4 — Layer 2: LLM Filter + Extraction (`llm_extractor.py`)

Two GPT calls:
1. `is_rfq_email()` — binary yes/no: is this actually a procurement request? (GPT-4o-mini, cheap)
2. `extract_rfq_data()` — structured extraction: brand, part_number, quantity, UOM, item_notes, client_name, location (GPT-4o)

Also calls `get_buyer_identity()` to extract sender company name if not in the email headers.

### Step 5 — Save to DB via Next.js API (`next_api_client.py`)

Python backend never writes to PostgreSQL directly. It calls the Next.js API routes:
- `POST /api/parser/rfq-items` → saves to `raw_email_items` + `inquiries` + `inquiry_items`
- `POST /api/parser/reminders` → saves to `inquiry_reminders` for client follow-up emails

Each inquiry gets a unique code: `FIAPL0000001` format (padded 7-digit `raw_email_items.id`).

### Step 6 — Brand Auto-Detection (`vendor_discovery/brand_lookup.py`)

If a line item has a part number but no brand, a background Celery task (`vendors` queue) calls:
1. SearchAPI Google search for the part number
2. GPT-4o-mini to identify the manufacturer from search results
3. Saves identified brand back to `inquiry_items.brand` via `NEXT_INQUIRY_ITEMS_API_URL`
4. Shown in the UI with a Bot icon badge (`brand_source = 'auto'`)

### Step 7 — Vendor Discovery (on-demand, `vendor_discovery/`)

Triggered when an employee clicks **"Search Vendors"** in the Vendors tab. NOT automatic.
- `POST /discover-vendors` endpoint enqueues `discover_vendors_task` on `vendors` queue (900s time limit)
- `vendor_discovery/searcher.py`: runs 8 strict "authorized dealer" queries via SearchAPI.io. If fewer than 5 unique results, a second broader fallback pass runs automatically
- `vendor_discovery/scraper.py`: fetches vendor websites, extracts contact info (email, phone)
- `vendor_discovery/parser.py`: GPT parses scraped text for structured contact details
- **30-day cooldown per brand**: new vendors are always searched (no permanent cache) but the same brand won't be searched more than once per 30 days per inquiry
- Results saved to `vendors` table in PostgreSQL via `NEXT_VENDORS_API_URL`
- **Legacy vendors**: a separate 15k-row DB (`LEGACY_VENDORS_DB_URL`) of historical vendor quotes from old company emails, queried via `lib/legacyDb.js`, shown alongside newly discovered vendors

### Step 8 — Vendor RFQ Outreach (`vendor_outreach/`)

Employee selects vendors in the UI → clicks **"Generate Drafts"**:
- `POST /api/drafts` builds structured HTML email with a table (Part#, Brand, Description, Qty, UOM + blank columns for vendor to fill: Unit Price, Currency, Lead Time, Remarks)
- Subject includes inquiry code: `RFQ [FIAPL0000001] – Brand | PartNo`
- Employee reviews, edits if needed, clicks **"Send"**
- `POST /send-vendor-rfq` sends via the **dedicated vendor-outreach mailbox** (not individual employee mailboxes)
- Thread ID and RFC Message-ID saved to `vendor_drafts` for reply matching and reminder threading

### Step 9 — Vendor Reply Parsing (`vendor_reply/`)

Celery `vendor_replies` queue polls the vendor-outreach mailbox:
- `vendor_reply/matcher.py`: matches reply to an inquiry via `[FIAPL...]` code in subject/body
- `vendor_reply/extractor.py`: GPT extracts unit price, currency, lead time from vendor's reply email
- Saves quote to `vendor_quotes` table, linked to `vendor_drafts` and `inquiry_items`

### Step 10 — Vendor Reminders (`vendor_outreach/sender.py`)

If a vendor hasn't replied, automated reminders go out at:
- **24 hours** after send
- **3 days** after send
- **7 days** after send
Tracked via `reminder_count`, `reminder_1_sent_at`, `reminder_2_sent_at`, `reminder_3_sent_at` columns on `vendor_drafts`. Reminders are threaded (reply to the original RFQ email).

### Step 11 — Quotation to Client

Employee opens the **"Reply to Client"** tab in `InquiryDetailModal.jsx`:
- Sees all vendor quotes in a comparison table
- Selects items, sets selling prices (adds margin), sets currency and GST
- Clicks **"Send Quotation"** → `POST /api/quotes/send-to-client`
  - Generates a quotation PDF via `lib/quotationPdf.jsx`
  - Sends via the **dedicated client-reply mailbox**, threaded as a reply to the client's original RFQ email
  - For manually-created inquiries (no real Gmail thread): sends as a fresh email (MANUAL_ IDs are filtered out, not passed to Gmail API)
- Quotation saved to `quotations` table with status, line items, totals, remarks

### Step 12 — Purchase Orders

After quotation is accepted, employee creates a PO via `PurchaseOrdersTab.jsx`:
- PO generated as PDF via `lib/purchaseOrderPdf.jsx`
- Sent to vendor via `POST /send-vendor-po` through the vendor-outreach mailbox

---

## 4. Frontend Workflows

### Login / Auth
- `app/login/page.jsx` — email + password login
- **No server-side session**: `localStorage` stores `role`, `userId`, `userName`
- Roles: `admin` (full access) and `employee` (limited view)
- Default login modal opens to `employee` role tab

### Admin Dashboard (`app/admin-dashboard/page.jsx`)
- Full inquiry list with all statuses
- User management (add/remove employees)
- Blocked clients management
- Reminders panel (client follow-up emails that came in)
- Manual inquiry creation (for phone/walk-in orders)

### Employee Dashboard (`app/employee-dashboard/page.jsx`)
- Filtered view: only shows inquiries assigned to the logged-in employee
- Same inquiry detail modal as admin

### Inquiry Detail Modal (`app/components/InquiryDetailModal.jsx`)
The largest and most complex component (~2900 lines). Contains tabs:
1. **Details** — client info, line items, brand auto-detection status
2. **Vendors** — discovered vendors (web + legacy), manual vendor add, draft generation
3. **Vendor Quotes** — comparison table of all vendor replies, quote extraction
4. **Reply to Client** — quotation builder, price entry, GST, PDF preview, send
5. **Quotations** — list of all sent quotations with remarks, confirm/cancel
6. **Purchase Orders** — PO creation, send to vendor

### Manual Inquiries
Created via the admin dashboard header button → `POST /api/inquiries/manual`. Stored with `source = 'manual'` and a fake `MANUAL_<timestamp>_<rand>` message_id (because there's no real Gmail thread). This fake ID is filtered out everywhere it would be passed to the Gmail API.

---

## 5. Database Schema (Key Tables)

All tables live in the `inquiry` schema in PostgreSQL.

| Table | Purpose |
|---|---|
| `users` | FIAPL employees (id, name, email, password_hash, role, is_active) |
| `raw_email_items` | One row per processed email. `id` is the counter for FIAPL codes. `source_user_id` = which Gmail account received it |
| `inquiries` | One per client request. Links to `raw_email_items`. Has `unique_code`, `status`, `assigned_to` (FK → users) |
| `inquiry_items` | Line items (brand, part_number, quantity, uom). `brand_source = 'auto'` for GPT-detected brands |
| `vendors` | Discovered vendors (web-scraped + legacy). Has `inquiry_unique_code`, `brand`, `email`, `source` |
| `vendor_drafts` | RFQ emails to vendors. Has full send/reminder/reply tracking columns |
| `vendor_quotes` | Parsed quotes from vendor replies (unit_price, currency, lead_time) |
| `quotations` | Final quotations sent to clients. Has `remark` text column |
| `purchase_orders` | POs sent to vendors |
| `inquiry_reminders` | Client follow-up emails (not vendor reminders) |
| `blocked_clients` | Email addresses admin has blocked |

**Critical FK:** `inquiries.assigned_to BIGINT REFERENCES users(id)` — no `ON DELETE SET NULL`. If a user is deleted and re-added (gets a new ID), stale `localStorage.userId` causes FK violation. The manual inquiry API validates the userId exists and is active before using it, falling back to unassigned.

---

## 6. Celery Queues

Four separate queues, each its own worker process:

| Queue | Tasks | Notes |
|---|---|---|
| `emails` | `process_email_message`, `poll_inbox` | Core RFQ pipeline. 30/s rate limit |
| `vendors` | `discover_vendors_task` | 900s timeout (web scraping is slow) |
| `vendor_replies` | vendor reply polling + extraction | Polls vendor-outreach mailbox |
| `reminders` | vendor reminder sending | Scheduled at 24h / 3d / 7d |

Beat schedule: `poll_inbox` runs every 60s for each connected Gmail account.

---

## 7. Gmail Mailbox Architecture

Three types of Gmail accounts in this system:

1. **Client RFQ mailboxes** (multiple) — the accounts clients email with RFQs. Each connected via OAuth. Polled by Celery beat for new emails. Read-only scope.
2. **Vendor-outreach mailbox** (one) — single dedicated mailbox used to send all vendor RFQs and POs. Connected with `gmail.send` scope. Set via `VENDOR_OUTREACH_EMAIL` env var.
3. **Client-reply mailbox** (one) — single dedicated mailbox used to send all client quotations. Connected with `gmail.send` scope.

**OAuth:** One Google Cloud Project, one client ID/secret. All accounts connect through the same OAuth flow at `GET /login`. For send-capable mailboxes, use `GET /login?mailbox=vendor`.

**Token storage:** Encrypted refresh tokens stored in `gmail_users` DB table (Fernet encryption, key = `CREDENTIAL_ENCRYPTION_KEY` env var). No token files. Self-healing token refresh: on expiry, re-reads latest stored token and retries once before failing, handling concurrent refreshes.

---

## 8. Key Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `DATABASE_URL` | Railway Postgres | PostgreSQL connection string |
| `LEGACY_VENDORS_DB_URL` | Railway backend | Separate 15k-row historical vendor DB |
| `REDIS_URL` | Railway Redis | Celery broker + result backend |
| `GOOGLE_CLIENT_ID` | Railway backend | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Railway backend | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Railway backend | OAuth callback URL |
| `CREDENTIAL_ENCRYPTION_KEY` | ALL worker services | Fernet key for token encryption. **Must be identical on every worker or tokens silently fail with `invalid_grant`** |
| `OPENAI_API_KEY` | Railway backend | GPT-4o extraction |
| `SEARCHAPI_KEY` | Railway backend | Vendor discovery (SearchAPI.io) |
| `NEXT_PUBLIC_API_URL` | Railway frontend | Python backend URL |
| `NEXT_VENDORS_API_URL` | Railway backend | Next.js vendors API URL (called by Python) |
| `NEXT_INQUIRY_ITEMS_API_URL` | Railway backend | Next.js inquiry items API URL |
| `VENDOR_OUTREACH_EMAIL` | Railway backend | Vendor-outreach mailbox address |
| `CLIENT_REPLY_EMAIL` | Railway backend | Client-reply mailbox address |
| `SECRET_KEY` | Railway backend | FastAPI session middleware |

---

## 9. Git & Deployment

**Branch:** `reminders-feature` (local) tracks `origin/backend/branch` (remote). Names mismatch on purpose — established workflow. Always push with:
```
git push origin reminders-feature
```
or for Railway's backend service:
```
git push origin reminders-feature:backend/branch
```

**Railway services:** Backend (Python/FastAPI), Frontend (Next.js), Redis, Postgres — all on Railway. Railway watches `reminders-feature` / `backend/branch` for deploys.

**`main` branch:** As of 2026-07-07, `main` is fully up to date with `reminders-feature` (merged). A plain `git clone` now gives the complete codebase. `main` is used for sharing/client deployments; Railway deploys from `reminders-feature` only.

**Never force-push.** Never push to `main` without a deliberate merge decision.

---

## 10. Currency Support

All currency dropdowns use this list: `["INR", "USD", "EUR", "AED", "GBP", "JPY", "THB", "SGD", "CNY", "MYR"]`

Symbol maps used in React components (browser-safe Unicode):
```
INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ",
CNY: "¥", THB: "฿", SGD: "S$", MYR: "RM "
```

**PDF symbol rules** (Helvetica has limited Unicode — ₹ and ฿ are NOT in Helvetica):
- INR → `Rs. ` (not ₹)
- JPY / CNY → `¥` (U+00A5, safe in Helvetica)
- SGD → `S$`
- THB / AED / MYR → text prefix (`THB `, `AED `, `MYR `)
- Everything else → `CODE ` prefix

---

## 11. Multi-Tenancy Status

**Gmail auth layer: YES** — multiple Gmail accounts connect through one OAuth client. Each account's tokens, history checkpoints, and data are stored separately. The Celery worker loops over all connected accounts.

**Data layer: NO** — single PostgreSQL database, no `tenant_id` on any table. All inquiries, vendors, quotations from all connected accounts are visible to every logged-in employee. This is intentional: the system is designed for **one company (FIAPL) with multiple email accounts**, not multiple separate companies.

To support multiple isolated clients on one deployment, every table would need a `tenant_id` column and every query would need to filter by it — a significant refactor not currently planned.

**Current model for new clients:** Deploy a fresh Railway instance per client. Each deployment is completely isolated.

---

## 12. Known Architectural Decisions & Gotchas

- **Python backend never writes to PostgreSQL directly** — all DB writes go through Next.js API routes. This keeps the DB access layer in one place (Next.js) and lets the Python backend be stateless.
- **SerpAPI / SearchAPI quota exhaustion** returns HTTP 200 with an `error` key, not an HTTP error. Must be checked explicitly: `data.get("error")`.
- **Vendor draft grouping key:** `email + "\x00" + name` — two different vendors with the same email but different names get separate drafts. One vendor dealing in multiple brands gets one combined draft.
- **Manual inquiry fake IDs:** `MANUAL_<timestamp>_<rand>` in `raw_email_items.message_id`. These are filtered out before any Gmail API call (`startswith("MANUAL_")` check) so they never cause "Invalid id value" errors.
- **`detailModal` state:** must be derived live from the inquiries array (via `detailModalCode`), not stored as a frozen snapshot object — otherwise SSE/polling updates never reach the open modal.
- **Brand detection badge** uses `brand_source = 'auto'` in `inquiry_items`, shown with a Bot icon in `BrandCell` inside `InquiryDetailModal.jsx`.
- **Excel RFQ fast-path:** `download_and_parse_excel_rfq()` reads structured data directly from Excel, bypassing LLM. Takes priority over GPT extraction when an Excel attachment is present.

---

## 13. Working Agreements

- Push only when user explicitly says to push — don't push automatically after implementing a fix.
- Confirm before any shared-state action: force-pushes, branch merges, infra changes.
- Find real root causes, not workarounds.
- Cross-inquiry vendor data must never silently become a permanent cache — the 30-day cooldown is intentional to keep growing the supplier base.
- No multi-paragraph docstrings or comment blocks. Code comments only for non-obvious WHY, not WHAT.
