import { query } from "@/lib/db";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uniqueCode  = searchParams.get("unique_code");
    const brand       = searchParams.get("brand");
    const partNumber  = searchParams.get("part_number");

    let result;

    if (uniqueCode) {
      // All vendors discovered for a specific inquiry
      result = await query(
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
    } else if (brand && partNumber) {
      // All vendors known for a brand + part (cache lookup)
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
      // All vendors known for a brand (all parts)
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
      return Response.json(
        { error: "Provide unique_code, brand+part_number, or brand" },
        { status: 400 }
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
