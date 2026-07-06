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
    const {
      draft_id,
      client_attachments = [],    // [{attachment_id, filename, mime_type}] — from original client email
      uploaded_attachments = [],  // [{filename, data_base64, mime_type}]   — uploaded by employee
    } = await request.json();
    if (!draft_id) return Response.json({ error: "draft_id is required" }, { status: 400 });

    const draftRes = await query(`SELECT * FROM vendor_drafts WHERE id = $1`, [draft_id]);
    const draft = draftRes.rows[0];
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    if (!draft.vendor_email) return Response.json({ error: "Draft has no vendor email" }, { status: 400 });
    if (draft.status === "sent" || draft.status === "replied") {
      return Response.json({ error: "Draft was already sent" }, { status: 409 });
    }

    // Look up original client email's message_id + user_id so Python can
    // fetch the attachment bytes from the client Gmail mailbox.
    let clientMessageId = null;
    let clientUserId = null;
    if (client_attachments.length > 0) {
      const inquiryRes = await query(
        `SELECT r.message_id, r.source_user_id
         FROM vendor_drafts vd
         JOIN inquiries i ON i.unique_code = vd.inquiry_unique_code
         JOIN raw_email_items r ON r.id = i.raw_email_item_id
         WHERE vd.id = $1
         LIMIT 1`,
        [draft_id]
      );
      clientMessageId = inquiryRes.rows[0]?.message_id || null;
      clientUserId = inquiryRes.rows[0]?.source_user_id || process.env.CLIENT_MAILBOX_USER_ID || null;
    }

    // Enrich each client attachment with the source message_id + user_id
    const enrichedClientAttachments = client_attachments
      .filter((a) => a.attachment_id && clientMessageId && clientUserId)
      .map((a) => ({
        attachment_id: a.attachment_id,
        filename: a.filename,
        mime_type: a.mime_type || "application/octet-stream",
        message_id: clientMessageId,
        user_id: clientUserId,
      }));

    const sendRes = await fetch(`${PYTHON_BACKEND_URL}/send-vendor-rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_id: draft.id,
        unique_code: draft.inquiry_unique_code,
        vendor_email: draft.vendor_email,
        subject: draft.subject,
        body: draft.body,
        client_attachments: enrichedClientAttachments,
        uploaded_attachments,
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
