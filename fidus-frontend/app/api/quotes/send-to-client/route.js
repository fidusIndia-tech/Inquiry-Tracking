import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { pool, query } from "@/lib/db";
import QuotationDocument from "@/lib/quotationPdf";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const IGST_RATE = 0.18;

let _schemaReady = false;
async function ensureQuotationsSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id                  SERIAL PRIMARY KEY,
      quotation_number    TEXT UNIQUE,
      inquiry_unique_code TEXT NOT NULL,
      salesperson         TEXT,
      quoted_at           TIMESTAMPTZ DEFAULT NOW(),
      expiration_date     DATE,
      lines               JSONB,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _schemaReady = true;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatPrice(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  const symbol = CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : "");
  return `${symbol}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function buildQuoteEmail(clientName, quotationNumber, lines) {
  const rows = lines
    .map((l, idx) => `
      <tr>
        <td style="border:1px solid #D0DCF4;padding:8px;">${idx + 1}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;font-weight:600;">${escapeHtml(l.part_number || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;color:#475569;">${escapeHtml(l.description || "")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;">${escapeHtml(l.quantity ?? "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;">${escapeHtml(formatPrice(l.selling_price, l.currency))}</td>
      </tr>`)
    .join("");

  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">
  <p>Dear ${escapeHtml(clientName || "")} Team,</p>
  <p>Thank you for your enquiry. Please find our quotation <b>${escapeHtml(quotationNumber)}</b> for the requested items below — full details, terms and conditions are in the attached PDF.</p>

  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
    <thead>
      <tr>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">#</th>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Part Number</th>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Description</th>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Qty</th>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Unit Price</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <p>Prices are subject to our standard terms and conditions. Please let us know if you'd like to proceed or need any clarification.</p>

  <p>Warm regards,<br/>
  FIAPL Sales Team<br/>
  Fidus India Pvt. Ltd.</p>
</div>`.trim();
}

/**
 * Sends the final quotation to the client, threaded as a reply to their
 * original RFQ email, with a PDF attached matching the company's existing
 * Odoo-generated quotation layout. `lines` is the employee-selected best
 * vendor quote per part, each carrying a manually entered selling_price
 * (cost + margin) and lead_time.
 */
export async function POST(request) {
  try {
    await ensureQuotationsSchema();
    const { unique_code, lines, salesperson } = await request.json();
    if (!unique_code || !lines?.length) {
      return Response.json({ error: "unique_code and lines are required" }, { status: 400 });
    }

    const inquiryRes = await query(
      `SELECT i.client_name, i.location, i.sender_email, i.subject, r.thread_id, r.message_id
       FROM inquiries i
       LEFT JOIN raw_email_items r ON r.id = i.raw_email_item_id
       WHERE i.unique_code = $1
       LIMIT 1`,
      [unique_code]
    );
    const inquiry = inquiryRes.rows[0];
    if (!inquiry) return Response.json({ error: "Inquiry not found" }, { status: 404 });
    if (!inquiry.sender_email) return Response.json({ error: "Inquiry has no client email" }, { status: 400 });

    const quotedAt = new Date();
    const expirationDate = new Date(quotedAt);
    expirationDate.setDate(expirationDate.getDate() + 21);

    // Insert first to get a guaranteed-unique id, then derive the human
    // facing quotation number from it (QT-2026-0040 style).
    const inserted = await query(
      `INSERT INTO quotations (inquiry_unique_code, salesperson, expiration_date, lines)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [unique_code, salesperson || null, expirationDate.toISOString().slice(0, 10), JSON.stringify(lines)]
    );
    const quotationId = inserted.rows[0].id;
    const quotationNumber = `QT-${quotedAt.getFullYear()}-${String(quotationId).padStart(4, "0")}`;
    await query(`UPDATE quotations SET quotation_number = $1 WHERE id = $2`, [quotationNumber, quotationId]);

    const pdfBuffer = await renderToBuffer(
      React.createElement(QuotationDocument, {
        quotationNumber,
        quotedAt,
        salesperson,
        clientName: inquiry.client_name,
        clientAddress: inquiry.location,
        lines,
      })
    );
    const pdfBase64 = pdfBuffer.toString("base64");

    const body = buildQuoteEmail(inquiry.client_name, quotationNumber, lines);

    const sendRes = await fetch(`${PYTHON_BACKEND_URL}/send-client-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unique_code,
        client_email: inquiry.sender_email,
        subject: inquiry.subject || `Quotation – ${unique_code}`,
        body,
        thread_id: inquiry.thread_id || null,
        in_reply_to_message_id: inquiry.message_id || null,
        attachment_filename: `${quotationNumber}.pdf`,
        attachment_base64: pdfBase64,
      }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok || sendData.status !== "sent") {
      return Response.json({ error: sendData.detail || sendData.error || "Send failed" }, { status: 502 });
    }

    await query(
      `UPDATE inquiries SET status = 'quoted', quoted_at = NOW() WHERE unique_code = $1`,
      [unique_code]
    );

    return Response.json({ status: "sent", quotation_number: quotationNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
