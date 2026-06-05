import { withTransaction } from "@/lib/db";
import {
  buildInquiryItems,
  extractEmail,
  extractSenderName,
  isInternalEmail,
  normalizeParserPayload,
} from "@/lib/inquiry-normalizer";

export async function POST(request) {
  try {
    const payload = await request.json();
    const rawItem = normalizeParserPayload(payload);
    const serializedLineItems = rawItem.line_items
      ? typeof rawItem.line_items === "string"
        ? rawItem.line_items
        : JSON.stringify(rawItem.line_items)
      : null;

    if (!rawItem.message_id && !rawItem.subject) {
      return Response.json(
        { error: "message_id or subject is required" },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
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
            line_items,
            sender,
            subject,
            email_date,
            parser_created_at,
            processing_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, 'processing')
          ON CONFLICT (message_id) WHERE message_id IS NOT NULL
          DO UPDATE SET
            thread_id = EXCLUDED.thread_id,
            username = EXCLUDED.username,
            location = EXCLUDED.location,
            brands = EXCLUDED.brands,
            part_numbers = EXCLUDED.part_numbers,
            quantities = EXCLUDED.quantities,
            notes = EXCLUDED.notes,
            line_items = EXCLUDED.line_items,
            sender = EXCLUDED.sender,
            subject = EXCLUDED.subject,
            email_date = EXCLUDED.email_date,
            parser_created_at = EXCLUDED.parser_created_at,
            processing_status = 'processing',
            processing_error = NULL
          RETURNING *
        `,
        [
          rawItem.parser_row_id,
          rawItem.message_id,
          rawItem.thread_id,
          rawItem.source_user_id,
          rawItem.username,
          rawItem.location,
          rawItem.brands,
          rawItem.part_numbers,
          rawItem.quantities,
          rawItem.notes,
          serializedLineItems,
          rawItem.sender,
          rawItem.subject,
          rawItem.email_date,
          rawItem.parser_created_at,
        ]
      );

      const savedRawItem = rawResult.rows[0];
      const uniqueCode = `FIAPL${String(savedRawItem.id).padStart(7, "0")}`;
      const headerEmail = extractEmail(savedRawItem.sender);
      const senderEmail = rawItem.sender_email || (isInternalEmail(headerEmail) ? null : headerEmail);
      const senderName = savedRawItem.username || extractSenderName(savedRawItem.sender, null);

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
          rawItem.client_name || null,
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
              uom,
              item_notes
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            inquiry.id,
            item.brand,
            item.partNumber,
            item.quantity,
            item.uom,
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
