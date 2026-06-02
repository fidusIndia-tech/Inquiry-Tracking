import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`
      SELECT
        i.id,
        i.unique_code,
        i.client_name,
        i.location,
        i.sender_name,
        i.sender_email,
        i.subject,
        i.notes,
        i.email_date,
        i.status,
        i.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ii.id,
              'brand', ii.brand,
              'partNumber', ii.part_number,
              'quantity', ii.quantity,
              'uom', ii.uom,
              'vendor', ii.vendor,
              'itemNotes', ii.item_notes
            )
            ORDER BY ii.id
          ) FILTER (WHERE ii.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM inquiries i
      LEFT JOIN inquiry_items ii ON ii.inquiry_id = i.id
      GROUP BY i.id
      ORDER BY i.email_date DESC NULLS LAST, i.created_at DESC
    `);

    return Response.json({ inquiries: result.rows });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load inquiries" },
      { status: 500 }
    );
  }
}
