import { query } from "@/lib/db";

/**
 * Called by the Python Reminder Agent (beat task). Returns sent drafts that
 * have had no vendor reply for longer than `hours` and have not already been
 * reminded, so each draft is followed up at most once.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = Number(searchParams.get("hours") || 24);

    const result = await query(
      `SELECT * FROM vendor_drafts
       WHERE status = 'sent'
         AND sent_at IS NOT NULL
         AND sent_at < NOW() - ($1 || ' hours')::interval
         AND replied_at IS NULL
         AND reminded_at IS NULL
       ORDER BY sent_at ASC`,
      [hours]
    );
    return Response.json({ drafts: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
