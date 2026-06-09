import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`
      SELECT
        r.id, r.inquiry_id, r.thread_id, r.message_id,
        r.sender_email, r.sender_name, r.subject,
        r.llm_summary, r.received_at, r.status, r.created_at,
        i.unique_code, i.client_name, i.status AS inquiry_status
      FROM inquiry_reminders r
      LEFT JOIN inquiries i ON i.id = r.inquiry_id
      ORDER BY r.received_at DESC
    `);
    return Response.json({ reminders: result.rows });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to fetch reminders" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const { id, status } = await request.json();
    if (!id || !["unread", "seen", "actioned"].includes(status)) {
      return Response.json({ error: "Invalid id or status" }, { status: 400 });
    }
    await query(
      "UPDATE inquiry_reminders SET status = $1 WHERE id = $2",
      [status, id]
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update reminder" },
      { status: 500 }
    );
  }
}
