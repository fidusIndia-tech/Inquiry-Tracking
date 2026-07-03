import path from "path";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const LOGO_PATH = path.join(process.cwd(), "public", "logo-dark.png");

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 70, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },

  logoWrap: { alignItems: "flex-start" },
  logo:     { width: 110, height: 36, objectFit: "contain", objectPositionX: 0 },

  companyBlock:   { marginTop: 14 },
  companyName:    { fontSize: 10, fontWeight: 700 },
  companyAddress: { fontSize: 9, color: "#374151", marginTop: 2, lineHeight: 1.5 },
  divider:        { borderBottomWidth: 1, borderBottomColor: "#9ca3af", marginTop: 10, marginBottom: 10 },

  poHeaderRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  poBlock:      {},
  poNumber:     { fontSize: 18, fontWeight: 700, color: "#B45309" },
  poSubLabel:   { fontSize: 8, color: "#64748b", marginTop: 3 },
  poSubValue:   { fontSize: 9, color: "#1f2937" },

  vendorBlock: { alignItems: "flex-start", maxWidth: 240 },
  vendorLabel: { fontSize: 8, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  vendorName:  { fontSize: 10, fontWeight: 700, marginTop: 3 },
  vendorLine:  { fontSize: 9, color: "#374151", marginTop: 2 },

  table: { marginTop: 16 },
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
  colSr:   { width: "4%",  paddingHorizontal: 3 },
  colPart: { width: "17%", paddingHorizontal: 3 },
  colDesc: { width: "24%", paddingHorizontal: 3 },
  colMake: { width: "8%",  paddingHorizontal: 3 },
  colQty:  { width: "8%",  paddingHorizontal: 3 },
  colUom:  { width: "7%",  paddingHorizontal: 3 },
  colUnit: { width: "12%", paddingHorizontal: 3 },
  colLead: { width: "10%", paddingHorizontal: 3 },
  colAvail:{ width: "10%", paddingHorizontal: 3 },
  th:      { fontSize: 7.5, fontWeight: 700 },
  td:      { fontSize: 7.5 },
  tdBold:  { fontSize: 7.5, fontWeight: 700 },
  tdRight: { fontSize: 7.5, textAlign: "right" },
  tdBoldRight: { fontSize: 7.5, fontWeight: 700, textAlign: "right" },

  totalsBlock:    { marginTop: 12, alignItems: "flex-end" },
  totalsRow:      { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4 },
  totalsLabel:    { fontSize: 9 },
  totalsLabelRed: { fontSize: 9, fontWeight: 700, color: "#B45309" },
  totalsValue:    { fontSize: 9 },
  totalsValueBold:{ fontSize: 10, fontWeight: 700, color: "#B45309" },
  totalsDivider:  { borderTopWidth: 1, borderTopColor: "#1f2937", width: 220, marginVertical: 2 },

  terms:      { marginTop: 24 },
  termsTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 5 },
  termsItem:  { fontSize: 8, color: "#374151", marginBottom: 4, lineHeight: 1.4 },

  footer: {
    position: "absolute", bottom: 24, left: 40, right: 40,
    borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 6,
  },
  footerLine: { fontSize: 7, color: "#6b7280", textAlign: "center" },
  pageNum:    { fontSize: 7, color: "#6b7280", textAlign: "center", marginTop: 2 },
});

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function formatMoney(value, currency) {
  const code = (currency || "INR").toUpperCase();
  return `${code} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PO_TERMS = [
  "This Purchase Order is issued by Fidus India Automation Pvt. Ltd. and constitutes a binding offer subject to vendor acceptance.",
  "Vendor must confirm receipt of this PO and provide delivery schedule within 2 business days.",
  "All goods must be supplied exactly as per the specifications mentioned above. Substitutions require prior written approval.",
  "Prices are fixed as quoted. No additional charges will be accepted without prior written approval.",
  "Delivery must be as per the lead time stated above. Delays must be communicated in advance.",
  "All items must be packed securely. FIAPL is not liable for damage due to inadequate packaging.",
  "Payment will be processed as per agreed payment terms after receipt and inspection of goods.",
  "Jurisdiction: All disputes are subject to the jurisdiction of Gurugram, Haryana, India.",
];

export default function PurchaseOrderDocument({
  poNumber,
  poDate,
  inquiryCode,
  quotationNumber,
  vendorName,
  vendorEmail,
  vendorPhone,
  vendorAddress,
  items,
  currency,
  subtotal,
  grandTotal,
  notes,
}) {
  const cur = (currency || "INR").toUpperCase();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.logoWrap}>
          <Image src={LOGO_PATH} style={styles.logo} />
        </View>

        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>FIDUS INDIA AUTOMATION PVT LTD</Text>
          <Text style={styles.companyAddress}>39SP, HSIIDC, Udyog Vihar Phase VI,</Text>
          <Text style={styles.companyAddress}>Pace City II, Sector 37, Gurugram - 122001, Haryana, India</Text>
          <Text style={styles.companyAddress}>GST: 06AADCF6467E1ZN  |  IEC: AADCF6467E</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.poHeaderRow}>
          <View style={styles.poBlock}>
            <Text style={styles.poNumber}>Purchase Order # {poNumber}</Text>
            <Text style={[styles.poSubLabel, { marginTop: 6 }]}>PO Date</Text>
            <Text style={styles.poSubValue}>{formatDate(poDate || new Date())}</Text>
            {inquiryCode ? <>
              <Text style={[styles.poSubLabel, { marginTop: 5 }]}>RFQ Reference</Text>
              <Text style={styles.poSubValue}>{inquiryCode}</Text>
            </> : null}
            {quotationNumber ? <>
              <Text style={[styles.poSubLabel, { marginTop: 5 }]}>Quotation Ref</Text>
              <Text style={styles.poSubValue}>{quotationNumber}</Text>
            </> : null}
          </View>

          <View style={styles.vendorBlock}>
            <Text style={styles.vendorLabel}>Vendor / Supplier</Text>
            <Text style={styles.vendorName}>{vendorName || "—"}</Text>
            {vendorEmail   ? <Text style={styles.vendorLine}>{vendorEmail}</Text>   : null}
            {vendorPhone   ? <Text style={styles.vendorLine}>{vendorPhone}</Text>   : null}
            {vendorAddress ? <Text style={styles.vendorLine}>{vendorAddress}</Text> : null}
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={styles.colSr}>  <Text style={styles.th}>Sr</Text></View>
            <View style={styles.colPart}><Text style={styles.th}>Part Number</Text></View>
            <View style={styles.colDesc}><Text style={styles.th}>Description</Text></View>
            <View style={styles.colMake}><Text style={styles.th}>Make</Text></View>
            <View style={styles.colQty}> <Text style={[styles.th, { textAlign: "right" }]}>Qty</Text></View>
            <View style={styles.colUom}> <Text style={styles.th}>UOM</Text></View>
            <View style={styles.colUnit}><Text style={[styles.th, { textAlign: "right" }]}>Unit Price</Text></View>
            <View style={styles.colLead}><Text style={styles.th}>Lead Time</Text></View>
            <View style={styles.colAvail}><Text style={styles.th}>Availability</Text></View>
          </View>
          {(items || []).map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.colSr}>  <Text style={styles.td}>{String(idx + 1).padStart(2, "0")}</Text></View>
              <View style={styles.colPart}><Text style={styles.tdBold}>{item.part_number || "—"}</Text></View>
              <View style={styles.colDesc}><Text style={styles.td}>{item.description   || "—"}</Text></View>
              <View style={styles.colMake}><Text style={styles.td}>{item.brand         || "—"}</Text></View>
              <View style={styles.colQty}> <Text style={styles.tdRight}>{item.quantity || "—"}</Text></View>
              <View style={styles.colUom}> <Text style={styles.td}>{item.uom           || "—"}</Text></View>
              <View style={styles.colUnit}><Text style={styles.tdRight}>{item.unit_price != null ? formatMoney(item.unit_price, item.currency || cur) : "—"}</Text></View>
              <View style={styles.colLead}><Text style={styles.td}>{item.lead_time     || "—"}</Text></View>
              <View style={styles.colAvail}><Text style={styles.td}>{item.availability || "—"}</Text></View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatMoney(subtotal || grandTotal, cur)}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelRed}>Grand Total</Text>
            <Text style={styles.totalsValueBold}>{formatMoney(grandTotal, cur)}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: "#6b7280", marginTop: 4 }}>
            * Taxes & duties as applicable at billing. Contact vendor for GST/VAT details.
          </Text>
        </View>

        {notes ? (
          <View style={{ marginTop: 16, padding: 8, backgroundColor: "#FFF9C4", borderRadius: 4 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 3 }}>Notes / Special Instructions</Text>
            <Text style={{ fontSize: 8, color: "#374151" }}>{notes}</Text>
          </View>
        ) : null}

        {/* Terms */}
        <View style={styles.terms}>
          <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
          {PO_TERMS.map((t, i) => (
            <Text key={i} style={styles.termsItem}>{i + 1}. {t}</Text>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            fidusindia@gmail.com  |  https://www.fidusindia.com/  |  Ph: 91-0124-2979669, 9811348738
          </Text>
          <Text style={styles.pageNum}>Page 1 / 1  —  Authorised Purchase Order</Text>
        </View>
      </Page>
    </Document>
  );
}
