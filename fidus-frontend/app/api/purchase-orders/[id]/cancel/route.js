import { query } from "@/lib/db";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await query(
      `UPDATE purchase_orders
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND status != 'cancelled'
       RETURNING *`,
      [id]
    );
    if (!result.rows[0]) return Response.json({ error: "PO not found or already cancelled" }, { status: 404 });
    return Response.json({ purchase_order: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
