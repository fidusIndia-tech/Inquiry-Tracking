# FidusSource / Inquiry Tracking — Continuation Notes

Snapshot for picking the project back up. Written 2026-06-25. Read this instead of
re-deriving everything from old chat history.

## What this project is

Procurement automation SaaS for **Fidus India Pvt Ltd (FIAPL)**, an industrial
automation parts company. Pipeline: client emails an RFQ → Gmail ingestion →
GPT extracts line items (part number, brand, qty) → employee finds vendors →
vendor RFQs go out → vendor replies get parsed → employee adds margin → final
quotation PDF goes to the client.

**Stack:** Python/FastAPI/Celery/Redis backend (`d:\miniproject\app`, Gmail RFQ
processing) + Next.js (App Router, Next 16 / React 19) + PostgreSQL frontend
(`d:\miniproject\app\fidus-frontend`), deployed on Railway.

**Git:** single repo. Local branch `reminders-feature` tracks remote
`origin/backend/branch` (mismatched names on purpose — established workflow).
Push with `git push origin reminders-feature:backend/branch`. Never force-push.
`main` is a **separate, diverged line** maintained by a colleague — see
"Branch divergence" below, this matters.

## Architecture facts worth remembering

- **Gmail OAuth multi-tenant**: one OAuth client, many Gmail accounts in
  `gmail_users` table, encrypted refresh tokens via Fernet
  (`CREDENTIAL_ENCRYPTION_KEY` env var — must be set on **every** worker
  service or token decryption silently fails and looks like an `invalid_grant`
  Google error).
- **Celery queues**, each its own worker process so one slow task can't block
  email processing: `emails` (client RFQ pipeline), `vendors` (vendor
  discovery, 900s time limit), `vendor_replies` (poll + extract), `reminders`.
- **One vendor-outreach mailbox + one client-reply mailbox** — deliberately
  not the 12-13 individual employee mailboxes.
- **SerpAPI** for vendor discovery (`vendor_discovery/searcher.py`). Plans:
  Starter $25/1000 searches, Developer $75/5000, Production $150/15000.
  Free-plan quota gets exhausted fast under testing — SerpAPI returns HTTP 200
  with an `error` key on quota exhaustion, not a raised exception, so this
  must be checked explicitly or it looks identical to "Google found nothing."
- **Cross-inquiry vendor reuse**: explicitly NOT "skip search if already
  cached" — user wants new vendors found every time to grow the supplier base,
  so it's a **30-day cooldown** per brand, not a permanent cache
  (`vendor_discovery/__init__.py` → `get_brand_status()` / cooldown check).
- **Legacy "Company History" data source**: a separate 15k-row Postgres DB
  of historical vendor quotes scraped from old company emails, queried via
  `lib/legacyDb.js` (`LEGACY_VENDORS_DB_URL`), shown alongside live
  web-discovered vendors in the Vendors tab.
- **Brand auto-detection**: when a line item has no brand but has a part
  number, `vendor_discovery/brand_lookup.py` searches Google + GPT-4o-mini to
  identify the manufacturer, same as an employee would manually. Tagged
  `brand_source = 'auto'` in `inquiry_items`, shown with a Bot-icon badge in
  the UI (`BrandCell` in `InquiryDetailModal.jsx`). GPT prompt was tuned to
  return short, search-friendly names (not "McCoy- Ellison, inc." style legal
  names) because the brand gets wrapped in an exact-phrase Google search.
- **Quotation PDF** (`lib/quotationPdf.jsx`, via `@react-pdf/renderer`)
  mirrors an existing Odoo-style template exactly — logo placeholder, "Think &
  Get" tagline, CIN, 9-column items table, IGST 18%, all 11 terms verbatim.
  Supports per-vendor currency (`CURRENCY_SYMBOLS` map), not hardcoded ₹.

## Branch divergence — important, found 2026-06-25

`main` and `reminders-feature` have **diverged hard** and do not contain each
other's work:

- `reminders-feature` has ~21 commits not in `main`: the entire vendor
  discovery/outreach/reply/quote-comparison/PDF pipeline, brand
  auto-detection, all the Railway/healthcheck/basePath fixes.
