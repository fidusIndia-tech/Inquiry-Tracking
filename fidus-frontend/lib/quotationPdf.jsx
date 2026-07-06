import path from "path";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const LOGO_PATH = path.join(process.cwd(), "public", "logo-dark.png");

function buildTerms(currencyCode) {
  return [
  `Prices: All prices are quoted in ${currencyCode} and are valid for 30 days from the date of this quotation. Prices are exclusive of applicable taxes, duties, and freight unless otherwise mentioned.`,
  "Payment Terms: 100% advance payment against confirmed purchase order, unless agreed otherwise in writing. Payment should be made via bank transfer to the account details mentioned in the invoice.",
  "Delivery: Standard delivery lead time is stated above in days from the receipt of advance payment and confirmed PO.",
  "Warranty: Warranty is applicable only for manufacturing defects and excludes misuse, mishandling, or damages during transit.",
  "Validity: Quotation is valid for a period of 30 days unless extended in writing.",
  "Order Cancellation: Once the order is confirmed and payment is received, cancellation or change requests will not be entertained.",
  "Taxes & Duties: All applicable GST and local taxes will be charged extra as applicable at the time of billing.",
  "Packaging & Forwarding: Standard packaging is included. Special packaging (if any) will be charged extra.",
  "Limitation of Liability: Our liability is limited only to the extent of replacing defective products as per warranty policy.",
  "Jurisdiction: All disputes are subject to the jurisdiction of Gurgram",
  "Transit Insurance: Goods are deemed delivered once they leave our warehouse. Transit insurance is to be arranged by the buyer unless explicitly included in the quotation. We are not liable for any loss, damage, or delay caused during transportation.",
  ];
}

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 70, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },

  // Logo sits flush top-left; no flex-space-between that can shift it right
  logoWrap: { alignItems: "flex-start" },
  logo: { width: 150, height: 48, objectFit: "contain", objectPositionX: 0 },

  companyBlock: { marginTop: 14 },
  companyName: { fontSize: 10, fontWeight: 700 },
  companyAddress: { fontSize: 9, color: "#374151", marginTop: 2, lineHeight: 1.5 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#9ca3af", marginTop: 10, marginBottom: 10 },

  amendClientRow: { flexDirection: "row", justifyContent: "space-between" },
  amendBlock: {},
  amendLine: { fontSize: 9, color: "#374151", marginBottom: 4 },
  clientBlock: { alignItems: "flex-start", maxWidth: 240 },
  clientName: { fontSize: 10, fontWeight: 700 },
  clientAddressLine: { fontSize: 9, color: "#374151", marginTop: 2 },

  quotationNumber: { fontSize: 20, fontWeight: 700, color: "#C0392B", marginTop: 18 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  metaLabel: { fontSize: 9, fontWeight: 700 },
  metaValue: { fontSize: 9, marginTop: 3 },

  table: { marginTop: 18 },
  tableHeaderRow: {
    flexDirection: "row", backgroundColor: "#f3f4f6",
    borderTopWidth: 1, borderTopColor: "#d1d5db",
    borderBottomWidth: 1, borderBottomColor: "#d1d5db",
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
    paddingVertical: 5,
  },
  // Wider Part Number + Description columns to prevent overflow.
  // Each column is a View so react-pdf wraps text correctly within the boundary.
  colSr:   { width: "4%",  paddingHorizontal: 3 },
  colPart: { width: "17%", paddingHorizontal: 3 },
  colDesc: { width: "24%", paddingHorizontal: 3 },
  colMake: { width: "8%",  paddingHorizontal: 3 },
  colLead: { width: "10%", paddingHorizontal: 3 },
  colQty:  { width: "8%",  paddingHorizontal: 3 },
  colUnit: { width: "10%", paddingHorizontal: 3 },
  colTax:  { width: "9%",  paddingHorizontal: 3 },
  colAmt:  { width: "10%", paddingHorizontal: 3 },
  th: { fontSize: 7.5, fontWeight: 700 },
  td: { fontSize: 7.5 },
  tdBold: { fontSize: 7.5, fontWeight: 700 },
  tdRight: { fontSize: 7.5, textAlign: "right" },
  tdBoldRight: { fontSize: 7.5, fontWeight: 700, textAlign: "right" },

  totalsBlock: { marginTop: 12, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4 },
  totalsLabelRed: { fontSize: 9, fontWeight: 700, color: "#C0392B" },
  totalsLabel: { fontSize: 9 },
  totalsValue: { fontSize: 9 },
  totalsValueBold: { fontSize: 10, fontWeight: 700, color: "#C0392B" },
  totalsDivider: { borderTopWidth: 1, borderTopColor: "#1f2937", width: 220, marginVertical: 2 },

  terms: { marginTop: 26 },
  termsItem: { fontSize: 8, color: "#374151", marginBottom: 5, lineHeight: 1.4 },

  footer: {
    position: "absolute", bottom: 24, left: 40, right: 40,
    borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 6,
  },
  footerLine: { fontSize: 7, color: "#6b7280", textAlign: "center" },
  pageNum: { fontSize: 7, color: "#6b7280", textAlign: "center", marginTop: 2 },
});

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${dt.getFullYear()}`;
}

// Use currency code prefix (e.g. "INR 1,23,456.00") — ₹ not in Helvetica; ¥ is safe.
const ZERO_DEC_QT = new Set(["JPY", "KRW", "VND", "IDR"]);
function formatMoney(value, currency) {
  const code = (currency || "INR").toUpperCase();
  const sym  = code === "JPY" ? "¥" : `${code} `;
  const dec  = ZERO_DEC_QT.has(code) ? 0 : 2;
  return `${sym}${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

/**
 * QuotationDocument
 * ------------------
 * Mirrors the company's existing Odoo-generated quotation PDF layout exactly,
 * so this can replace the manual Odoo-download step in the employee's flow.
 *
 * lines: [{ part_number, description, brand, lead_time, quantity, uom, selling_price }]
 * quoteCurrency: employee-selected output currency (INR/USD/EUR/AED/GBP). All
 *   amounts in the PDF use this currency regardless of what vendors quoted in.
 */
export default function QuotationDocument({
  quotationNumber,
  quotedAt,
  amendmentCode,
  amendmentDate,
  salesperson,
  clientName,
  senderName,
  clientAddress,
  lines,
  gstData,
  quoteCurrency,
  customTerms,
  clientNote,
}) {
  const currency = (quoteCurrency || "INR").toUpperCase();

  const expirationDate = new Date(quotedAt);
  expirationDate.setDate(expirationDate.getDate() + 21);

  const computed = lines.map((l) => ({
    ...l,
    amount: Number(l.quantity || 0) * Number(l.selling_price || 0),
  }));

  // Use server-computed gstData; fall back to zero-GST if missing.
  const gst = gstData || { type: "NONE", rate: 0, label: "No GST", taxable: computed.reduce((s, l) => s + l.amount, 0), cgst: 0, sgst: 0, igst: 0, customName: "", customRate: 0, customAmount: 0, totalGst: 0, grandTotal: computed.reduce((s, l) => s + l.amount, 0) };

  const taxLabel = gst.type === "CGST_SGST" ? `CGST+SGST ${gst.rate}%`
                 : gst.type === "IGST"       ? `IGST ${gst.rate}%`
                 : gst.type === "CUSTOM"     ? `${gst.customName} ${gst.customRate}%`
                 : gst.type === "EXPORT"     ? "Export / LUT"
                 : "Nil";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo — flush top-left */}
        <View style={styles.logoWrap}>
          <Image src={LOGO_PATH} style={styles.logo} />
        </View>

        {/* Company block with wrapped address */}
        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>FIDUS INDIA AUTOMATION PVT LTD</Text>
          <Text style={styles.companyAddress}>39SP, HSIIDC, Udyog Vihar Phase VI,</Text>
          <Text style={styles.companyAddress}>Pace City II, Sector 37,</Text>
          <Text style={styles.companyAddress}>Gurugram - 122001,</Text>
          <Text style={styles.companyAddress}>Haryana, India</Text>
        </View>

        <View style={styles.divider} />

        {/* Amendment (left) / Client address (right) */}
        <View style={styles.amendClientRow}>
          <View style={styles.amendBlock}>
            <Text style={styles.amendLine}>Amendment Date: {amendmentDate ? formatDate(amendmentDate) : "—"}</Text>
            <Text style={styles.amendLine}>Amendment No.: {amendmentCode || "—"}</Text>
          </View>
          <View style={styles.clientBlock}>
            <Text style={styles.clientName}>{clientName || ""}</Text>
            {senderName ? (
              <Text style={[styles.clientAddressLine, { marginTop: 3 }]}>Attn: {senderName}</Text>
            ) : null}
            {(clientAddress || "").split(",").map((part, i) => (
              part.trim() ? <Text key={i} style={styles.clientAddressLine}>{part.trim()}</Text> : null
            ))}
          </View>
        </View>

        <Text style={styles.quotationNumber}>Quotation # {quotationNumber}</Text>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>Quotation Date:</Text>
            <Text style={styles.metaValue}>{formatDate(quotedAt)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Expiration:</Text>
            <Text style={styles.metaValue}>{formatDate(expirationDate)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Salesperson:</Text>
            <Text style={styles.metaValue}>{salesperson || ""}</Text>
          </View>
        </View>

        {/* Line items table */}
        <View style={styles.table}>
          {/* Each cell is a View (sets width boundary) wrapping a Text (wraps content).
              This is the correct react-pdf pattern — mixing layout+text styles on a
              single Text node causes the text to ignore column width and overflow. */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.colSr}><Text style={styles.th}>Sr No.</Text></View>
            <View style={styles.colPart}><Text style={styles.th}>Part Number</Text></View>
            <View style={styles.colDesc}><Text style={styles.th}>Description</Text></View>
            <View style={styles.colMake}><Text style={styles.th}>Make</Text></View>
            <View style={styles.colLead}><Text style={styles.th}>Lead Time</Text></View>
            <View style={styles.colQty}><Text style={[styles.th, { textAlign: "right" }]}>Quantity</Text></View>
            <View style={styles.colUnit}><Text style={[styles.th, { textAlign: "right" }]}>Unit Price</Text></View>
            <View style={styles.colTax}><Text style={styles.th}>Taxes</Text></View>
            <View style={styles.colAmt}><Text style={[styles.th, { textAlign: "right" }]}>Amount</Text></View>
          </View>
          {computed.map((l, idx) => (
            <View key={idx}>
              <View style={styles.tableRow}>
                <View style={styles.colSr}><Text style={styles.td}>{String(idx + 1).padStart(2, "0")}</Text></View>
                <View style={styles.colPart}><Text style={styles.tdBold}>{l.part_number || "—"}</Text></View>
                <View style={styles.colDesc}><Text style={styles.td}>{l.description || "—"}</Text></View>
                <View style={styles.colMake}><Text style={styles.td}>{l.brand || "-"}</Text></View>
                <View style={styles.colLead}><Text style={styles.td}>{l.lead_time || "—"}</Text></View>
                <View style={styles.colQty}><Text style={styles.tdRight}>{l.quantity} {l.uom || ""}</Text></View>
                <View style={styles.colUnit}><Text style={styles.tdRight}>{formatMoney(l.selling_price, currency)}</Text></View>
                <View style={styles.colTax}><Text style={styles.td}>{taxLabel}</Text></View>
                <View style={styles.colAmt}><Text style={styles.tdBoldRight}>{formatMoney(l.amount, currency)}</Text></View>
              </View>
              {l.remark ? (
                <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingHorizontal: 6, paddingBottom: 5 }}>
                  <Text style={{ fontSize: 7, color: "#78716c" }}>Remark: {l.remark}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Taxable Amount</Text>
            <Text style={styles.totalsValue}>{formatMoney(gst.taxable, currency)}</Text>
          </View>
          {gst.type === "CGST_SGST" && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>CGST @ {gst.rate / 2}%</Text>
                <Text style={styles.totalsValue}>{formatMoney(gst.cgst, currency)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>SGST @ {gst.rate / 2}%</Text>
                <Text style={styles.totalsValue}>{formatMoney(gst.sgst, currency)}</Text>
              </View>
            </>
          )}
          {gst.type === "IGST" && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>IGST @ {gst.rate}%</Text>
              <Text style={styles.totalsValue}>{formatMoney(gst.igst, currency)}</Text>
            </View>
          )}
          {gst.type === "CUSTOM" && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{gst.customName} @ {gst.customRate}%</Text>
              <Text style={styles.totalsValue}>{formatMoney(gst.customAmount, currency)}</Text>
            </View>
          )}
          {(gst.type === "NONE" || gst.type === "EXPORT") && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{gst.type === "EXPORT" ? "GST (Export / LUT / Zero Rated)" : "GST"}</Text>
              <Text style={styles.totalsValue}>{formatMoney(0, currency)}</Text>
            </View>
          )}
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Grand Total</Text>
            <Text style={styles.totalsValueBold}>{formatMoney(gst.grandTotal, currency)}</Text>
          </View>
          {gst.type === "EXPORT" && (
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 7, color: "#6b7280" }}>* Export / LUT / Zero Rated supply. GST not applicable as per LUT/bond, if applicable.</Text>
            </View>
          )}
        </View>

        {/* Client note (from employee) */}
        {clientNote ? (
          <View style={{ marginTop: 14, padding: 10, backgroundColor: "#FFF7ED", borderRadius: 4, borderLeftWidth: 3, borderLeftColor: "#F59E0B" }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>Note from FIDUS INDIA:</Text>
            <Text style={{ fontSize: 8, color: "#374151" }}>{clientNote}</Text>
          </View>
        ) : null}

        {/* Terms and conditions */}
        <View style={styles.terms}>
          {(customTerms?.length > 0 ? customTerms : buildTerms(currency)).map((t, i) => (
            <Text key={i} style={styles.termsItem}>{i + 1}. {t}</Text>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            fidusindia@gmail.com  |  https://www.fidusindia.com/  |  https://industrialneeds.co/
          </Text>
          <Text style={styles.footerLine}>
            Phone : 91-0124-2979669, 9811348738  |  GST : 06AADCF6467E1ZN  |  IEC : AADCF6467E  |  MSME : HR05A0012061
          </Text>
          <Text style={styles.pageNum}>Page : 1 / 1</Text>
        </View>
      </Page>
    </Document>
  );
}
