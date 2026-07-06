import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { query } from "@/lib/db";
import PurchaseOrderDocument from "@/lib/purchaseOrderPdf";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
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
        items:           po.items || [],
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

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${po.po_number}.pdf"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
