import { pool, query } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query("ALTER TABLE inquiry_items ADD COLUMN IF NOT EXISTS brand_source TEXT");
  _schemaReady = true;
}

/**
 * Lets an admin/employee correct a line item's brand, part number, or quantity
 * from the Details tab.
 *
 * Two ways to target a row:
 *  - { id, brand | part_number | quantity }   — manual edit from the Details tab.
 *    Brand edits clear brand_source since a human just confirmed/overrode it.
 *  - { unique_code, part_number, brand, source: "auto" } — called by the
 *    Python brand-identification step when it successfully searches out a
 *    brand the client never stated. Tags the row so the UI can show it was
 *    machine-detected, not typed by a person.
 */
export async function PATCH(request) {
  try {
    await ensureSchema();
    const { id, unique_code, part_number, brand, quantity, source } = await request.json();

    let result;
    if (id) {
      if (part_number !== undefined) {
        result = await query(
          `UPDATE inquiry_items SET part_number = $1 WHERE id = $2 RETURNING id, part_number`,
          [part_number?.trim() || null, id]
        );
      } else if (quantity !== undefined) {
        result = await query(
          `UPDATE inquiry_items SET quantity = $1 WHERE id = $2 RETURNING id, quantity`,
          [quantity?.toString().trim() || null, id]
        );
      } else {
        // Brand edit from the Details tab (existing behaviour)
        result = await query(
          `UPDATE inquiry_items SET brand = $1, brand_source = NULL WHERE id = $2 RETURNING id, brand, brand_source`,
          [brand?.trim() || null, id]
        );
      }
    } else if (unique_code && part_number) {
      result = await query(
        `UPDATE inquiry_items ii
         SET brand = $1, brand_source = $2
         FROM inquiries i
         WHERE ii.inquiry_id = i.id
           AND i.unique_code = $3
           AND ii.part_number = $4
         RETURNING ii.id, ii.brand, ii.brand_source`,
        [brand?.trim() || null, source === "auto" ? "auto" : null, unique_code, part_number]
      );
    } else {
      return Response.json({ error: "id, or unique_code + part_number, is required" }, { status: 400 });
    }

    if (result.rowCount === 0) {
      return Response.json({ error: "Line item not found" }, { status: 404 });
    }

    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ item: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
