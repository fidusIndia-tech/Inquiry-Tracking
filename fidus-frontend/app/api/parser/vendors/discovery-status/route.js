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

/** Polled by the Vendors tab while a discovery run is in progress. */
export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    if (!uniqueCode) return Response.json({ error: "unique_code is required" }, { status: 400 });

    // If a run hasn't received any update in 5 minutes while still queued/running,
    // the Python worker likely crashed or stalled — mark it failed so the UI
    // stops polling and shows a "Retry" button instead of spinning forever.
    await query(
      `UPDATE vendor_discovery_runs
       SET status = 'failed', error = 'Search timed out — no progress for 5 minutes. Try again.'
       WHERE inquiry_unique_code = $1
         AND status IN ('queued', 'running')
         AND updated_at < NOW() - INTERVAL '5 minutes'`,
      [uniqueCode]
    );

    const result = await query(
      `SELECT status, total_items, items_done, current_brand, vendors_found, error, started_at, finished_at, updated_at
       FROM vendor_discovery_runs WHERE inquiry_unique_code = $1`,
      [uniqueCode]
    );

    return Response.json({ run: result.rows[0] || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
