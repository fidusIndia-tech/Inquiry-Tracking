import { query } from "@/lib/db";

/**
 * Mark a quotation as client-confirmed (accepted).
 * Also moves the parent inquiry to 'converted' status.
 * This is the prerequisite for PO generation.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const existing = await query(
      `SELECT id, inquiry_unique_code, status FROM quotations WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return Response.json({ error: "Quotation not found" }, { status: 404 });
    }
    const q = existing.rows[0];
    if (q.status === "cancelled") {
      return Response.json({ error: "Cannot confirm a cancelled quotation" }, { status: 400 });
    }

    await query(
      `UPDATE quotations SET status = 'accepted' WHERE id = $1`,
      [id]
    );
    await query(
      `UPDATE inquiries SET status = 'converted', converted_at = NOW()
       WHERE unique_code = $1 AND status NOT IN ('converted')`,
      [q.inquiry_unique_code]
    );

    return Response.json({ ok: true, quotation_id: id, inquiry_unique_code: q.inquiry_unique_code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
