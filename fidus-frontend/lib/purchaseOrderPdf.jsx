import path from "path";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const LOGO_PATH = path.join(process.cwd(), "public", "logo-dark.png");

const C = {
  red:     "#B45309",
  blue:    "#1e3a5f",
  gray:    "#374151",
  lgray:   "#6b7280",
  xgray:   "#9ca3af",
  border:  "#d1d5db",
  rowalt:  "#F8FAFF",
  headbg:  "#f3f4f6",
};

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 60, fontSize: 8.5, fontFamily: "Helvetica", color: C.gray },

  /* ── top bar ── */
  topRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo:         { width: 140, height: 44, objectFit: "contain", objectPositionX: 0 },
  topRight:     { alignItems: "flex-end" },
  tagline:      { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.blue },
  cin:          { fontSize: 7.5, color: C.lgray, marginTop: 3 },

  /* ── company block ── */
  compBlock:   { marginTop: 8 },
  compName:    { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  compLine:    { fontSize: 8, color: C.gray, marginTop: 1.5, lineHeight: 1.4 },

  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 10, marginBottom: 10 },

  /* ── address row ── */
  addrRow:     { flexDirection: "row", gap: 16, marginBottom: 12 },
  addrBlock:   { flex: 1 },
  addrLabel:   { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  addrLine:    { fontSize: 8, color: C.gray, lineHeight: 1.5 },

  /* ── PO heading ── */
  poHeading:   { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.red, marginBottom: 8 },

  /* ── meta row ── */
  metaRow:     { flexDirection: "row", gap: 30, marginBottom: 12 },
  metaLabel:   { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.lgray, textTransform: "uppercase" },
  metaValue:   { fontSize: 8.5, marginTop: 2 },

  /* ── table ── */
  table:         { marginTop: 4 },
  tHeaderRow:    { flexDirection: "row", backgroundColor: C.headbg, borderTopWidth: 1, borderTopColor: C.border, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5 },
  tRow:          { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  tRowAlt:       { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 5, backgroundColor: C.rowalt },

  cSr:    { width: "4%",  paddingHorizontal: 3 },
  cDesc:  { width: "30%", paddingHorizontal: 3 },
  cMake:  { width: "9%",  paddingHorizontal: 3 },
  cTax:   { width: "8%",  paddingHorizontal: 3 },
  cQty:   { width: "8%",  paddingHorizontal: 3 },
  cUom:   { width: "6%",  paddingHorizontal: 3 },
  cUnit:  { width: "17%", paddingHorizontal: 3 },
  cAmt:   { width: "18%", paddingHorizontal: 3 },

  th:     { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  td:     { fontSize: 7.5 },
  tdBold: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  tdR:    { fontSize: 7.5, textAlign: "right" },
  tdBR:   { fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" },

  /* ── totals ── */
  totalsWrap: { marginTop: 10, alignItems: "flex-end" },
  tRow2:      { flexDirection: "row", width: 240, justifyContent: "space-between", paddingVertical: 3 },
  tLabel:     { fontSize: 8.5, color: C.red, fontFamily: "Helvetica-Bold" },
  tValue:     { fontSize: 8.5 },
  tValueBold: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.red },
  tDiv:       { width: 240, borderTopWidth: 1, borderTopColor: C.gray, marginVertical: 2 },
  taxNote:    { fontSize: 7, color: C.lgray, marginTop: 4 },

  /* ── terms ── */
  termsWrap: { marginTop: 16 },
  termItem:  { fontSize: 8, color: C.gray, marginBottom: 4, lineHeight: 1.4 },
  termBold:  { fontSize: 8, fontFamily: "Helvetica-Bold" },

  /* ── footer ── */
  footer:      { position: "absolute", bottom: 18, left: 36, right: 36, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  footLine1:   { fontSize: 7, color: C.lgray, textAlign: "center" },
  footLine2:   { fontSize: 6.5, color: C.lgray, textAlign: "center", marginTop: 2 },
  footPage:    { fontSize: 7, color: C.lgray, textAlign: "center", marginTop: 2 },
});

/* ── helpers ── */
function fDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function fMoney(v, cur) {
  const code = (cur || "INR").toUpperCase();
  const sym = code === "INR" ? "₹ " : code + " ";
  return `${sym}${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function taxLabel(gstType, gstRate) {
  if (!gstType || gstType === "NONE") return "";
  if (gstType === "IGST")      return `IGST ${gstRate || 18}%`;
  if (gstType === "CGST_SGST") return `CGST+SGST ${gstRate || 18}%`;
  if (gstType === "EXPORT")    return "Export / LUT";
  return gstType;
}

const FIXED_TERMS = [
  ["Payment Terms",     "20% advance with the purchase order, and the remaining 80% prior to shipment."],
  ["Dispatch Schedule", "As per Quotation"],
  ["Warranty",         "One year"],
  ["",                 "Warranty from the date arrive to us"],
  ["Remarks",          "Delivery at Shipping address"],
  ["Note",             "Goods should be Original & Genuine"],
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
  items = [],
  currency = "INR",
  subtotal  = 0,
  grandTotal = 0,
  taxAmount  = 0,
  gstType    = "NONE",
  gstRate    = 0,
  notes,
}) {
  const cur = (currency || "INR").toUpperCase();
  const taxTag = taxLabel(gstType, gstRate);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Top bar: logo left, tagline + CIN right ── */}
        <View style={s.topRow}>
          <Image src={LOGO_PATH} style={s.logo} />
          <View style={s.topRight}>
            <Text style={s.tagline}>Think &amp; Get</Text>
            <Text style={s.cin}>CIN : U74999HR2019PTC078487</Text>
          </View>
        </View>

        {/* ── FIAPL company info ── */}
        <View style={s.compBlock}>
          <Text style={s.compName}>FIDUS INDIA AUTOMATION PVT LTD</Text>
          <Text style={s.compLine}>39SP, HSIIDC, Udyog Vihar Phase VI, Pace City II, Sector 37, Gurugram -122001 Haryana India</Text>
        </View>

        <View style={s.divider} />

        {/* ── Address row: FIAPL shipping address (left) + Vendor (right) ── */}
        <View style={s.addrRow}>
          <View style={s.addrBlock}>
            <Text style={s.addrLabel}>Shipping address:</Text>
            <Text style={s.addrLine}>FIDUSINDIAAUTOMATIONPVTLTD</Text>
            <Text style={s.addrLine}>39SP, HSIIDC, Udyog Vihar Phase VI, Pace City II,</Text>
            <Text style={s.addrLine}>Sector 37,</Text>
            <Text style={s.addrLine}>Gurugram 122001</Text>
            <Text style={s.addrLine}>Haryana HR</Text>
            <Text style={s.addrLine}>India</Text>
            <Text style={s.addrLine}>☎ 0124-2972224</Text>
          </View>
          <View style={[s.addrBlock, { alignItems: "flex-start" }]}>
            <Text style={s.addrLine}>{vendorName || "—"}</Text>
            {vendorAddress ? <Text style={s.addrLine}>{vendorAddress}</Text> : null}
            {vendorEmail   ? <Text style={s.addrLine}>{vendorEmail}</Text>   : null}
            {vendorPhone   ? <Text style={s.addrLine}>{vendorPhone}</Text>   : null}
          </View>
        </View>

        {/* ── PO heading ── */}
        <Text style={s.poHeading}>Purchase Order # {poNumber}</Text>

        {/* ── Meta: Purchase Rep + Order Date ── */}
        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Purchase Representative</Text>
            <Text style={s.metaValue}>SCM</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Order Date</Text>
            <Text style={s.metaValue}>{fDate(poDate || new Date())}</Text>
          </View>
          {inquiryCode ? (
            <View>
              <Text style={s.metaLabel}>RFQ Reference</Text>
              <Text style={s.metaValue}>{inquiryCode}</Text>
            </View>
          ) : null}
          {quotationNumber ? (
            <View>
              <Text style={s.metaLabel}>Quotation Ref</Text>
              <Text style={s.metaValue}>{quotationNumber}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Items table ── */}
        <View style={s.table}>
          <View style={s.tHeaderRow}>
            <View style={s.cSr}>  <Text style={s.th}>Sr{"\n"}No.</Text></View>
            <View style={s.cDesc}><Text style={s.th}>Description</Text></View>
            <View style={s.cMake}><Text style={s.th}>Make</Text></View>
            <View style={s.cTax}> <Text style={s.th}>Taxes</Text></View>
            <View style={s.cQty}> <Text style={[s.th, { textAlign: "right" }]}>Qty</Text></View>
            <View style={s.cUom}> <Text style={s.th}>UOM</Text></View>
            <View style={s.cUnit}><Text style={[s.th, { textAlign: "right" }]}>Unit Price</Text></View>
            <View style={s.cAmt}> <Text style={[s.th, { textAlign: "right" }]}>Amount</Text></View>
          </View>

          {items.map((item, idx) => (
            <View key={idx} style={idx % 2 === 0 ? s.tRow : s.tRowAlt}>
              <View style={s.cSr}>  <Text style={s.td}>{String(idx + 1).padStart(2, "0")}</Text></View>
              <View style={s.cDesc}>
                <Text style={s.tdBold}>{item.part_number || "—"}</Text>
                {item.description ? <Text style={[s.td, { marginTop: 2, color: C.lgray }]}>{item.description}</Text> : null}
              </View>
              <View style={s.cMake}><Text style={s.td}>{item.brand || "—"}</Text></View>
              <View style={s.cTax}> <Text style={s.td}>{taxTag || "—"}</Text></View>
              <View style={s.cQty}> <Text style={s.tdR}>{item.quantity || "—"}</Text></View>
              <View style={s.cUom}> <Text style={s.td}>{item.uom || "Units"}</Text></View>
              <View style={s.cUnit}><Text style={s.tdR}>{item.unit_price != null ? fMoney(item.unit_price, item.currency || cur) : "—"}</Text></View>
              <View style={s.cAmt}> <Text style={s.tdR}>{item.amount != null ? fMoney(item.amount, item.currency || cur) : "—"}</Text></View>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalsWrap}>
          <View style={s.tRow2}>
            <Text style={s.tLabel}>Untaxed Amount</Text>
            <Text style={s.tValue}>{fMoney(subtotal, cur)}</Text>
          </View>
          {gstType === "IGST" && (
            <View style={s.tRow2}>
              <Text style={s.tLabel}>IGST ({gstRate}%)</Text>
              <Text style={s.tValue}>{fMoney(taxAmount, cur)}</Text>
            </View>
          )}
          {gstType === "CGST_SGST" && (
            <>
              <View style={s.tRow2}>
                <Text style={s.tLabel}>CGST ({Number(gstRate) / 2}%)</Text>
                <Text style={s.tValue}>{fMoney(taxAmount / 2, cur)}</Text>
              </View>
              <View style={s.tRow2}>
                <Text style={s.tLabel}>SGST ({Number(gstRate) / 2}%)</Text>
                <Text style={s.tValue}>{fMoney(taxAmount / 2, cur)}</Text>
              </View>
            </>
          )}
          {gstType === "EXPORT" && (
            <View style={s.tRow2}>
              <Text style={[s.tLabel, { color: C.lgray }]}>Export / LUT (0%)</Text>
              <Text style={s.tValue}>—</Text>
            </View>
          )}
          <View style={s.tDiv} />
          <View style={s.tRow2}>
            <Text style={s.tLabel}>Total</Text>
            <Text style={s.tValueBold}>{fMoney(grandTotal, cur)}</Text>
          </View>
        </View>

        {/* ── Notes ── */}
        {notes ? (
          <View style={{ marginTop: 12, padding: 7, backgroundColor: "#FFF9C4", borderRadius: 3 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Notes / Special Instructions</Text>
            <Text style={{ fontSize: 8, color: C.gray }}>{notes}</Text>
          </View>
        ) : null}

        {/* ── Fixed terms (bullet list) ── */}
        <View style={s.termsWrap}>
          {FIXED_TERMS.map(([label, val], i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={[s.termItem, { marginRight: 4 }]}>•</Text>
              <Text style={s.termItem}>
                {label ? <Text style={s.termBold}>{label}:{"  "}</Text> : null}
                {val}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footLine1}>
            fidusindia@gmail.com  ·  https://www.fidusindia.com/  ·  https://industrialneeds.co/
          </Text>
          <Text style={s.footLine2}>
            Phone : 91-0124-2979669, 9811348738   GST : 06AADCF6467E1ZN   IEC : AADCF6467E   MSME : HR05A0012061
          </Text>
          <Text style={s.footPage}>Page: 1 / 1</Text>
        </View>

      </Page>
    </Document>
  );
}
