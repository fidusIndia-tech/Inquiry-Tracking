import { query } from "@/lib/db";

const DISPLAY_STATUS_CASE = `
  CASE
    WHEN q.status = 'draft'                        THEN 'draft'
    WHEN q.status = 'cancelled'                    THEN 'cancelled'
    WHEN i.status = 'converted'                    THEN 'accepted'
    WHEN i.status IN ('lost', 'dropped')           THEN 'lost'
    WHEN q.is_revision                             THEN 'revised'
    ELSE q.status
  END
`;

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT q.*,
              COALESCE(i.location, q.billing_address) AS client_address,
              (${DISPLAY_STATUS_CASE}) AS display_status
       FROM quotations q
       LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
       WHERE q.id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      return Response.json({ error: "Quotation not found" }, { status: 404 });
    }
    return Response.json({ quotation: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { remark } = await request.json();
    await query(
      `UPDATE quotations SET remark = $1 WHERE id = $2`,
      [remark ?? null, id]
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const {
      client_name,
      client_phone,
      billing_address,
      salesperson,
      currency,
      lines,
      gst_type,
      gst_rate,
      taxable_amount,
      tax_amount,
      grand_total,
      custom_tax_name,
      custom_tax_rate,
      status,
    } = await request.json();

    const result = await query(
      `UPDATE quotations SET
         client_name      = COALESCE($1,  client_name),
         client_phone     = $2,
         billing_address  = $3,
         salesperson      = COALESCE($4,  salesperson),
         currency         = COALESCE($5,  currency),
         lines            = COALESCE($6,  lines),
         gst_type         = COALESCE($7,  gst_type),
         gst_rate         = $8,
         taxable_amount   = COALESCE($9,  taxable_amount),
         tax_amount       = COALESCE($10, tax_amount),
         grand_total      = COALESCE($11, grand_total),
         custom_tax_name  = $12,
         custom_tax_rate  = $13,
         status           = COALESCE($14, status),
         updated_at       = NOW()
       WHERE id = $15 AND source = 'manual'
       RETURNING *`,
      [
        client_name     || null,
        client_phone    || null,
        billing_address || null,
        salesperson     || null,
        currency        || null,
        lines != null   ? JSON.stringify(lines) : null,
        gst_type        || null,
        gst_rate  != null ? Number(gst_rate)  : null,
        taxable_amount != null ? Number(taxable_amount) : null,
        tax_amount     != null ? Number(tax_amount)     : null,
        grand_total    != null ? Number(grand_total)    : null,
        custom_tax_name  || null,
        custom_tax_rate != null ? Number(custom_tax_rate) : null,
        status          || null,
        id,
      ]
    );

    if (!result.rows[0]) {
      return Response.json(
        { error: "Quotation not found or is not a manual draft" },
        { status: 404 }
      );
    }
    return Response.json({ quotation: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
