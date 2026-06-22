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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiry_vendors (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT,
      vendor_id           INT REFERENCES vendors(id) ON DELETE CASCADE,
      brand               TEXT,
      part_number         TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(inquiry_unique_code, vendor_id, brand, part_number)
    )
  `);
  _schemaReady = true;
}

/**
 * Cooldown fast-path: when the Python discovery pipeline decides a brand was
 * searched recently enough to skip a fresh SerpAPI run, it calls this to link
 * every vendor already known for that brand to the new inquiry instead —
 * same outcome the employee sees, zero search cost.
 */
export async function POST(request) {
  try {
    await ensureSchema();
    const { brand, part_number, inquiry_unique_code } = await request.json();

    if (!brand || !part_number || !inquiry_unique_code) {
      return Response.json(
        { error: "brand, part_number, and inquiry_unique_code are required" },
        { status: 400 }
      );
    }

    const vendorIds = await query(
      `SELECT DISTINCT vendor_id FROM vendor_brand_coverage WHERE brand ILIKE $1`,
      [brand]
    );

    let linked = 0;
    for (const row of vendorIds.rows) {
      const res = await query(
        `INSERT INTO inquiry_vendors (inquiry_unique_code, vendor_id, brand, part_number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (inquiry_unique_code, vendor_id, brand, part_number) DO NOTHING
         RETURNING id`,
        [inquiry_unique_code, row.vendor_id, brand, part_number]
      );
      if (res.rows[0]) linked++;
    }

    return Response.json({ linked, candidates: vendorIds.rows.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
