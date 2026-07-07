import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { pool, query } from "@/lib/db";
import QuotationDocument from "@/lib/quotationPdf";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", JPY: "¥" };

function computeGstData(lines, gstOpt, customTax) {
  const taxable = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 1) * (Number(l.selling_price) || 0),
    0
  );
  const type = gstOpt?.type || "NONE";
  const rate = Number(gstOpt?.rate) || 0;
  let cgst = 0, sgst = 0, igst = 0, customAmount = 0;
  let customName = "", customRate = 0;
  if (type === "CGST_SGST") { cgst = sgst = taxable * (rate / 2) / 100; }
  if (type === "IGST")      { igst = taxable * rate / 100; }
  if (type === "CUSTOM") {
    customName = String(customTax?.name || "").trim() || "Custom Tax";
    customRate = Math.max(0, Number(customTax?.rate) || 0);
    customAmount = taxable * customRate / 100;
  }
  const totalGst = cgst + sgst + igst + customAmount;
  return {
    type, rate, label: gstOpt?.label || "No GST",
    taxable, cgst, sgst, igst,
    customName, customRate, customAmount,
    totalGst, grandTotal: taxable + totalGst,
  };
}

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
  // Revision/amendment tracking (Odoo-style) — added alongside the original
  // columns above rather than a new table, since this table already is the
  // one-row-per-sent-quotation record the revision chain needs to count.
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS amendment_code TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS amendment_date DATE`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS is_revision BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS parent_quotation_id INT REFERENCES quotations(id)`);
  // Denormalized at send-time so the Quotation Summary panel can report on
  // real quotations without re-deriving tax math or re-joining client info
  // from inquiries every time.
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent'`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_name TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_email TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_amount NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS grand_total NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_type TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_rate NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS custom_tax_name TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS custom_tax_rate NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_note TEXT`);
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