- `main` has 2 commits not in `reminders-feature`: `4a5590f` ("Add reply-chain
  filtering, Reminders panel, and HTML table extraction") and `ef6b775` ("Add
  Reminders page to admin dashboard with manual inquiry creation") — looks
  like a colleague's separate feature work.
- Merge base: `2523c14`.

**This needs a deliberate merge decision with the user before anything else
structural happens** — find out which branch Railway's frontend service
actually deploys from, and reconcile the two lines of work. Don't merge
unilaterally; this is shared state.

## Open bug (in progress, not yet fixed — paused to write this file)

**Reply-to-Client tab, quote comparison table**: user wants clicking on the
**vendor's name/email itself** to expand and show the vendor's raw reply
text. What's actually implemented (`InquiryDetailModal.jsx`, `QuotesTab`
component, ~line 1094-1150): there's a separate small "Reply ⌄" button next
to the vendor cell that *does* correctly toggle `expanded[q.id]` state and
reveal the raw-reply row below — that mechanism works. But the vendor
name/email `<td>` itself (~line 1110-1113) has no click handler, so clicking
directly on the mail/name (which is what the user is doing, per their
screenshot description) does nothing. That's the actual bug — not a
state/data issue, just need to wire the click handler onto the vendor cell
too (not just the small button).

Fix (drafted, not yet applied — user interrupted to ask for this summary
first): wrap the vendor-name/email block in a `<div>` with
`cursor-pointer` + the same `onClick={() => q.raw_reply && setExpanded(...)}`
toggle as the existing button, guarded on `q.raw_reply` truthiness so cells
with no reply text stay unclickable.

Confirmed NOT the bug: `expanded` state scoping is correct (lives in
`QuotesTab`, not lost on remount — `InquiryDetailModal` has no `key` prop, so
polling/SSE refreshes don't remount it), imports are fine (`ChevronUp`/
`ChevronDown` imported correctly), and the file is committed/clean on
`reminders-feature` with no uncommitted changes or missing remote commits.

## Known fixed bugs this session (for history, don't re-fix)

- `rfq_filter.py` Layer-1 false positives dropping legitimate buyer RFQs
  ("please feel free to contact" / "feel free to contact us" seller-signal
  phrases; `fidusindia7@gmail.com` hard-dropped before forwarded-check).
- Manual vendor filter hiding manually-added vendors not in the recognized
  brand list (`filteredManual = manual` — no filtering).
- Case-sensitive brand filter vs case-insensitive SQL `ILIKE` — fixed via
  `normBrand()`.
- Quotation PDF showing ₹0.00 everywhere — field name mismatch
  (`unit_price` vs actual `selling_price`).
- PDF currency hardcoded to ₹ regardless of vendor currency.
- Brand auto-detection saves silently failing — Railway env var
  `NEXT_INQUIRY_ITEMS_API_URL` had the variable name typed into its own value
  field.
- Brand-detection badge never appearing — root cause was `detailModal` being
  a frozen snapshot object in both dashboards, never updated by SSE/poll
  refresh; fixed by deriving it live from the `inquiries` array via
  `detailModalCode`.
- `CREDENTIAL_ENCRYPTION_KEY` missing on new worker services →
  `invalid_grant` (took many turns to isolate — ruled out token expiry,
  reauth scopes, client ID/secret, DB/region mismatch first).
- SerpAPI silently returning empty on quota exhaustion — now logs
  `data.get("error")` explicitly.
- Scraper burning 6+ minutes per dead domain — `_fetch_url` now returns
  `(text, unreachable)`, `fetch_contact_page` bails on first unreachable
  domain instead of trying all paths; `_CONTACT_PATHS` trimmed 30→10.
- `basePath` (added for portal embedding by colleague) broke all direct
  Railway URL access — reverted `basePath`/`healthcheckPath`, left other
  proxy-embed files in place as harmless.
- Conditional-fallback SerpAPI search for niche brands
  (`vendor_discovery/searcher.py`): strict 8 "authorized dealer" queries run
  first; if total unique results < 5, a second broader pass
  (`_FALLBACK_QUERIES`, no "authorized" requirement) runs automatically.
  Latest commit on this: not yet pushed as of this file's writing — confirm
  push status before assuming it's live.

## Working agreements (how this user likes to work)

- Confirms a fix verbally, then says "push" as a separate, explicit step —
  don't push automatically just because a fix is implemented and described.
- Wants real root causes, not workarounds — e.g. pushed back twice on the
  brand-badge bug until the actual frozen-snapshot cause was found.
- Cross-inquiry vendor data should never silently turn into a permanent
  cache that stops new vendor discovery — growth (new vendors) matters more
  than saving API calls.
- Shared-state actions (force-push restoration, branch merges, basePath
  changes affecting a colleague's work) get flagged and confirmed before
  acting, even under time pressure.
