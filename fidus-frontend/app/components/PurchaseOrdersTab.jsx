"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, AlertCircle, RefreshCw, Download, Send,
  XCircle, Package, ChevronDown, ChevronUp, Pencil, Save, X,
} from "lucide-react";

const STATUS_STYLES = {
  generated: { bg: "#EEF4FF", text: "#4451E8", label: "Draft"     },
  sent:      { bg: "#F0FDF4", text: "#16A34A", label: "Sent"      },
  cancelled: { bg: "#FEF2F2", text: "#DC2626", label: "Cancelled" },
};

const GST_OPTIONS = [
  { value: "NONE",      label: "No GST / Exempt",          rate: 0  },
  { value: "IGST",      label: "IGST (Interstate)",         rate: 18 },
  { value: "CGST_SGST", label: "CGST + SGST (Intrastate)", rate: 18 },
  { value: "EXPORT",    label: "Export / LUT (0%)",         rate: 0  },
];

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "AED", "GBP", "JPY"];

const DEFAULT_PO_TERMS = `Payment Terms: 20% advance with the purchase order, and the remaining 80% prior to shipment.
Dispatch Schedule: As per Quotation
Warranty: One year from the date the goods arrive to us.
Remarks: Delivery at Shipping address
Note: Goods should be Original & Genuine`;

