import { withTransaction } from "@/lib/db";
import {
  buildInquiryItems,
  extractEmail,
  extractSenderName,
  normalizeParserPayload,
} from "@/lib/inquiry-normalizer";

export async function POST(request) {
  try {
    const payload = await request.json();
    const rawItem = normalizeParserPayload(payload);

    if (!rawItem.message_id && !rawItem.subject) {
      return Response.json(
        { error: "message_id or subject is required" },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // Fingerprint dedup: if same content already exists, skip creating a new inquiry.
      const fingerprint = payload.source_fingerprint || null;
      if (fingerprint) {
        const existing = await client.query(
          `SELECT r.id, i.unique_code, i.id AS inquiry_id, i.status
           FROM raw_email_items r
           JOIN inquiries i ON i.raw_email_item_id = r.id
           WHERE r.source_fingerprint = $1
           LIMIT 1`,
          [fingerprint]
        );
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          return {
            skipped: true,
            reason: "duplicate_fingerprint",
            rawEmailItemId: row.id,
            inquiryId: row.inquiry_id,
            uniqueCode: row.unique_code,
            itemCount: 0,
          };
        }
      }

      const rawResult = await client.query(
        `
          INSERT INTO raw_email_items (
            parser_row_id,
            message_id,
            thread_id,
            source_user_id,
            username,
            location,
            brands,
            part_numbers,
            quantities,
            notes,
            sender,
            subject,
            email_date,
            parser_created_at,
            source_fingerprint,
            processing_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'processing')
          ON CONFLICT (message_id) WHERE message_id IS NOT NULL
          DO UPDATE SET
            thread_id = EXCLUDED.thread_id,
            username = EXCLUDED.username,
            location = EXCLUDED.location,
            brands = EXCLUDED.brands,
            part_numbers = EXCLUDED.part_numbers,
            quantities = EXCLUDED.quantities,
            notes = EXCLUDED.notes,
            sender = EXCLUDED.sender,
            subject = EXCLUDED.subject,
            email_date = EXCLUDED.email_date,
            parser_created_at = EXCLUDED.parser_created_at,
            source_fingerprint = EXCLUDED.source_fingerprint,
            processing_status = 'processing',
            processing_error = NULL
          RETURNING *
        `,
        [
          rawItem.parser_row_id,
          rawItem.message_id,
          payload.thread_id || null,
          rawItem.source_user_id,
          rawItem.username,
          rawItem.location,
          rawItem.brands,
          rawItem.part_numbers,
          rawItem.quantities,
          rawItem.notes,
          rawItem.sender,
          rawItem.subject,
          rawItem.email_date,
          rawItem.parser_created_at,
          fingerprint,
        ]
      );

      const savedRawItem = rawResult.rows[0];
      const uniqueCode = `FIAPL${String(savedRawItem.id).padStart(7, "0")}`;
      const senderEmail = extractEmail(savedRawItem.sender);
      const senderName = extractSenderName(savedRawItem.sender, savedRawItem.username);

      const inquiryResult = await client.query(
        `
          INSERT INTO inquiries (
            unique_code,
            raw_email_item_id,
            client_name,
            location,
            sender_name,
            sender_email,
            subject,
            notes,
            email_date,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
          ON CONFLICT (unique_code)
          DO UPDATE SET
            client_name = EXCLUDED.client_name,
            location = EXCLUDED.location,
            sender_name = EXCLUDED.sender_name,
            sender_email = EXCLUDED.sender_email,
            subject = EXCLUDED.subject,
            notes = EXCLUDED.notes,
            email_date = EXCLUDED.email_date,
            updated_at = NOW()
          RETURNING *
        `,
        [
          uniqueCode,
          savedRawItem.id,
          savedRawItem.username,
          savedRawItem.location,
          senderName,
          senderEmail,
          savedRawItem.subject,
          savedRawItem.notes,
          savedRawItem.email_date,
        ]
      );

      const inquiry = inquiryResult.rows[0];
      const items = buildInquiryItems(savedRawItem);

      await client.query("DELETE FROM inquiry_items WHERE inquiry_id = $1", [
        inquiry.id,
      ]);

      for (const item of items) {
        await client.query(
          `
            INSERT INTO inquiry_items (
              inquiry_id,
              brand,
              part_number,
              quantity,
              item_notes
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            inquiry.id,
            item.brand,
            item.partNumber,
            item.quantity,
            item.itemNotes,
          ]
        );
      }

      await client.query(
        "UPDATE raw_email_items SET processing_status = 'processed', processing_error = NULL WHERE id = $1",
        [savedRawItem.id]
      );

      return {
        rawEmailItemId: savedRawItem.id,
        inquiryId: inquiry.id,
        uniqueCode: inquiry.unique_code,
        itemCount: items.length,
      };
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to import parser item" },
      { status: 500 }
    );
  }
}
