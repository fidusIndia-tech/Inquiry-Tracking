import { query } from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT po.*,
              (SELECT json_agg(poi ORDER BY poi.id)
               FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS items
       FROM purchase_orders po WHERE po.id = $1`,
      [id]
    );
    if (!result.rows[0]) return Response.json({ error: "PO not found" }, { status: 404 });
    return Response.json({ purchase_order: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { vendor_name, vendor_email, vendor_phone, vendor_address, notes } = await request.json();
    const fields = { vendor_name, vendor_email, vendor_phone, vendor_address, notes };
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) { setClauses.push(`${key} = $${idx++}`); values.push(value); }
    }
    if (setClauses.length === 0) return Response.json({ error: "no fields to update" }, { status: 400 });
    values.push(id);
    const result = await query(
      `UPDATE purchase_orders SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return Response.json({ purchase_order: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