function badge(status) {
  const s = STATUS_STYLES[status] || { bg: "#F3F4F6", text: "#6B7280", label: status };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

const ZERO_DEC = new Set(["JPY", "KRW", "VND", "IDR"]);
const CUR_SYM  = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED " };

function fmtMoney(value, currency) {
  const code = (currency || "INR").toUpperCase();
  const sym  = CUR_SYM[code] ?? `${code} `;
  const dec  = ZERO_DEC.has(code) ? 0 : 2;
  return `${sym}${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

function gstLabel(gstType, gstRate) {
  if (gstType === "IGST")      return `IGST ${gstRate}%`;
  if (gstType === "CGST_SGST") return `CGST+SGST ${gstRate}%`;
  if (gstType === "EXPORT")    return "Export/LUT";
  return "No GST";
}

/* ── Inline PO Editor ── */
function PoEditor({ po, onSaved, onClose }) {
  const [form, setForm] = useState({
    vendor_name:          po.vendor_name    || "",
    vendor_email:         po.vendor_email   || "",
    vendor_phone:         po.vendor_phone   || "",
    vendor_address:       po.vendor_address || "",
    sales_representative: po.sales_representative || "SCM",
    currency:             po.currency      || "INR",
    gst_type:             po.gst_type      || "NONE",
    gst_rate:             String(po.gst_rate || "18"),
    terms_text:           po.terms_text    || DEFAULT_PO_TERMS,
    notes:                po.notes         || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const showRate = form.gst_type === "IGST" || form.gst_type === "CGST_SGST";

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gst_rate: Number(form.gst_rate) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.purchase_order);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="border-t border-[#EEF2F6] bg-[#FAFBFF] px-5 py-4 space-y-5">

      {/* Vendor Details */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Vendor Details</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Vendor Name",  "vendor_name",    "text"],
            ["Email",        "vendor_email",   "email"],
            ["Phone",        "vendor_phone",   "text"],
            ["Address",      "vendor_address", "text"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">{label}</label>
              <input value={form[key]} onChange={(e) => set(key, e.target.value)}
                className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#4451E8] focus:outline-none focus:ring-2 focus:ring-[#4451E8]/10"
              />
            </div>
          ))}
        </div>
      </div>

      {/* PO Settings */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">PO Settings</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Sales Representative</label>
            <input value={form.sales_representative} onChange={(e) => set("sales_representative", e.target.value)}
              className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#4451E8] focus:outline-none focus:ring-2 focus:ring-[#4451E8]/10"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Currency</label>
            <select value={form.currency} onChange={(e) => set("currency", e.target.value)}
              className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#4451E8] focus:outline-none bg-white">
              {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">GST / Tax</label>
            <select value={form.gst_type} onChange={(e) => {
              const opt = GST_OPTIONS.find((o) => o.value === e.target.value);
              set("gst_type", e.target.value);
              if (opt?.rate) set("gst_rate", String(opt.rate));
              else set("gst_rate", "0");
            }}
              className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#4451E8] focus:outline-none bg-white">
              {GST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {showRate && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                Rate (%) {form.gst_type === "CGST_SGST" && <span className="font-normal text-slate-400">— CGST {Number(form.gst_rate)/2}% + SGST {Number(form.gst_rate)/2}%</span>}
              </label>
              <input type="number" value={form.gst_rate} onChange={(e) => set("gst_rate", e.target.value)}
                min="0" max="100" step="0.5"
                className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#4451E8] focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Terms & Conditions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Terms &amp; Conditions</label>
          <button onClick={() => set("terms_text", DEFAULT_PO_TERMS)}
            className="text-[10px] text-slate-400 hover:text-[#4451E8] transition">Reset to default</button>
        </div>
        <textarea value={form.terms_text} onChange={(e) => set("terms_text", e.target.value)}
          rows={5} placeholder="One term per line…"
          className="w-full rounded-lg border border-[#E4E9F5] px-3 py-2 text-[11px] leading-relaxed resize-y focus:border-[#4451E8] focus:outline-none"
        />
        <p className="text-[10px] text-slate-400 mt-1">Each line becomes a bullet point in the PDF.</p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Special Instructions / Notes</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          rows={2} placeholder="Optional — appears as a highlighted note in the PDF…"
          className="w-full rounded-lg border border-[#E4E9F5] px-3 py-2 text-[11px] leading-relaxed resize-y focus:border-[#4451E8] focus:outline-none"
        />
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600">{err}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-[#4451E8] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#3340D0] transition disabled:opacity-60">
          <Save size={12} /> {saving ? "Saving…" : "Save Changes"}
        </button>
        <button onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[#E4E9F5] px-4 py-2 text-[12px] font-semibold text-slate-600 hover:bg-[#F3F5F7] transition">
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Single PO card ── */
function PoCard({ po: initialPo, onRefresh }) {
  const [po,         setPo]         = useState(initialPo);
  const [expanded,   setExpanded]   = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [sending,    setSending]    = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error,      setError]      = useState("");

  const cur = po.currency || "INR";
  const items = po.items || [];
  const isCancelled = po.status === "cancelled";

  const handleDownload = async () => {
    setError("");
    const res = await fetch(`/api/purchase-orders/${po.id}/pdf`);
    if (!res.ok) { setError("PDF generation failed"); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${po.po_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async () => {
    if (!po.vendor_email) { setError("Vendor email is missing — edit PO details first."); return; }
    if (!confirm(`Send PO ${po.po_number} to ${po.vendor_email}?`)) return;
    setSending(true); setError("");
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  const handleCancel = async () => {
    if (!confirm(`Cancel PO ${po.po_number}? This cannot be undone.`)) return;
    setCancelling(true); setError("");
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setCancelling(false); }
  };

  return (
    <div className="rounded-xl border border-[#E4E9F5] bg-white overflow-hidden"
         style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>

      {/* ── Card Header ── */}
      <div className="flex items-center gap-3 px-4 py-3"
           style={{ background: isCancelled ? "#FEF2F2" : "linear-gradient(90deg,#FAFBFF,#F3F6FF)" }}>
        <Package size={16} className={`shrink-0 ${isCancelled ? "text-red-400" : "text-amber-600"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-800">{po.po_number}</span>
            {badge(po.status)}
            {po.gst_type && po.gst_type !== "NONE" && (
              <span className="rounded-full border border-[#C6F6D5] bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-semibold text-green-700">
                {gstLabel(po.gst_type, po.gst_rate)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {po.vendor_name || "Unknown vendor"}
            {po.vendor_email && <span className="ml-1.5 text-slate-400">{po.vendor_email}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {Number(po.tax_amount) > 0 && (
            <p className="text-[10px] text-slate-400">{fmtMoney(po.subtotal, cur)} + tax</p>
          )}
          <p className="text-[13px] font-bold text-slate-800">{fmtMoney(po.grand_total, cur)}</p>
        </div>
        <button onClick={() => { setExpanded((v) => !v); setEditing(false); }}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E4E9F5] text-slate-400 hover:bg-[#F3F5F7] transition">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* ── Expanded: items table ── */}
      {expanded && !editing && (
        <>
          {items.length > 0 && (
            <div className="border-t border-[#EEF2F6] overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[#F8FAFF]">
                    {["#", "Part No.", "Description", "Make", "Taxes", "Qty", "UOM", "Unit Price", "Amount"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFBFF]"}>
                      <td className="px-3 py-2 text-slate-400">{String(i + 1).padStart(2, "0")}</td>
                      <td className="px-3 py-2 font-semibold text-[#1D6FD8]">{item.part_number || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.description || "—"}</td>
                      <td className="px-3 py-2">{item.brand || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{gstLabel(po.gst_type, po.gst_rate)}</td>
                      <td className="px-3 py-2 text-right">{item.quantity || "—"}</td>
                      <td className="px-3 py-2">{item.uom || "—"}</td>
                      <td className="px-3 py-2 text-right">{item.unit_price != null ? fmtMoney(item.unit_price, item.currency || cur) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">{item.amount != null ? fmtMoney(item.amount, item.currency || cur) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#D0DCF4] bg-[#EEF4FF]">
                    <td colSpan={8} className="px-3 py-2 text-right text-[11px] font-semibold text-slate-600">Untaxed Amount</td>
                    <td className="px-3 py-2 text-right text-[11px] font-semibold">{fmtMoney(po.subtotal, cur)}</td>
                  </tr>
                  {Number(po.tax_amount) > 0 && (
                    <tr className="bg-[#EEF4FF]">
                      <td colSpan={8} className="px-3 py-2 text-right text-[11px] font-semibold text-slate-600">
                        {gstLabel(po.gst_type, po.gst_rate)}
                      </td>
                      <td className="px-3 py-2 text-right text-[11px] font-semibold">{fmtMoney(po.tax_amount, cur)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[#4451E8] bg-[#EEF4FF]">
                    <td colSpan={8} className="px-3 py-2 text-right text-[12px] font-bold text-[#4451E8]">Total</td>
                    <td className="px-3 py-2 text-right text-[12px] font-bold text-[#4451E8]">{fmtMoney(po.grand_total, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* PO meta info */}
          <div className="border-t border-[#EEF2F6] px-5 py-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Sales Rep</p>
              <p className="text-[12px] text-slate-700">{po.sales_representative || "SCM"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Currency</p>
              <p className="text-[12px] text-slate-700">{po.currency || "INR"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">GST</p>
              <p className="text-[12px] text-slate-700">{gstLabel(po.gst_type, po.gst_rate)}</p>
            </div>
          </div>
        </>
      )}

      {/* ── Editor ── */}
      {expanded && editing && !isCancelled && (
        <PoEditor po={po}
          onSaved={(updated) => { setPo((p) => ({ ...p, ...updated })); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* ── Sent banner ── */}
      {po.status === "sent" && po.vendor_email && (
        <div className="border-t border-[#D1FAE5] bg-[#F0FDF4] px-4 py-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-green-600">Sent to</span>
          <span className="text-[12px] font-semibold text-green-800">{po.vendor_email}</span>
          {po.sent_at && (
            <span className="ml-auto text-[10px] text-green-600">
              {new Date(po.sent_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {!isCancelled && (
        <div className="flex items-center gap-2 border-t border-[#EEF2F6] px-4 py-2.5 flex-wrap">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-[#E4E9F5] bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#F3F5F7] transition">
            <Download size={12} /> Download PDF
          </button>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 rounded-lg bg-[#4451E8] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3340D0] transition disabled:opacity-60">
            <Send size={12} /> {sending ? "Sending…" : po.status === "sent" ? "Resend to Vendor" : "Send to Vendor"}
          </button>
          {!editing && (
            <button onClick={() => { setExpanded(true); setEditing(true); }}
              className="flex items-center gap-1.5 rounded-lg border border-[#E4E9F5] bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#F3F5F7] transition">
              <Pencil size={12} /> Edit PO
            </button>
          )}
          <button onClick={handleCancel} disabled={cancelling}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 transition disabled:opacity-60">
            <XCircle size={12} /> {cancelling ? "Cancelling…" : "Cancel PO"}
          </button>
        </div>
      )}

      {error && (
        <p className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle size={12} className="shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

/* ── Main tab ── */
export default function PurchaseOrdersTab({ inquiry }) {
  const [pos,     setPos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const fetchPos = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/purchase-orders?unique_code=${inquiry.unique_code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load POs");
      setPos(data.purchase_orders || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [inquiry.unique_code]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  const activePOs    = pos.filter((p) => p.status !== "cancelled");
  const cancelledPOs = pos.filter((p) => p.status === "cancelled");

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5 gap-4">

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={16} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Empty state */}
          {activePOs.length === 0 && cancelledPOs.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E4E9F5] py-14 text-center px-6">
              <ShoppingCart size={34} className="mb-3 text-slate-300" />
              <p className="text-[13px] font-semibold text-slate-600">No Purchase Orders yet</p>
              <p className="mt-1.5 text-[12px] text-slate-400 max-w-sm leading-relaxed">
                Go to <span className="font-semibold text-slate-600">Reply to Client</span> tab, select vendor prices for each part,
                then click <span className="font-semibold text-slate-600">Create Purchase Orders</span> to generate POs with GST, currency, and T&C settings.
              </p>
            </div>
          )}

          {/* Active POs */}
          {activePOs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-slate-500">
                  {activePOs.length} Purchase Order{activePOs.length !== 1 ? "s" : ""}
                </p>
                <button onClick={fetchPos}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition">
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              {activePOs.map((po) => (
                <PoCard key={po.id} po={po} onRefresh={fetchPos} />
              ))}
            </div>
          )}

          {/* Cancelled POs */}
          {cancelledPOs.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600 select-none">
                Show cancelled POs ({cancelledPOs.length})
              </summary>
              <div className="mt-2 space-y-2">
                {cancelledPOs.map((po) => (
                  <PoCard key={po.id} po={po} onRefresh={fetchPos} />
                ))}
              </div>
            </details>
          )}

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
