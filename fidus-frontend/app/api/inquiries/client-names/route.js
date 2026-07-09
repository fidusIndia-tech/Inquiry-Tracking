import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(
      `SELECT DISTINCT client_name FROM inquiries
       WHERE client_name IS NOT NULL AND client_name <> ''
       ORDER BY client_name`
    );
    return Response.json({ names: result.rows.map((r) => r.client_name) });
  } catch (error) {
    return Response.json({ names: [] });
  }
}
