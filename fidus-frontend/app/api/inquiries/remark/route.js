import { query } from "@/lib/db";

export async function PATCH(request) {
  try {
    const { unique_code, remark } = await request.json();
    if (!unique_code) {
      return Response.json({ error: "unique_code is required" }, { status: 400 });
    }
    const result = await query(
      `UPDATE inquiries SET remark = $1, updated_at = NOW() WHERE unique_code = $2 RETURNING unique_code`,
      [remark ?? null, unique_code]
    );
    if (result.rowCount === 0) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }
    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update remark" },
      { status: 500 }
    );
  }
}
