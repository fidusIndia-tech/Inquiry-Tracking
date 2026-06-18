import { pool, query } from "@/lib/db";
import { legacyQuery } from "@/lib/legacyDb";

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
  _vendorSchemaReady = true;
}

export async function GET(request) {
  try {
    await ensureVendorSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    const brand      = searchParams.get("brand");
    const partNumber = searchParams.get("part_number");
    // brands param: comma-separated list passed by frontend from inquiry.items
    const brandsParam = searchParams.get("brands");

    let result;

    if (uniqueCode) {
      // ── Discovered vendors (SerpAPI) for this inquiry ─────────────────────
      const discoveredResult = await query(
        `SELECT
           v.id, v.name, v.website, v.domain, v.email, v.phone,
           v.city, v.country, v.is_authorized_dealer, v.source, v.updated_at,
           iv.brand, iv.part_number
         FROM inquiry_vendors iv
         JOIN vendors v ON v.id = iv.vendor_id
         WHERE iv.inquiry_unique_code = $1
         ORDER BY v.is_authorized_dealer DESC, v.email NULLS LAST, v.name`,
        [uniqueCode]
      );

      // ── Build brand list for legacy lookup ────────────────────────────────
      // Prefer brands from the request param (from inquiry.items), fall back
      // to brands already in inquiry_vendors.
      let brandList = brandsParam
        ? brandsParam.split(",").map((b) => b.trim()).filter(Boolean)
        : [];
      const discoveredBrands = [
        ...new Set(discoveredResult.rows.map((v) => v.brand).filter(Boolean)),
      ];
      brandList = [...new Set([...brandList, ...discoveredBrands])];

      // ── Legacy vendor history from parts_table ────────────────────────────
      let legacy = [];
      if (brandList.length > 0) {
        try {
          const legacyResult = await legacyQuery(
            `SELECT DISTINCT ON (LOWER(email_from), brand)
               id,
               supplier      AS name,
               email_from    AS email,
               brand,
               part_no,
               price,
               currency,
               delivery_time
             FROM parts_table
             WHERE brand ILIKE ANY($1::text[])
               AND email_from IS NOT NULL
               AND email_from <> ''
             ORDER BY LOWER(email_from), brand, id DESC`,
            [brandList]
          );
          legacy = legacyResult.rows;
        } catch (e) {
          console.error("Legacy DB query failed:", e.message);
        }
      }

      return Response.json({ discovered: discoveredResult.rows, legacy });
    }

    if (brand && partNumber) {
      result = await query(
        `SELECT
           v.id, v.name, v.website, v.domain, v.email, v.phone,
           v.city, v.country, v.is_authorized_dealer, v.source, v.updated_at,
           vbc.brand, vbc.part_number
         FROM vendor_brand_coverage vbc
         JOIN vendors v ON v.id = vbc.vendor_id
         WHERE vbc.brand ILIKE $1 AND vbc.part_number ILIKE $2
         ORDER BY v.is_authorized_dealer DESC, v.email NULLS LAST`,
        [brand, partNumber]
      );
    } else if (brand) {
      result = await query(
        `SELECT
           v.id, v.name, v.website, v.domain, v.email, v.phone,
           v.city, v.country, v.is_authorized_dealer, v.source, v.updated_at,
           vbc.brand, vbc.part_number
         FROM vendor_brand_coverage vbc
         JOIN vendors v ON v.id = vbc.vendor_id
         WHERE vbc.brand ILIKE $1
         ORDER BY v.is_authorized_dealer DESC, v.email NULLS LAST`,
        [brand]
      );
    } else {
      result = await query(
        `SELECT
           v.id, v.name, v.website, v.domain, v.email, v.phone,
           v.city, v.country, v.is_authorized_dealer, v.source, v.updated_at,
           vbc.brand, vbc.part_number,
           iv.inquiry_unique_code
         FROM vendor_brand_coverage vbc
         JOIN vendors v ON v.id = vbc.vendor_id
         LEFT JOIN inquiry_vendors iv
           ON iv.vendor_id = v.id
           AND iv.brand = vbc.brand
           AND iv.part_number = vbc.part_number
         ORDER BY v.updated_at DESC
         LIMIT 500`
      );
    }

    return Response.json({ vendors: result.rows });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to fetch vendors" },
      { status: 500 }
    );
  }
}
