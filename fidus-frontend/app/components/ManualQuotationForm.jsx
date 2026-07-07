"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Plus, Save, Trash2, X } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES   = ["INR", "USD", "EUR", "AED", "GBP", "JPY", "THB", "SGD", "CNY", "MYR"];
const GST_OPTIONS  = [
  { value: "NONE",      label: "No GST / Exempt" },
  { value: "CGST_SGST", label: "CGST + SGST" },
  { value: "IGST",      label: "IGST" },
  { value: "EXPORT",    label: "Export / LUT / Zero Rated" },
  { value: "CUSTOM",    label: "Custom Tax" },
];
const GST_RATES    = [5, 12, 18, 28];
const UOM_OPTIONS  = ["NOS", "PCS", "SET", "KG", "MTR", "LTR", "BOX", "ROLL", "PAIR", "EA"];

// ── Helpers ──────────────────────────────────────────────────────────────────

const newLine = () => ({
  _key:             Math.random().toString(36).slice(2),
  part_number:      "",
  description:      "",
  brand:            "",
  quantity:         1,
  uom:              "NOS",
  unit_price:       0,
  discount_percent: 0,
  lead_time:        "",
});

function fmtNum(v) {
  return Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, textarea, type = "text", required }) {
  const cls =
    "w-full rounded-lg border border-[#E4E8EE] bg-white px-3 py-1.5 text-[12px] " +
    "text-slate-800 outline-none focus:border-[#5BA7FF] resize-none transition";
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#E4E8EE] bg-white px-3 py-1.5 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] transition"
      >
        {children}
      </select>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ManualQuotationForm
 *
 * Props:
 *   onClose  — called when the user dismisses the form
 *   onSaved  — called after a successful save (parent can refresh the list)
 *   editId   — optional quotation ID to load and edit an existing draft
 */
export default function ManualQuotationForm({ onClose, onSaved, editId }) {
  // ── Form header fields ──────────────────────────────────────────────────
  const [clientName,      setClientName]      = useState("");
  const [clientPhone,     setClientPhone]     = useState("");
  const [billingAddress,  setBillingAddress]  = useState("");
  const [salesperson,     setSalesperson]     = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("userName") || "";
    return "";
  });
  const [currency,        setCurrency]        = useState("INR");

  // ── GST fields ──────────────────────────────────────────────────────────
  const [gstType,         setGstType]         = useState("NONE");
  const [gstRate,         setGstRate]         = useState(18);
  const [customTaxName,   setCustomTaxName]   = useState("Custom Tax");
  const [customTaxRate,   setCustomTaxRate]   = useState(0);

  // ── Line items ──────────────────────────────────────────────────────────
  const [lines, setLines] = useState([newLine()]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [saving,    setSaving]    = useState(false);
  const [savedId,   setSavedId]   = useState(editId || null);
  const [savedQNum, setSavedQNum] = useState(null);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(!!editId);

  // ── Load existing draft when editId is provided ─────────────────────────
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    fetch(`/api/quotations/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        const q = d.quotation;
        if (!q) return;
        setClientName(q.client_name         || "");
        setClientPhone(q.client_phone       || "");
        setBillingAddress(q.billing_address || "");
        setSalesperson(q.salesperson        || "");
        setCurrency(q.currency              || "INR");
        setGstType(q.gst_type               || "NONE");
        setGstRate(q.gst_rate               || 18);
        setCustomTaxName(q.custom_tax_name  || "Custom Tax");
        setCustomTaxRate(q.custom_tax_rate  || 0);
        setSavedQNum(q.quotation_number     || null);
        if (q.lines?.length) {
          setLines(
            q.lines.map((l) => ({
              _key:             Math.random().toString(36).slice(2),
              part_number:      l.part_number      || "",
              description:      l.description      || "",
              brand:            l.brand            || "",
              quantity:         l.quantity         ?? 1,
              uom:              l.uom              || "NOS",
              // stored as selling_price on first save; unit_price on re-edit
              unit_price:       l.unit_price       ?? l.selling_price ?? 0,
              discount_percent: l.discount_percent ?? 0,
              lead_time:        l.lead_time        || "",
            }))
          );
        }
      })
      .catch(() => setError("Failed to load draft."))
      .finally(() => setLoading(false));
  }, [editId]);

  // ── Computed totals (reactive) ──────────────────────────────────────────
  const totals = useMemo(() => {
    const taxable = lines.reduce((sum, l) => {
      const disc = Math.max(0, Math.min(100, Number(l.discount_percent || 0)));
      return sum + Number(l.quantity || 0) * Number(l.unit_price || 0) * (1 - disc / 100);
    }, 0);

    let cgst = 0, sgst = 0, igst = 0, customAmount = 0, taxAmount = 0;
    const rate = Number(gstRate || 0);

    if (gstType === "CGST_SGST") {
      cgst = sgst = taxable * (rate / 2) / 100;
      taxAmount    = cgst + sgst;
    } else if (gstType === "IGST") {
      igst      = taxable * rate / 100;
      taxAmount = igst;
    } else if (gstType === "CUSTOM") {
      customAmount = taxable * Number(customTaxRate || 0) / 100;
      taxAmount    = customAmount;
    }

    return { taxable, cgst, sgst, igst, customAmount, taxAmount, grandTotal: taxable + taxAmount };
  }, [lines, gstType, gstRate, customTaxRate]);

  // ── Line item callbacks ─────────────────────────────────────────────────
  const updateLine = useCallback((key, field, value) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));
  }, []);

  const removeLine = useCallback((key) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l._key !== key) : prev));
  }, []);

  const addLine = useCallback(() => setLines((prev) => [...prev, newLine()]), []);

  // ── Build API payload ───────────────────────────────────────────────────
  const buildPayload = (status) => {
    const processedLines = lines.map((l) => {
      const disc          = Math.max(0, Math.min(100, Number(l.discount_percent || 0)));
      const selling_price = Number(l.unit_price || 0) * (1 - disc / 100);
      return {
        part_number:      l.part_number  || "",
        description:      l.description  || "",
        brand:            l.brand        || "",
        quantity:         Number(l.quantity || 1),
        uom:              l.uom          || "NOS",
        unit_price:       Number(l.unit_price || 0),
        discount_percent: disc,
        selling_price:    Math.round(selling_price * 100) / 100,
        lead_time:        l.lead_time    || "",
        currency,
      };
    });

    return {
      client_name:      clientName.trim(),
      client_phone:     clientPhone  || null,
      billing_address:  billingAddress || null,
      salesperson:      salesperson  || null,
      currency,
      lines:            processedLines,
      gst_type:         gstType,
      gst_rate:         (gstType === "CGST_SGST" || gstType === "IGST") ? Number(gstRate) : null,
      custom_tax_name:  gstType === "CUSTOM" ? customTaxName : null,
      custom_tax_rate:  gstType === "CUSTOM" ? Number(customTaxRate) : null,
      taxable_amount:   Math.round(totals.taxable   * 100) / 100,
      tax_amount:       Math.round(totals.taxAmount  * 100) / 100,
      grand_total:      Math.round(totals.grandTotal * 100) / 100,
      status,
    };
  };

  // ── Save handler ────────────────────────────────────────────────────────
  const handleSave = async (status = "draft") => {
    if (!clientName.trim()) { setError("Customer name is required."); return; }
    setError(""); setSaving(true);

    try {
      const payload = buildPayload(status);
      let res, data;

      if (savedId) {
        res  = await fetch(`/api/quotations/${savedId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        data = await res.json();
      } else {
        res  = await fetch("/api/quotations/manual", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        data = await res.json();
        if (data.quotation?.id) {
          setSavedId(data.quotation.id);
          setSavedQNum(data.quotation.quotation_number);
        }
      }

      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white"
        style={{
          maxHeight: "92vh",
          boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
        }}
      >
        {/* ── Header bar ── */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-[#E4EDFF] px-6 py-4"
          style={{ background: "linear-gradient(135deg,#EEF4FF,#F5F3FF)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" }}
            >
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-slate-900">
                {savedId ? "Edit Draft Quotation" : "New Quotation"}
              </h2>
              {savedQNum && (
                <p className="font-mono text-[10px] text-slate-400">{savedQNum} · Draft</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="py-8 text-center text-[12px] text-slate-400">Loading draft…</p>
          ) : (
            <>
              {/* Customer + Quotation meta */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Customer */}
                <div className="space-y-3 rounded-xl border border-[#E4EDFF] bg-[#FAFBFF] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Customer
                  </p>
                  <Field
                    label="Customer Name" required
                    value={clientName} onChange={setClientName}
                    placeholder="e.g. Acme Industries Ltd"
                  />
                  <Field
                    label="Phone"
                    value={clientPhone} onChange={setClientPhone}
                    placeholder="+91 98765 43210"
                  />
                  <Field
                    label="Billing Address" textarea
                    value={billingAddress} onChange={setBillingAddress}
                    placeholder="Street, City, State, PIN"
                  />
                </div>

                {/* Quotation meta + GST */}
                <div className="space-y-3 rounded-xl border border-[#E4EDFF] bg-[#FAFBFF] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Quotation Details
                  </p>
                  <Field
                    label="Salesperson"
                    value={salesperson} onChange={setSalesperson}
                    placeholder="Name"
                  />
                  <SelectField label="Currency" value={currency} onChange={setCurrency}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                  <SelectField label="GST Type" value={gstType} onChange={setGstType}>
                    {GST_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </SelectField>
                  {(gstType === "CGST_SGST" || gstType === "IGST") && (
                    <SelectField label="GST Rate %" value={gstRate} onChange={(v) => setGstRate(Number(v))}>
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </SelectField>
                  )}
                  {gstType === "CUSTOM" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label="Tax Name"
                        value={customTaxName} onChange={setCustomTaxName}
                        placeholder="e.g. TCS"
                      />
                      <Field
                        label="Rate %"
                        type="number" value={customTaxRate}
                        onChange={(v) => setCustomTaxRate(v)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Order lines */}
              <div className="overflow-hidden rounded-xl border border-[#E4EDFF]">
                <div className="flex items-center justify-between border-b border-[#E4EDFF] px-4 py-2.5" style={{ background: "#EEF4FF" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#4461A8]">
                    Order Lines
                  </p>
                  <button
                    onClick={addLine}
                    className="flex items-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-3 py-1 text-[11px] font-semibold text-[#4451E8] transition hover:bg-[#EEF0FF]"
                  >
                    <Plus size={11} />Add Line
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]" style={{ minWidth: 860 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["#", "Product / Part No.", "Description", "Make", "Qty", "UoM", "Unit Price", "Disc %", "Lead Time", ""].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap border-b border-[#E4EDFF] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr
                          key={l._key}
                          className="border-b border-[#F0F4F8] transition hover:bg-[#FAFBFF]"
                        >
                          <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={l.part_number}
                              onChange={(e) => updateLine(l._key, "part_number", e.target.value)}
                              className="w-28 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                              placeholder="Part / product"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={l.description}
                              onChange={(e) => updateLine(l._key, "description", e.target.value)}
                              className="w-36 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                              placeholder="Description"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={l.brand}
                              onChange={(e) => updateLine(l._key, "brand", e.target.value)}
                              className="w-20 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                              placeholder="Make"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number" min="0"
                              value={l.quantity}
                              onChange={(e) => updateLine(l._key, "quantity", e.target.value)}
                              className="w-14 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={l.uom}
                              onChange={(e) => updateLine(l._key, "uom", e.target.value)}
                              className="w-16 rounded border border-[#E4E8EE] px-1 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                            >
                              {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number" min="0" step="0.01"
                              value={l.unit_price}
                              onChange={(e) => updateLine(l._key, "unit_price", e.target.value)}
                              className="w-24 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number" min="0" max="100"
                              value={l.discount_percent}
                              onChange={(e) => updateLine(l._key, "discount_percent", e.target.value)}
                              className="w-14 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={l.lead_time}
                              onChange={(e) => updateLine(l._key, "lead_time", e.target.value)}
                              className="w-24 rounded border border-[#E4E8EE] px-2 py-1 text-[11px] outline-none focus:border-[#5BA7FF]"
                              placeholder="e.g. 2-3 wks"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => removeLine(l._key)}
                              disabled={lines.length === 1}
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div
                  className="w-68 min-w-[260px] space-y-1.5 rounded-xl border border-[#E4EDFF] p-4 text-[12px]"
                  style={{ background: "#FAFBFF" }}
                >
                  <TotalRow label="Taxable Amount" value={`${currency} ${fmtNum(totals.taxable)}`} />
                  {gstType === "CGST_SGST" && (
                    <>
                      <TotalRow label={`CGST @ ${Number(gstRate) / 2}%`} value={`${currency} ${fmtNum(totals.cgst)}`} muted />
                      <TotalRow label={`SGST @ ${Number(gstRate) / 2}%`} value={`${currency} ${fmtNum(totals.sgst)}`} muted />
                    </>
                  )}
                  {gstType === "IGST" && (
                    <TotalRow label={`IGST @ ${gstRate}%`} value={`${currency} ${fmtNum(totals.igst)}`} muted />
                  )}
                  {gstType === "CUSTOM" && (
                    <TotalRow
                      label={`${customTaxName || "Custom"} @ ${customTaxRate}%`}
                      value={`${currency} ${fmtNum(totals.customAmount)}`}
                      muted
                    />
                  )}
                  {(gstType === "NONE" || gstType === "EXPORT") && (
                    <TotalRow label="GST" value={`${currency} 0.00`} muted />
                  )}
                  <div className="border-t border-slate-200 pt-1.5">
                    <TotalRow
                      label="Grand Total"
                      value={`${currency} ${fmtNum(totals.grandTotal)}`}
                      bold
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer action bar ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-[#E4EDFF] bg-[#FAFBFF] px-6 py-4">
          <div className="min-h-[18px]">
            {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-[#E4E8EE] bg-white px-4 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave("draft")}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-4 py-2 text-[12px] font-semibold text-[#4451E8] transition hover:bg-[#EEF0FF] disabled:opacity-50"
            >
              <Save size={13} />
              {saving ? "Saving…" : "Save Draft"}
            </button>
            {savedId && (
              <a
                href={`/api/quotations/pdf?id=${savedId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#4451E8] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#3640C8]"
              >
                <Download size={13} />
                Download PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted, bold }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={muted ? "text-slate-400" : bold ? "font-bold text-[#C0392B]" : "text-slate-600"}>
        {label}
      </span>
      <span className={bold ? "font-bold text-[#C0392B]" : "text-slate-700"}>{value}</span>
    </div>
  );
}
