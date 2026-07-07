import { pool, query } from "@/lib/db";

let _vendorSchemaReady = false;
async function ensureVendorSchema() {
  if (_vendorSchemaReady) return;
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
      source              TEXT DEFAULT 'searchapi',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_brand_coverage (
      id           SERIAL PRIMARY KEY,
      vendor_id    INT REFERENCES vendors(id) ON DELETE CASCADE,
      brand        TEXT NOT NULL,
      part_number  TEXT,
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
  _vendorSchemaReady = true;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const {
      name, website, domain, email, phone, city, country,
      is_authorized_dealer, source,
      brand, part_number, inquiry_unique_code,
    } = payload;

    if (!name && !domain) {
      return Response.json({ error: "name or domain required" }, { status: 400 });
    }

    await ensureVendorSchema();

    // Upsert vendor by domain (one record per vendor website)
    const vendorResult = await query(
      `INSERT INTO vendors (name, website, domain, email, phone, city, country, is_authorized_dealer, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (domain) DO UPDATE SET
         email                = COALESCE(EXCLUDED.email, vendors.email),
         phone                = COALESCE(EXCLUDED.phone, vendors.phone),
         city                 = COALESCE(EXCLUDED.city,  vendors.city),
         country              = COALESCE(EXCLUDED.country, vendors.country),
         is_authorized_dealer = EXCLUDED.is_authorized_dealer OR vendors.is_authorized_dealer,
         updated_at           = NOW()
       RETURNING id, (xmax = 0) AS is_new`,
      [
        name || domain, website || null, domain || null,
        email || null, phone || null, city || null, country || null,
        is_authorized_dealer || false, source || "searchapi",
      ]
    );

    const vendorId = vendorResult.rows[0].id;
    const isNew    = vendorResult.rows[0].is_new;

    // Track which brand/part this vendor covers
    if (brand && part_number) {
      await query(
        `INSERT INTO vendor_brand_coverage (vendor_id, brand, part_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (vendor_id, brand, part_number) DO NOTHING`,
        [vendorId, brand, part_number]
      );
    }

    // Link vendor to the specific inquiry
    if (inquiry_unique_code && brand && part_number) {
      await query(
        `INSERT INTO inquiry_vendors (inquiry_unique_code, vendor_id, brand, part_number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (inquiry_unique_code, vendor_id, brand, part_number) DO NOTHING`,
        [inquiry_unique_code, vendorId, brand, part_number]
      );
    }

    return Response.json({ vendorId, isNew }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to store vendor" },
      { status: 500 }
    );
  }
}
