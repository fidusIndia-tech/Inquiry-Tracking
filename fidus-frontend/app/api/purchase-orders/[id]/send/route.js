import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { query } from "@/lib/db";
import PurchaseOrderDocument from "@/lib/purchaseOrderPdf";

const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPoEmailBody(po, items) {
  const cur = (po.currency || "INR").toUpperCase();
  const fmt = (v) =>
    `${cur} ${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = (items || [])
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#F8FAFF"};">
        <td style="border:1px solid #D0DCF4;padding:7px 8px;">${String(i + 1).padStart(2, "0")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;font-weight:600;">${escapeHtml(item.part_number || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;">${escapeHtml(item.description || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;">${escapeHtml(item.brand || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;text-align:right;">${escapeHtml(item.quantity || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;">${escapeHtml(item.uom || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;text-align:right;">${item.unit_price != null ? fmt(item.unit_price) : "—"}</td>
        <td style="border:1px solid #D0DCF4;padding:7px 8px;">${escapeHtml(item.lead_time || "—")}</td>
      </tr>`
    )
    .join("");

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:#1f2937;max-width:720px;">
  <p style="font-size:15px;font-weight:bold;color:#B45309;">Purchase Order # ${escapeHtml(po.po_number)}</p>

  <p>Dear ${escapeHtml(po.vendor_name || "Vendor")},</p>
  <p>
    Kindly find attached our Purchase Order <strong>${escapeHtml(po.po_number)}</strong>
    for your reference. Please confirm receipt and provide a delivery schedule at your earliest convenience.
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;">
    <thead>
      <tr>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">#</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">Part Number</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">Description</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">Make</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:right;">Qty</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">UOM</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:right;">Unit Price</th>
        <th style="border:1px solid #D0DCF4;padding:8px;background:#EEF4FF;color:#4461A8;text-align:left;">Lead Time</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p style="text-align:right;margin-top:8px;font-size:13px;">
    Untaxed Amount: ${fmt(po.subtotal)}<br/>
    ${po.gst_type === "IGST"      ? `IGST (${po.gst_rate}%): ${fmt(po.tax_amount)}<br/>` : ""}
    ${po.gst_type === "CGST_SGST" ? `CGST (${Number(po.gst_rate)/2}%): ${fmt(Number(po.tax_amount)/2)}<br/>SGST (${Number(po.gst_rate)/2}%): ${fmt(Number(po.tax_amount)/2)}<br/>` : ""}
    <strong>Total: ${fmt(po.grand_total)}</strong>
  </p>

  ${po.notes ? `<p style="background:#FFF9C4;padding:8px 12px;border-radius:4px;font-size:12px;"><strong>Special Instructions:</strong> ${escapeHtml(po.notes)}</p>` : ""}

  <p>
    Please feel free to reach out for any clarifications.<br/>
    Warm regards,<br/>
    <strong>Fidus India Automation Pvt. Ltd.</strong><br/>
    39SP, HSIIDC Udyog Vihar Phase VI, Gurugram – 122001<br/>
    Ph: 0124-2979669 | fidusindia@gmail.com
  </p>
</div>`.trim();
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    // Fetch PO with items
    const result = await query(
      `SELECT po.*,
              (SELECT json_agg(poi ORDER BY poi.id) FROM purchase_order_items poi
               WHERE poi.purchase_order_id = po.id) AS items,
              q.quotation_number
       FROM purchase_orders po
       LEFT JOIN quotations q ON q.id = po.quotation_id
       WHERE po.id = $1`,
      [id]
    );
    const po = result.rows[0];
    if (!po) return Response.json({ error: "PO not found" }, { status: 404 });
    if (po.status === "cancelled") return Response.json({ error: "Cannot send a cancelled PO" }, { status: 400 });
    if (!po.vendor_email) return Response.json({ error: "Vendor email is not set on this PO" }, { status: 400 });

    const items = po.items || [];

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      React.createElement(PurchaseOrderDocument, {
        poNumber:        po.po_number,
        poDate:          po.created_at,
        inquiryCode:     po.inquiry_unique_code,
        quotationNumber: po.quotation_number || null,
        vendorName:      po.vendor_name,
        vendorEmail:     po.vendor_email,
        vendorPhone:     po.vendor_phone,
        vendorAddress:   po.vendor_address,
        items,
        currency:        po.currency || "INR",
        subtotal:        Number(po.subtotal)    || 0,
        grandTotal:      Number(po.grand_total) || 0,
        taxAmount:       Number(po.tax_amount)  || 0,
        gstType:              po.gst_type  || "NONE",
        gstRate:              Number(po.gst_rate) || 0,
        notes:                po.notes,
        salesRepresentative:  po.sales_representative || null,
        termsText:            po.terms_text || null,
      })
    );

    const subject = `Purchase Order ${po.po_number} — Fidus India Automation Pvt. Ltd. [${po.inquiry_unique_code}]`;
    const body = buildPoEmailBody(po, items);
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // Call Python backend to send via vendor mailbox
    const backendRes = await fetch(`${PYTHON_BACKEND_URL}/send-vendor-po`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        po_id:        Number(id),
        vendor_email: po.vendor_email,
        subject,
        body,
        pdf_base64:   pdfBase64,
        filename:     `${po.po_number}.pdf`,
      }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}));
      return Response.json({ error: err.detail || "Backend send failed" }, { status: 502 });
    }

    const sendResult = await backendRes.json();

    // Mark PO as sent
    await query(
      `UPDATE purchase_orders SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id]
    );

    return Response.json({
      ok: true,
      po_number:  po.po_number,
      message_id: sendResult.message_id,
      thread_id:  sendResult.thread_id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
