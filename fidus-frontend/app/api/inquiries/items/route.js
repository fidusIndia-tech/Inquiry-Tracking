import { query } from "@/lib/db";

/**
 * Lets an admin/employee correct a line item's brand when the client's
 * email didn't state it explicitly but the part number is recognizable
 * (e.g. starts with a known manufacturer prefix). Editing the brand here
 * makes the item eligible for vendor discovery and brand-based filtering,
 * which both require a non-null brand.
 */
export async function PATCH(request) {
  try {
    const { id, brand } = await request.json();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const result = await query(
      `UPDATE inquiry_items SET brand = $1 WHERE id = $2 RETURNING id, brand`,
      [brand?.trim() || null, id]
    );
    if (result.rowCount === 0) {
      return Response.json({ error: "Line item not found" }, { status: 404 });
    }

    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ item: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
