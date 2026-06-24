import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

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

const IGST_RATE = 0.18;

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 70, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  // Placeholder until the real logo file is supplied — swap for <Image src={...} /> then.
  logoPlaceholder: { fontSize: 22, fontWeight: 700, color: "#E63946", fontFamily: "Helvetica-Bold" },
  taglineBlock: { alignItems: "flex-end" },
  tagline: { fontSize: 10, fontWeight: 700 },
  cin: { fontSize: 8, color: "#6b7280", marginTop: 2 },

  companyBlock: { marginTop: 18 },
  companyName: { fontSize: 10, fontWeight: 700 },
  companyAddress: { fontSize: 9, color: "#374151", marginTop: 2, lineHeight: 1.4 },
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
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
    paddingVertical: 6,
  },
  colSr:   { width: "6%",  paddingHorizontal: 4 },
  colPart: { width: "12%", paddingHorizontal: 4 },
  colDesc: { width: "22%", paddingHorizontal: 4 },
  colMake: { width: "10%", paddingHorizontal: 4 },
  colLead: { width: "12%", paddingHorizontal: 4 },
  colQty:  { width: "10%", paddingHorizontal: 4, textAlign: "right" },
  colUnit: { width: "9%",  paddingHorizontal: 4, textAlign: "right" },
  colTax:  { width: "10%", paddingHorizontal: 4 },
  colAmt:  { width: "9%",  paddingHorizontal: 4, textAlign: "right" },
  th: { fontSize: 8, fontWeight: 700 },
  td: { fontSize: 8 },
  tdBold: { fontSize: 8, fontWeight: 700 },

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

const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function currencySymbol(currency) {
  if (!currency) return "₹";
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || `${currency.toUpperCase()} `;
}

function formatMoney(value, currency) {
  return `${currencySymbol(currency)}${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * QuotationDocument
 * ------------------
 * Mirrors the company's existing Odoo-generated quotation PDF layout exactly,
 * so this can replace the manual Odoo-download step in the employee's flow.
 *
 * lines: [{ part_number, description, brand, lead_time, quantity, uom, selling_price, currency }]
 */
export default function QuotationDocument({
  quotationNumber,
  quotedAt,
  salesperson,
  clientName,
  clientAddress,
  lines,
}) {
  const expirationDate = new Date(quotedAt);
  expirationDate.setDate(expirationDate.getDate() + 21);

  const computed = lines.map((l) => ({
    ...l,
    amount: Number(l.quantity || 0) * Number(l.selling_price || 0),
  }));
  const untaxedAmount = computed.reduce((sum, l) => sum + l.amount, 0);
  const igstAmount = untaxedAmount * IGST_RATE;
  const total = untaxedAmount + igstAmount;
  // Totals assume every line is priced in the same currency, which holds for
  // the common case. If lines genuinely differ, this just uses whichever
  // currency the first priced line carries rather than silently mislabeling
  // a mixed total as INR.
  const totalsCurrency = lines.find((l) => l.currency)?.currency || null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.logoPlaceholder}>FIAPL</Text>
          <View style={styles.taglineBlock}>
            <Text style={styles.tagline}>Think & Get</Text>
            <Text style={styles.cin}>CIN : U74999HR2019PTC078487</Text>
          </View>
        </View>

        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>FIDUS INDIA AUTOMATION PVT LTD</Text>
          <Text style={styles.companyAddress}>
            39SP, HSIIDC, Udyog Vihar Phase VI, Pace City II, Sector 37, Gurugram -122001 Haryana India
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Amendment (left, intentionally blank) / Client address (right) */}
        <View style={styles.amendClientRow}>
          <View style={styles.amendBlock}>
            <Text style={styles.amendLine}>Amendment Date:</Text>
            <Text style={styles.amendLine}>Amendment No.:</Text>
          </View>
          <View style={styles.clientBlock}>
            <Text style={styles.clientName}>{clientName || ""}</Text>
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
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colSr, styles.th]}>Sr No.</Text>
            <Text style={[styles.colPart, styles.th]}>Part Number</Text>
            <Text style={[styles.colDesc, styles.th]}>Description</Text>
            <Text style={[styles.colMake, styles.th]}>Make</Text>
            <Text style={[styles.colLead, styles.th]}>Lead Time</Text>
            <Text style={[styles.colQty, styles.th]}>Quantity</Text>
            <Text style={[styles.colUnit, styles.th]}>Unit Price</Text>
            <Text style={[styles.colTax, styles.th]}>Taxes</Text>
            <Text style={[styles.colAmt, styles.th]}>Amount</Text>
          </View>
          {computed.map((l, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.colSr, styles.td]}>{String(idx + 1).padStart(2, "0")}</Text>
              <Text style={[styles.colPart, styles.tdBold]}>{l.part_number || "—"}</Text>
              <Text style={[styles.colDesc, styles.td]}>{l.description || "—"}</Text>
              <Text style={[styles.colMake, styles.td]}>{l.brand || "-"}</Text>
              <Text style={[styles.colLead, styles.td]}>{l.lead_time || "—"}</Text>
              <Text style={[styles.colQty, styles.td]}>{l.quantity} {l.uom || ""}</Text>
              <Text style={[styles.colUnit, styles.td]}>{formatMoney(l.selling_price, l.currency)}</Text>
              <Text style={[styles.colTax, styles.td]}>IGST {Math.round(IGST_RATE * 100)}%</Text>
              <Text style={[styles.colAmt, styles.td]}>{formatMoney(l.amount, l.currency)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Untaxed Amount</Text>
            <Text style={styles.totalsValue}>{formatMoney(untaxedAmount, totalsCurrency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>IGST {Math.round(IGST_RATE * 100)}%</Text>
            <Text style={styles.totalsValue}>{formatMoney(igstAmount, totalsCurrency)}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Total</Text>
            <Text style={styles.totalsValueBold}>{formatMoney(total, totalsCurrency)}</Text>
          </View>
        </View>

        {/* Terms and conditions */}
        <View style={styles.terms}>
          {buildTerms((totalsCurrency || "INR").toUpperCase()).map((t, i) => (
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
