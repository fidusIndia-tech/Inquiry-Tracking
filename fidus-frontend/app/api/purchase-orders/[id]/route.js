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
    const body = await request.json();
    const ALLOWED = [
      "vendor_name", "vendor_email", "vendor_phone", "vendor_address",
      "notes", "sales_representative", "terms_text",
      "gst_type", "gst_rate", "currency",
    ];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of ALLOWED) {
      if (key in body) { setClauses.push(`${key} = $${idx++}`); values.push(body[key]); }
    }
    // Recalculate tax when GST fields change
    if ("gst_type" in body || "gst_rate" in body) {
      const curRes = await query(`SELECT subtotal, gst_type, gst_rate FROM purchase_orders WHERE id = $1`, [id]);
      const cur = curRes.rows[0];
      if (cur) {
        const sub      = Number(cur.subtotal) || 0;
        const gType    = ("gst_type" in body ? body.gst_type : cur.gst_type) || "NONE";
        const gRate    = Number("gst_rate" in body ? body.gst_rate : cur.gst_rate) || 0;
        const taxAmt   = gType !== "NONE" ? sub * gRate / 100 : 0;
        setClauses.push(`tax_amount = $${idx++}`);  values.push(taxAmt);
        setClauses.push(`grand_total = $${idx++}`); values.push(sub + taxAmt);
      }
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
