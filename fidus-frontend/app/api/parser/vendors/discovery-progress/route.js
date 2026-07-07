import { pool, query } from "@/lib/db";

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
 * Called by discover_vendors_task (Python) after each line item it
 * processes, so the Vendors tab can poll discovery-status and show a live
 * progress bar instead of a blind spinner. Best-effort on the Python side —
 * a dropped update here just means one less progress tick, never a failure.
 */
export async function POST(request) {
  try {
    await ensureSchema();
    const { unique_code, status, total_items, items_done, current_brand, vendors_found, error } =
      await request.json();
    if (!unique_code) return Response.json({ error: "unique_code is required" }, { status: 400 });

    const finished = status === "done" || status === "failed";

    await query(
      `INSERT INTO vendor_discovery_runs
         (inquiry_unique_code, status, total_items, items_done, current_brand, vendors_found, error, started_at, finished_at, updated_at)
       VALUES ($1, COALESCE($2, 'running'), COALESCE($3, 0), COALESCE($4, 0), $5, COALESCE($6, 0), $7, NOW(), CASE WHEN $8 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (inquiry_unique_code) DO UPDATE SET
         status        = COALESCE($2, vendor_discovery_runs.status),
         total_items   = COALESCE($3, vendor_discovery_runs.total_items),
         items_done    = COALESCE($4, vendor_discovery_runs.items_done),
         current_brand = $5,
         vendors_found = COALESCE($6, vendor_discovery_runs.vendors_found),
         error         = $7,
         finished_at   = CASE WHEN $8 THEN NOW() ELSE vendor_discovery_runs.finished_at END,
         updated_at    = NOW()`,
      [unique_code, status || null, total_items ?? null, items_done ?? null, current_brand || null, vendors_found ?? null, error || null, finished]
    );

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
