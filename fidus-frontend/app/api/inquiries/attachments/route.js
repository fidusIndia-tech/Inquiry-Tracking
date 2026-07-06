import { query } from "@/lib/db";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

/**
 * Returns the list of file attachments on the original client RFQ email for
 * a given inquiry. Employees use this to optionally forward drawings, photos,
 * or spec sheets to the vendor along with the RFQ email.
 *
 * Query param: ?unique_code=FIAPL-...
 * Returns: { attachments: [{attachment_id, filename, mime_type, size}], message_id, user_id }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const unique_code = searchParams.get("unique_code");
    if (!unique_code) return Response.json({ attachments: [] });

    const result = await query(
      `SELECT r.message_id, r.source_user_id
       FROM inquiries i
       JOIN raw_email_items r ON r.id = i.raw_email_item_id
       WHERE i.unique_code = $1
       LIMIT 1`,
      [unique_code]
    );
    const row = result.rows[0];
    if (!row?.message_id) {
      return Response.json({ attachments: [], message_id: null, user_id: null });
    }

    const user_id = row.source_user_id || process.env.CLIENT_MAILBOX_USER_ID;
    if (!user_id) {
      return Response.json({ attachments: [], message_id: row.message_id, user_id: null });
    }

    const pyRes = await fetch(
      `${PYTHON_BACKEND_URL}/list-email-attachments?message_id=${encodeURIComponent(row.message_id)}&user_id=${encodeURIComponent(user_id)}`
    );
    if (!pyRes.ok) {
      return Response.json({ attachments: [], message_id: row.message_id, user_id });
    }
    const data = await pyRes.json();
    return Response.json({
      attachments: data.attachments || [],
      message_id: row.message_id,
      user_id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
