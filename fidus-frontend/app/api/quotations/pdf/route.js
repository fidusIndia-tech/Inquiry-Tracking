import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { query } from "@/lib/db";
import QuotationDocument from "@/lib/quotationPdf";

/**
 * No PDF file is ever stored on disk/blob storage — the original send-time
 * PDF is generated in memory and discarded once attached to the email. This
 * regenerates an identical PDF on demand from the same columns the original
 * was built from, rather than introducing file storage just for downloads.
 */
function computeGstData(taxableAmount, gstType, gstRate, taxAmount, grandTotal, customTaxName, customTaxRate) {
  return {
    type: gstType || "NONE",
    rate: Number(gstRate) || 0,
    label: "",
    taxable: Number(taxableAmount) || 0,
    cgst: gstType === "CGST_SGST" ? (Number(taxAmount) || 0) / 2 : 0,
    sgst: gstType === "CGST_SGST" ? (Number(taxAmount) || 0) / 2 : 0,
    igst: gstType === "IGST" ? Number(taxAmount) || 0 : 0,
    customName: customTaxName || "",
    customRate: Number(customTaxRate) || 0,
    customAmount: gstType === "CUSTOM" ? Number(taxAmount) || 0 : 0,
    totalGst: Number(taxAmount) || 0,
    grandTotal: Number(grandTotal) || 0,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const result = await query(
      `SELECT q.*,
              COALESCE(i.location, q.billing_address)   AS client_address,
              COALESCE(q.sender_name, i.sender_name)    AS resolved_sender_name
       FROM quotations q
       LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
       WHERE q.id = $1`,
      [id]
    );
    const q = result.rows[0];
    if (!q) return Response.json({ error: "Quotation not found" }, { status: 404 });

    const gstData = computeGstData(
      q.taxable_amount, q.gst_type, q.gst_rate, q.tax_amount, q.grand_total,
      q.custom_tax_name, q.custom_tax_rate
    );

    const pdfBuffer = await renderToBuffer(
      React.createElement(QuotationDocument, {
        quotationNumber: q.quotation_number,
        quotedAt:        q.quoted_at,
        amendmentCode:   q.amendment_code,
        amendmentDate:   q.amendment_date,
        salesperson:     q.salesperson,
        clientName:      q.client_name,
        senderName:      q.resolved_sender_name,
        clientAddress:   q.client_address,
        lines:           q.lines || [],
        gstData,
        quoteCurrency:   q.currency || "INR",
        customTerms:     q.terms_and_conditions
          ? q.terms_and_conditions.split("\n").map((t) => t.trim()).filter(Boolean)
          : null,
      })
    );

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${q.quotation_number || `quotation-${id}`}.pdf"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
