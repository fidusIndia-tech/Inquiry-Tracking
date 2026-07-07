import { query } from "@/lib/db";

export async function POST(request) {
  try {
    const { unique_code, user_id } = await request.json();

    if (!unique_code || !user_id) {
      return Response.json({ error: "unique_code and user_id are required" }, { status: 400 });
    }

    await query(
      `INSERT INTO inquiry_price_views (inquiry_unique_code, user_id, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (inquiry_unique_code, user_id)
       DO UPDATE SET last_seen_at = NOW()`,
      [unique_code, Number(user_id)]
    );

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to mark prices as seen" }, { status: 500 });
  }
}
