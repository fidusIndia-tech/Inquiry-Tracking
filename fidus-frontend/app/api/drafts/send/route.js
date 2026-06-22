import { query } from "@/lib/db";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

/**
 * One-click send: looks up the draft, asks the Python backend to send it via
 * the single dedicated vendor-outreach mailbox, then records the resulting
 * Gmail thread/message ids so replies and reminders can be matched back to
 * this draft later.
 */
export async function POST(request) {
  try {
    const { draft_id } = await request.json();
    if (!draft_id) return Response.json({ error: "draft_id is required" }, { status: 400 });

    const draftRes = await query(`SELECT * FROM vendor_drafts WHERE id = $1`, [draft_id]);
    const draft = draftRes.rows[0];
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    if (!draft.vendor_email) return Response.json({ error: "Draft has no vendor email" }, { status: 400 });
    if (draft.status === "sent" || draft.status === "replied") {
      return Response.json({ error: "Draft was already sent" }, { status: 409 });
    }

    const sendRes = await fetch(`${PYTHON_BACKEND_URL}/send-vendor-rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_id: draft.id,
        unique_code: draft.inquiry_unique_code,
        vendor_email: draft.vendor_email,
        subject: draft.subject,
        body: draft.body,
      }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok || sendData.status !== "sent") {
      return Response.json({ error: sendData.detail || sendData.error || "Send failed" }, { status: 502 });
    }

    const updated = await query(
      `UPDATE vendor_drafts
       SET status = 'sent', thread_id = $1, message_id = $2, rfc_message_id = $3, sent_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [sendData.thread_id, sendData.message_id, sendData.rfc_message_id || null, draft.id]
    );

    return Response.json({ draft: updated.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
