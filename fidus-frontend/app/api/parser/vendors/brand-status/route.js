import { pool, query } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendors (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      website             TEXT,
      domain              TEXT UNIQUE,
      email               TEXT,
      phone               TEXT,
      city                TEXT,
      country             TEXT,
      is_authorized_dealer BOOLEAN DEFAULT FALSE,
      source              TEXT DEFAULT 'serpapi',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_brand_coverage (
      id            SERIAL PRIMARY KEY,
      vendor_id     INT REFERENCES vendors(id) ON DELETE CASCADE,
      brand         TEXT NOT NULL,
      part_number   TEXT,
      discovered_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(vendor_id, brand, part_number)
    )
  `);
  _schemaReady = true;
}

/**
 * Tells the Python discovery pipeline whether a brand was searched recently,
 * so it can skip a redundant paid SerpAPI run and just reuse vendors already
 * known for that brand (see discover_and_store_vendors' cooldown check).
 */
export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    if (!brand) return Response.json({ error: "brand is required" }, { status: 400 });

    const result = await query(
      `SELECT COUNT(DISTINCT vendor_id) AS count, MAX(discovered_at) AS last_discovered_at
       FROM vendor_brand_coverage
       WHERE brand ILIKE $1`,
      [brand]
    );

    const row = result.rows[0] || {};
    return Response.json({
      count: Number(row.count || 0),
      last_discovered_at: row.last_discovered_at,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