function fmtAmt(v, currency) {
  const sym = CURRENCY_SYMBOLS[(currency || "INR").toUpperCase()] ?? `${(currency || "INR").toUpperCase()} `;
  return sym + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildGstRows(gstData, currency) {
  const fmt = (v) => fmtAmt(v, currency);
  const td = (label, value, bold) =>
    `<tr>
       <td colspan="4" style="border:none;padding:4px 8px;text-align:right;font-size:13px;color:#475569;">${escapeHtml(label)}</td>
       <td style="border:none;padding:4px 8px;text-align:right;font-size:13px;${bold ? "font-weight:700;color:#1f2937;" : "color:#475569;"}">${escapeHtml(value)}</td>
     </tr>`;
  const rows = [];
  rows.push(td("Taxable Amount", fmt(gstData.taxable)));
  if (gstData.type === "CGST_SGST") {
    rows.push(td(`CGST @ ${gstData.rate / 2}%`, fmt(gstData.cgst)));
    rows.push(td(`SGST @ ${gstData.rate / 2}%`, fmt(gstData.sgst)));
  } else if (gstData.type === "IGST") {
    rows.push(td(`IGST @ ${gstData.rate}%`, fmt(gstData.igst)));
  } else if (gstData.type === "CUSTOM") {
    rows.push(td(`${gstData.customName} @ ${gstData.customRate}%`, fmt(gstData.customAmount)));
  } else if (gstData.type === "EXPORT") {
    rows.push(td("GST (Export / LUT / Zero Rated)", fmt(0)));
  } else {
    rows.push(td("GST", fmt(0)));
  }
  rows.push(`<tr><td colspan="5" style="padding:0 8px;"><hr style="border:none;border-top:1px solid #D0DCF4;margin:4px 0;" /></td></tr>`);
  rows.push(td("Grand Total", fmt(gstData.grandTotal), true));
  return rows.join("\n");
}

function buildQuoteEmail(clientName, quotationNumber, lines, gstData, salesperson, employeePhone, currency, clientNote) {
  const rows = lines
    .map((l, idx) => `
      <tr>
        <td style="border:1px solid #D0DCF4;padding:8px;">${idx + 1}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;font-weight:600;">${escapeHtml(l.part_number || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;color:#475569;">${escapeHtml(l.description || "")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;">${escapeHtml(l.quantity ?? "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:8px;text-align:right;">${escapeHtml(formatPrice(l.selling_price, currency || l.currency))}</td>
        ${l.remark ? `<td style="border:1px solid #D0DCF4;padding:8px;color:#78716c;font-size:12px;">${escapeHtml(l.remark)}</td>` : `<td style="border:1px solid #D0DCF4;padding:8px;"></td>`}
      </tr>`)
    .join("");

  const noteHtml = clientNote
    ? `<div style="margin:16px 0;padding:12px 16px;background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:4px;">
         <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#92400E;">Note from FIDUS INDIA:</p>
         <p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;">${escapeHtml(clientNote)}</p>
       </div>`
    : "";

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
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:right;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Unit Price</th>
        <th style="border:1px solid #D0DCF4;padding:8px;text-align:left;background:#EEF4FF;color:#4461A8;font-size:11px;text-transform:uppercase;">Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${buildGstRows(gstData, currency)}
    </tbody>
  </table>

  ${gstData.type === "EXPORT" ? '<p style="font-size:12px;color:#6b7280;"><i>Note: Export / LUT / Zero Rated supply. GST not applicable as per LUT/bond, if applicable.</i></p>' : ""}
  ${noteHtml}
  <p>Prices are subject to our standard terms and conditions. Please let us know if you'd like to proceed or need any clarification.${employeePhone ? ` You can also reach us at <b>${escapeHtml(employeePhone)}</b>.` : ""}</p>

  <p>Warm regards,<br/>
  ${salesperson ? `${escapeHtml(salesperson)}<br/>` : ""}FIAPL Sales Team<br/>
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
    const { unique_code, lines, salesperson, gstOption, customTax, employee_id, quote_currency, terms_text, client_note } = await request.json();
    const currency = (quote_currency || "INR").toUpperCase();
    const gstData = computeGstData(lines, gstOption, customTax);
    if (!unique_code || !lines?.length) {
      return Response.json({ error: "unique_code and lines are required" }, { status: 400 });
    }

    // Salesperson here is the free-typed name already shown on the PDF —
    // this only adds the phone number, looked up from the logged-in
    // employee's own record, so the client has a real contact number
    // instead of none at all.
    let employeePhone = null;
    if (employee_id) {
      const empRes = await query(`SELECT phone FROM users WHERE id = $1`, [employee_id]);
      employeePhone = empRes.rows[0]?.phone || null;
    }

    const inquiryRes = await query(
      `SELECT i.client_name, i.sender_name, i.location, i.sender_email, i.subject, r.thread_id, r.message_id
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

    // Revision/amendment numbering, Odoo-style: the first quotation sent for
    // a FIAPL code is the base quote; every additional one sent afterward is
    // an automatic revision (R1, R2, ...). Only rows that actually finished
    // sending count toward this — a failed attempt must never burn a
    // revision slot or shift later, successful revision numbers.
    const priorRes = await query(
      `SELECT id FROM quotations WHERE inquiry_unique_code = $1 AND status = 'sent' ORDER BY id ASC`,
      [unique_code]
    );
    const revisionNumber = priorRes.rows.length;
    const isRevision = revisionNumber > 0;
    const baseQuotationNumber = `${unique_code}-QTN-001`;
    const quotationNumber = isRevision ? `${baseQuotationNumber}-R${revisionNumber}` : baseQuotationNumber;
    const amendmentCode = isRevision ? `R${revisionNumber}` : null;
    const amendmentDate = isRevision ? quotedAt.toISOString().slice(0, 10) : null;
    const parentQuotationId = isRevision ? priorRes.rows[0].id : null;

    const customTerms = terms_text
      ? terms_text.split("\n").map((t) => t.trim()).filter(Boolean)
      : null;

    const pdfBuffer = await renderToBuffer(
      React.createElement(QuotationDocument, {
        quotationNumber,
        quotedAt,
        amendmentCode,
        amendmentDate,
        salesperson,
        clientName:    inquiry.client_name,
        senderName:    inquiry.sender_name,
        clientAddress: inquiry.location,
        lines,
        gstData,
        quoteCurrency: currency,
        customTerms,
        clientNote:    client_note || null,
      })
    );
    const pdfBase64 = pdfBuffer.toString("base64");

    const body = buildQuoteEmail(inquiry.client_name, quotationNumber, lines, gstData, salesperson, employeePhone, currency, client_note || null);

    const sendRes = await fetch(`${PYTHON_BACKEND_URL}/send-client-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unique_code,
        client_email: inquiry.sender_email,
        subject: inquiry.subject || `Quotation – ${unique_code}`,
        body,
        // Manual inquiries have a fake MANUAL_... message_id — passing it to
        // the Gmail API causes "Invalid id value". Send as a fresh email instead.
        thread_id: (inquiry.thread_id && !String(inquiry.thread_id).startsWith("MANUAL_")) ? inquiry.thread_id : null,
        in_reply_to_message_id: (inquiry.message_id && !String(inquiry.message_id).startsWith("MANUAL_")) ? inquiry.message_id : null,
        attachment_filename: `${quotationNumber}.pdf`,
        attachment_base64: pdfBase64,
      }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok || sendData.status !== "sent") {
      return Response.json({ error: sendData.detail || sendData.error || "Send failed" }, { status: 502 });
    }

    // Only persisted once the email has actually gone out — see the
    // comment above on why this can't happen any earlier.
    await query(
      `INSERT INTO quotations
         (quotation_number, inquiry_unique_code, salesperson, quoted_at, expiration_date, lines,
          revision_number, amendment_code, amendment_date, is_revision, parent_quotation_id,
          status, client_name, sender_name, client_email, currency,
          taxable_amount, tax_amount, grand_total, gst_type, gst_rate, custom_tax_name, custom_tax_rate,
          terms_and_conditions, client_note, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10,$11, $12,$13,$14,$15,$16, $17,$18,$19,$20,$21,$22,$23, $24,$25, NOW())`,
      [
        quotationNumber, unique_code, salesperson || null, quotedAt,
        expirationDate.toISOString().slice(0, 10), JSON.stringify(lines),
        revisionNumber, amendmentCode, amendmentDate, isRevision, parentQuotationId,
        "sent", inquiry.client_name || null, inquiry.sender_name || null, inquiry.sender_email || null, currency,
        gstData.taxable, gstData.totalGst, gstData.grandTotal, gstData.type, gstData.rate,
        gstData.customName || null, gstData.customRate || null,
        terms_text || null, client_note || null,
      ]
    );

    await query(
      `UPDATE inquiries SET status = 'quoted', quoted_at = NOW() WHERE unique_code = $1`,
      [unique_code]
    );

    return Response.json({
      status: "sent",
      quotation_number: quotationNumber,
      revision_number: revisionNumber,
      amendment_code: amendmentCode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
