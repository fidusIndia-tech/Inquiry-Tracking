import { pool, query } from "@/lib/db";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_discovery_runs (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT UNIQUE NOT NULL,
      status              TEXT NOT NULL DEFAULT 'queued',
      total_items         INT DEFAULT 0,
      items_done          INT DEFAULT 0,
      current_brand       TEXT,
      vendors_found       INT DEFAULT 0,
      error               TEXT,
      started_at          TIMESTAMPTZ,
      finished_at         TIMESTAMPTZ,
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _schemaReady = true;
}

/**
 * Employee-triggered vendor discovery — vendor search no longer runs
 * automatically when an RFQ is exported (that loaded the worker for every
 * inquiry regardless of whether anyone ever worked it). Tapping "Search
 * Vendors" in the Vendors tab calls this, which enqueues the real Celery
 * task in the Python backend and starts a progress row the UI can poll.
 *
 * Only brands that don't already have a vendor linked to this inquiry are
 * sent — brands already covered (including via the 30-day cooldown reuse
 * path) are skipped so re-tapping the button never re-pays for a search
 * that already has a usable answer.
 */
export async function POST(request) {
  try {
    await ensureSchema();
    const { unique_code } = await request.json();
    if (!unique_code) return Response.json({ error: "unique_code is required" }, { status: 400 });

    const existing = await query(
      `SELECT status FROM vendor_discovery_runs WHERE inquiry_unique_code = $1`,
      [unique_code]
    );
    if (existing.rows[0] && ["queued", "running"].includes(existing.rows[0].status)) {
      return Response.json({ status: existing.rows[0].status, message: "Discovery already in progress" });
    }

    const itemsRes = await query(
      `SELECT ii.brand, ii.part_number, ii.item_notes
       FROM inquiry_items ii
       JOIN inquiries i ON i.id = ii.inquiry_id
       WHERE i.unique_code = $1 AND ii.part_number IS NOT NULL AND ii.part_number != ''`,
      [unique_code]
    );
    if (itemsRes.rows.length === 0) {
      return Response.json({ error: "Inquiry has no line items with a part number" }, { status: 404 });
    }

    const coveredRes = await query(
      `SELECT DISTINCT LOWER(brand) AS brand FROM inquiry_vendors WHERE inquiry_unique_code = $1 AND brand IS NOT NULL`,
      [unique_code]
    );
    const covered = new Set(coveredRes.rows.map((r) => r.brand));

    const lineItems = itemsRes.rows
      .filter((r) => !(r.brand && covered.has(r.brand.toLowerCase())))
      .map((r) => ({
        brand: r.brand || null,
        part_number: r.part_number || null,
        notes: r.item_notes || null,
      }));

    if (lineItems.length === 0) {
      return Response.json({ status: "skipped", message: "All brands already have discovered vendors" });
    }

    await query(
      `INSERT INTO vendor_discovery_runs
         (inquiry_unique_code, status, total_items, items_done, current_brand, vendors_found, error, started_at, finished_at, updated_at)
       VALUES ($1, 'queued', $2, 0, NULL, 0, NULL, NOW(), NULL, NOW())
       ON CONFLICT (inquiry_unique_code) DO UPDATE SET
         status = 'queued', total_items = $2, items_done = 0, current_brand = NULL,
         vendors_found = 0, error = NULL, started_at = NOW(), finished_at = NULL, updated_at = NOW()`,
      [unique_code, lineItems.length]
    );

    const res = await fetch(`${PYTHON_BACKEND_URL}/discover-vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unique_code, line_items: lineItems }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.detail || data.error || "Failed to start discovery";
      await query(
        `UPDATE vendor_discovery_runs SET status = 'failed', error = $2, updated_at = NOW() WHERE inquiry_unique_code = $1`,
        [unique_code, message]
      );
      return Response.json({ error: message }, { status: 502 });
    }

    return Response.json({ status: "queued" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
