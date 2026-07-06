import { query } from "@/lib/db";

/**
 * POST /api/purchase-orders/quick-create
 * Creates (or updates) a PO for one vendor quote directly from the
 * Reply-to-Client tab, without requiring a confirmed quotation.
 * If a non-cancelled, non-sent PO for the same inquiry+vendor already
 * exists, the item is added/updated there. Otherwise a new PO is created.
 */
export async function POST(request) {
  try {
    const { inquiry_unique_code, vendor_quote_id, gst_type, gst_rate, sales_representative, terms_text } =
      await request.json();

    if (!inquiry_unique_code || !vendor_quote_id) {
      return Response.json(
        { error: "inquiry_unique_code and vendor_quote_id are required" },
        { status: 400 }
      );
    }

    const resolvedGstType = (gst_type || "NONE").toUpperCase();
    const resolvedGstRate = Number(gst_rate) || 0;

    // Fetch vendor quote
    const quoteRes = await query(
      `SELECT vq.* FROM vendor_quotes vq WHERE vq.id = $1`,
      [vendor_quote_id]
    );
    const vq = quoteRes.rows[0];
    if (!vq) return Response.json({ error: "Vendor quote not found" }, { status: 404 });

    // Fetch inquiry item matching part_number for qty/uom/brand/description
    const itemRes = await query(
      `SELECT ii.* FROM inquiry_items ii
       JOIN inquiries i ON i.id = ii.inquiry_id
       WHERE i.unique_code = $1
         AND UPPER(REGEXP_REPLACE(COALESCE(ii.part_number,''), '[\\s\\-_./]+', '', 'g'))
           = UPPER(REGEXP_REPLACE($2, '[\\s\\-_./]+', '', 'g'))
       LIMIT 1`,
      [inquiry_unique_code, vq.part_number || ""]
    );
    const item = itemRes.rows[0];

    const unit_price = Number(vq.unit_price) || 0;
    const qty_num   = Number(item?.quantity) || 1;
    const amount    = unit_price * qty_num || null;

    const itemData = {
      part_number:     vq.part_number   || null,
      brand:           item?.brand      || null,
      description:     item?.item_notes || null,
      quantity:        item?.quantity   || null,
      uom:             item?.uom        || null,
      unit_price,
      currency:        vq.currency || "INR",
      lead_time:       vq.lead_time    || null,
      availability:    vq.availability || null,
      amount,
      vendor_quote_id: vq.id,
    };

    const vendorEmailLower = (vq.vendor_email || "").toLowerCase().trim();
    const vendorNameLower  = (vq.vendor_name  || "").toLowerCase().trim();

    // Look for an existing editable PO for this inquiry+vendor
    const existingRes = await query(
      `SELECT id FROM purchase_orders
       WHERE inquiry_unique_code = $1
         AND status NOT IN ('cancelled','sent')
         AND (
           (vendor_email IS NOT NULL AND LOWER(vendor_email) = $2)
           OR (vendor_email IS NULL AND LOWER(COALESCE(vendor_name,'')) = $3)
         )
       ORDER BY created_at DESC LIMIT 1`,
      [inquiry_unique_code, vendorEmailLower, vendorNameLower]
    );

    let poId;

    if (existingRes.rows[0]) {
      poId = existingRes.rows[0].id;

      // Check if this part already exists in the PO
      const existingItemRes = await query(
        `SELECT id FROM purchase_order_items
         WHERE purchase_order_id = $1
           AND UPPER(COALESCE(part_number,'')) = UPPER(COALESCE($2,''))
         LIMIT 1`,
        [poId, vq.part_number || ""]
      );

      if (existingItemRes.rows[0]) {
        await query(
          `UPDATE purchase_order_items
           SET unit_price=$1, currency=$2, lead_time=$3, availability=$4,
               amount=$5, vendor_quote_id=$6, quantity=$7, brand=$8,
               description=$9, uom=$10
           WHERE id=$11`,
          [itemData.unit_price, itemData.currency, itemData.lead_time,
           itemData.availability, itemData.amount, itemData.vendor_quote_id,
           itemData.quantity, itemData.brand, itemData.description, itemData.uom,
           existingItemRes.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO purchase_order_items
             (purchase_order_id, part_number, brand, description, quantity, uom,
              unit_price, currency, lead_time, availability, amount, vendor_quote_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [poId, itemData.part_number, itemData.brand, itemData.description,
           itemData.quantity, itemData.uom, itemData.unit_price, itemData.currency,
           itemData.lead_time, itemData.availability, itemData.amount,
           itemData.vendor_quote_id]
        );
      }

      // Recalculate PO totals
      const totRes = await query(
        `SELECT COALESCE(SUM(COALESCE(amount,0)),0) AS sub FROM purchase_order_items WHERE purchase_order_id=$1`,
        [poId]
      );
      const newSub = Number(totRes.rows[0].sub);
      const newTax = resolvedGstType !== "NONE" ? newSub * resolvedGstRate / 100 : 0;
      const updateFields = [newSub, newTax, newSub + newTax, resolvedGstType, resolvedGstRate];
      let updateSql = `UPDATE purchase_orders SET subtotal=$1, tax_amount=$2, grand_total=$3, gst_type=$4, gst_rate=$5`;
      if (sales_representative) { updateSql += `, sales_representative=$${updateFields.length + 1}`; updateFields.push(sales_representative); }
      if (terms_text)            { updateSql += `, terms_text=$${updateFields.length + 1}`;           updateFields.push(terms_text); }
      updateSql += ` WHERE id=$${updateFields.length + 1}`;
      updateFields.push(poId);
      await query(updateSql, updateFields);

    } else {
      // Create fresh PO
      const seqRes = await query(
        `SELECT COUNT(*) FROM purchase_orders WHERE inquiry_unique_code=$1`,
        [inquiry_unique_code]
      );
      const seq      = Number(seqRes.rows[0].count) + 1;
      const poNumber = `${inquiry_unique_code}-PO-${String(seq).padStart(3, "0")}`;

      const sub      = amount || 0;
      const taxAmt   = resolvedGstType !== "NONE" ? sub * resolvedGstRate / 100 : 0;

      const poRes = await query(
        `INSERT INTO purchase_orders
           (po_number, inquiry_unique_code, vendor_name, vendor_email,
            currency, subtotal, tax_amount, grand_total, gst_type, gst_rate, status,
            sales_representative, terms_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'generated',$11,$12)
         RETURNING *`,
        [poNumber, inquiry_unique_code,
         vq.vendor_name || null, vq.vendor_email || null,
         vq.currency || "INR", sub, taxAmt, sub + taxAmt,
         resolvedGstType, resolvedGstRate,
         sales_representative || null, terms_text || null]
      );
      poId = poRes.rows[0].id;

      await query(
        `INSERT INTO purchase_order_items
           (purchase_order_id, part_number, brand, description, quantity, uom,
            unit_price, currency, lead_time, availability, amount, vendor_quote_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [poId, itemData.part_number, itemData.brand, itemData.description,
         itemData.quantity, itemData.uom, itemData.unit_price, itemData.currency,
         itemData.lead_time, itemData.availability, itemData.amount,
         itemData.vendor_quote_id]
      );
    }

    const result = await query(
      `SELECT po.*,
              (SELECT json_agg(poi ORDER BY poi.id)
               FROM purchase_order_items poi
               WHERE poi.purchase_order_id = po.id) AS items
       FROM purchase_orders po WHERE po.id = $1`,
      [poId]
    );
    return Response.json({ purchase_order: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
