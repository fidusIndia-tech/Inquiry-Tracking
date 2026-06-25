import { pool, query, withTransaction } from "@/lib/db";

let _inquiriesSchemaReady = false;
async function ensureInquiriesSchema() {
  if (_inquiriesSchemaReady) return;
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_ref_name TEXT");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS remark TEXT");
  await pool.query("ALTER TABLE inquiry_items ADD COLUMN IF NOT EXISTS brand_source TEXT");
  _inquiriesSchemaReady = true;
}

export async function GET() {
  try {
    await ensureInquiriesSchema();

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
        i.assigned_to,
        i.assigned_at,
        i.assigned_ref_name,
        i.in_progress_at,
        i.quoted_at,
        i.remark,
        u.name AS assigned_to_name,
        i.created_at,
        r.message_id,
        r.thread_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ii.id,
              'brand', ii.brand,
              'brandSource', ii.brand_source,
              'partNumber', ii.part_number,
              'quantity', ii.quantity,
              'uom', ii.uom,
              'vendor', ii.vendor,
              'itemNotes', ii.item_notes
            )
          ) FILTER (WHERE ii.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM inquiries i
      LEFT JOIN raw_email_items r ON r.id = i.raw_email_item_id
      LEFT JOIN inquiry_items ii ON ii.inquiry_id = i.id
      LEFT JOIN users u ON u.id = i.assigned_to
      GROUP BY i.id, r.id, u.id
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

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const uniqueCode = payload.unique_code || payload.uniqueCode;

    if (!uniqueCode) {
      return Response.json({ error: "unique_code is required" }, { status: 400 });
    }

    const result = await query(
      `
        UPDATE inquiries
        SET
          client_name = $1,
          location = $2,
          sender_name = $3,
          sender_email = $4,
          subject = $5,
          notes = $6,
          updated_at = NOW()
        WHERE unique_code = $7
        RETURNING
          unique_code,
          client_name,
          location,
          sender_name,
          sender_email,
          subject,
          notes
      `,
      [
        payload.client_name || null,
        payload.location || null,
        payload.sender_name || null,
        payload.sender_email || null,
        payload.subject || null,
        payload.notes || null,
        uniqueCode,
      ]
    );

    if (result.rowCount === 0) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }

    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ inquiry: result.rows[0] });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update inquiry" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { unique_code, sender_email } = await request.json();

    if (!unique_code && !sender_email) {
      return Response.json({ error: "unique_code or sender_email is required" }, { status: 400 });
    }

    let deletedCount = 0;

    await withTransaction(async (client) => {
      const inqResult = sender_email
        ? await client.query(
            `SELECT id FROM inquiries WHERE LOWER(sender_email) = LOWER($1)`,
            [sender_email.trim()]
          )
        : await client.query(
            `SELECT id FROM inquiries WHERE unique_code = $1`,
            [unique_code]
          );

      if (!inqResult.rows.length) {
        if (!sender_email) throw new Error("Inquiry not found");
        return;
      }

      const inquiryIds = inqResult.rows.map((r) => r.id);
      await client.query(`DELETE FROM inquiry_items WHERE inquiry_id = ANY($1)`, [inquiryIds]);
      await client.query(`DELETE FROM inquiries    WHERE id = ANY($1)`,          [inquiryIds]);
      await client.query("SELECT pg_notify('inquiries_changed', '')");
      deletedCount = inquiryIds.length;
    });

    return Response.json({ success: true, deleted: deletedCount });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to delete inquiry" },
      { status: 500 }
    );
  }
}
