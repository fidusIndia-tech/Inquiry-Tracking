"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, CheckCircle, AlertCircle, RefreshCw,
  Download, Send, XCircle, Eye, Package, Pencil, Save,
} from "lucide-react";

const STATUS_STYLES = {
  generated: { bg: "#EEF4FF", text: "#4451E8", label: "Generated" },
  sent:      { bg: "#F0FDF4", text: "#16A34A", label: "Sent"      },
  cancelled: { bg: "#FEF2F2", text: "#DC2626", label: "Cancelled" },
};

const GST_OPTIONS = [
  { value: "NONE",      label: "No GST / Exempt",        rate: 0  },
  { value: "IGST",      label: "IGST (Interstate)",       rate: 18 },
  { value: "CGST_SGST", label: "CGST + SGST (Intrastate)", rate: 18 },
  { value: "EXPORT",    label: "Export / LUT (0%)",       rate: 0  },
];

function badge(status) {
  const s = STATUS_STYLES[status] || { bg: "#F3F4F6", text: "#6B7280", label: status };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function fmtMoney(value, currency) {
  const code = (currency || "INR").toUpperCase();
  const sym  = code === "INR" ? "₹" : code;
  return `${sym} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Vendor details editor inside each PO card ── */
function VendorEditor({ po, onSaved }) {
  const [open, setOpen]    = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr]      = useState("");
  const [form, setForm]    = useState({
    vendor_name:    po.vendor_name    || "",
    vendor_email:   po.vendor_email   || "",
    vendor_phone:   po.vendor_phone   || "",
    vendor_address: po.vendor_address || "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOpen(false);
      onSaved(data.purchase_order);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition">
        <Pencil size={11} /> Edit vendor details
      </button>
    );
  }

  return (
    <div className="border-t border-[#EEF2F6] px-4 py-3 bg-[#FAFBFF]">
      <p className="text-[11px] font-semibold text-slate-600 mb-2">Edit Vendor Details</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Vendor Name",    "vendor_name",    "text"],
          ["Email",          "vendor_email",   "email"],
          ["Phone",          "vendor_phone",   "text"],
          ["Address",        "vendor_address", "text"],
        ].map(([label, key]) => (
          <div key={key}>
            <label className="block text-[10px] text-slate-500 mb-0.5">{label}</label>
            <input
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              className="w-full rounded border border-[#E4E9F5] px-2 py-1 text-[11px] focus:border-[#4451E8] focus:outline-none"
            />
          </div>
        ))}
      </div>
      {err && <p className="mt-1.5 text-[10px] text-red-500">{err}</p>}
      <div className="mt-2.5 flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 rounded bg-[#4451E8] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3340D0] disabled:opacity-60">
          <Save size={11} /> {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)}
          className="rounded border border-[#E4E9F5] px-3 py-1.5 text-[11px] text-slate-600 hover:bg-[#F3F5F7]">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Single PO card ── */
function PoCard({ po: initialPo, onRefresh }) {
  const [po, setPo]               = useState(initialPo);
  const [sending, setSending]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [error, setError]         = useState("");

  const cur = po.currency || "INR";
  const items = po.items || [];

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
    if (!po.vendor_email) { setError("Vendor email is missing — edit vendor details first."); return; }
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

  const gstLabel = po.gst_type === "IGST"      ? `IGST ${po.gst_rate}%`
                 : po.gst_type === "CGST_SGST"  ? `CGST+SGST ${po.gst_rate}%`
                 : po.gst_type === "EXPORT"      ? "Export/LUT"
                 : "No GST";

  return (
    <div className="rounded-xl border border-[#E4E9F5] bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Package size={15} className="shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-800 truncate">{po.po_number}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {po.vendor_name || po.vendor_email || "Unknown vendor"}
              {po.vendor_email ? <span className="ml-1 text-slate-400">· {po.vendor_email}</span> : null}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{gstLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge(po.status)}
          <div className="text-right">
            {Number(po.tax_amount) > 0 && (
              <p className="text-[10px] text-slate-400">{fmtMoney(po.subtotal, cur)} + tax</p>
            )}
            <p className="text-[12px] font-bold text-slate-800">{fmtMoney(po.grand_total, cur)}</p>
          </div>
          <button onClick={() => setExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E9F5] text-slate-400 hover:bg-[#F3F5F7]">
            <Eye size={13} />
          </button>
        </div>
      </div>

      {/* Items table */}
      {expanded && items.length > 0 && (
        <div className="border-t border-[#EEF2F6] overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#F8FAFF]">
                {["#", "Part Number", "Description", "Make", "Taxes", "Qty", "UOM", "Unit Price", "Amount"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFBFF]"}>
                  <td className="px-3 py-2 text-slate-400">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{item.part_number || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.description || "—"}</td>
                  <td className="px-3 py-2">{item.brand || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{gstLabel}</td>
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
                  <td colSpan={8} className="px-3 py-2 text-right text-[11px] font-semibold text-slate-600">{gstLabel}</td>
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

      {/* Vendor editor */}
      {po.status !== "cancelled" && (
        <VendorEditor po={po} onSaved={(updated) => setPo((prev) => ({ ...prev, ...updated }))} />
      )}

      {/* Actions */}
      {po.status !== "cancelled" && (
        <div className="flex items-center gap-2 border-t border-[#EEF2F6] px-4 py-2.5">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-[#E4E9F5] bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#F3F5F7] transition">
            <Download size={12} /> Download PDF
          </button>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 rounded-lg bg-[#4451E8] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3340D0] transition disabled:opacity-60">
            <Send size={12} /> {sending ? "Sending…" : po.status === "sent" ? "Resend to Vendor" : "Send to Vendor"}
          </button>
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

/* ── GST selector (shown before Generate) ── */
function GstSelector({ gstType, gstRate, onChangeType, onChangeRate }) {
  const opt = GST_OPTIONS.find((o) => o.value === gstType) || GST_OPTIONS[0];
  const showRate = gstType === "IGST" || gstType === "CGST_SGST";
  return (
    <div className="mt-3 rounded-lg border border-[#E4E9F5] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-600 mb-2">GST / Tax applicable on this PO</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {GST_OPTIONS.map((o) => (
          <button key={o.value} onClick={() => { onChangeType(o.value); if (o.rate) onChangeRate(String(o.rate)); else onChangeRate("0"); }}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${gstType === o.value ? "bg-[#4451E8] border-[#4451E8] text-white" : "border-[#E4E9F5] text-slate-600 hover:bg-[#F3F5F7]"}`}>
            {o.label}
          </button>
        ))}
      </div>
      {showRate && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500">Rate (%)</label>
          <input type="number" value={gstRate} onChange={(e) => onChangeRate(e.target.value)} min="0" max="100" step="0.5"
            className="w-20 rounded border border-[#E4E9F5] px-2 py-1 text-[11px] focus:border-[#4451E8] focus:outline-none" />
          <span className="text-[10px] text-slate-400">
            {gstType === "CGST_SGST" ? `(CGST ${Number(gstRate)/2}% + SGST ${Number(gstRate)/2}%)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Main tab ── */
export default function PurchaseOrdersTab({ inquiry }) {
  const [pos, setPos]               = useState([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState("");
  const [confirming, setConfirming] = useState(false);
  const [acceptedQuotation, setAcceptedQuotation] = useState(null);

  // GST state for generation
  const [gstType, setGstType] = useState("NONE");
  const [gstRate, setGstRate] = useState("18");

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

  const fetchAcceptedQuotation = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotations?unique_code=${inquiry.unique_code}`);
      const data = await res.json();
      if (!res.ok) return;
      const quotations = data.quotations || [];
      const accepted = quotations.find((q) => q.status === "accepted")
                    || quotations.find((q) => q.status === "downloaded" || q.status === "sent");
      setAcceptedQuotation(accepted || null);
    } catch (_) { /* silent */ }
  }, [inquiry.unique_code]);

  useEffect(() => {
    fetchPos();
    fetchAcceptedQuotation();
  }, [fetchPos, fetchAcceptedQuotation]);

  const handleConfirmQuotation = async () => {
    if (!acceptedQuotation) return;
    if (!confirm("Mark this quotation as client-confirmed? This will move the inquiry to 'Converted'.")) return;
    setConfirming(true); setError("");
    try {
      const res = await fetch(`/api/quotations/${acceptedQuotation.id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirm failed");
      await fetchAcceptedQuotation();
    } catch (e) { setError(e.message); }
    finally { setConfirming(false); }
  };

  const handleGenerate = async () => {
    if (!acceptedQuotation) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_unique_code: inquiry.unique_code,
          quotation_id:        acceptedQuotation.id,
          gst_type:            gstType,
          gst_rate:            Number(gstRate) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PO generation failed");
      if (data.missing_vendor_lines?.length > 0) {
        alert(`POs generated. Note: parts with no vendor selected were skipped: ${data.missing_vendor_lines.join(", ")}`);
      }
      await fetchPos();
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const activePOs = pos.filter((p) => p.status !== "cancelled");
  const hasActivePOs = activePOs.length > 0;
  const isAlreadyConfirmed = acceptedQuotation?.status === "accepted" || inquiry.status === "converted";
  const hasAccepted = acceptedQuotation != null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5 gap-4">

      {/* Step 1: no quotation yet */}
      {!hasAccepted && !hasActivePOs && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E4E9F5] py-12 text-center">
          <ShoppingCart size={32} className="mb-3 text-slate-300" />
          <p className="text-[13px] font-semibold text-slate-500">No confirmed quotation yet</p>
          <p className="mt-1 text-[12px] text-slate-400 max-w-sm">
            Go to <span className="font-semibold">Reply to Client</span> tab, send or download the quotation,
            then return here to generate Purchase Orders once the client confirms.
          </p>
        </div>
      )}

      {/* Step 2: quotation sent but not client-confirmed */}
      {hasAccepted && !isAlreadyConfirmed && !hasActivePOs && (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-amber-800">Client confirmation required</p>
              <p className="mt-1 text-[12px] text-amber-700">
                Quotation <strong>{acceptedQuotation.quotation_number}</strong> has been sent/downloaded.
                Once the client confirms, mark it as accepted to generate Purchase Orders.
              </p>
              {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
              <button onClick={handleConfirmQuotation} disabled={confirming}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-[12px] font-semibold text-white hover:bg-amber-600 transition disabled:opacity-60">
                <CheckCircle size={13} /> {confirming ? "Marking…" : "Mark as Client Confirmed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: confirmed — show GST selector + Generate button */}
      {isAlreadyConfirmed && !hasActivePOs && !loading && (
        <div className="rounded-xl border border-[#C6F6D5] bg-[#F0FDF4] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-green-500" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-green-800">Quotation confirmed — ready to generate POs</p>
              <p className="mt-1 text-[12px] text-green-700">
                {acceptedQuotation
                  ? `Quotation ${acceptedQuotation.quotation_number} was confirmed by the client.`
                  : "This inquiry has been converted."}
                {" "}One Purchase Order will be created per vendor.
              </p>

              <GstSelector
                gstType={gstType} gstRate={gstRate}
                onChangeType={setGstType} onChangeRate={setGstRate}
              />

              {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
              <button onClick={handleGenerate} disabled={generating || !acceptedQuotation}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-green-700 transition disabled:opacity-60">
                <ShoppingCart size={13} /> {generating ? "Generating…" : "Generate Purchase Orders"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw size={16} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {activePOs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-slate-500">
                {activePOs.length} Purchase Order{activePOs.length !== 1 ? "s" : ""} generated
              </p>
              <button onClick={fetchPos}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition">
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
          )}

          {activePOs.map((po) => (
            <PoCard key={po.id} po={po} onRefresh={fetchPos} />
          ))}

          {pos.filter((p) => p.status === "cancelled").length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600 select-none">
                Show cancelled POs ({pos.filter((p) => p.status === "cancelled").length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {pos.filter((p) => p.status === "cancelled").map((po) => (
                  <PoCard key={po.id} po={po} onRefresh={fetchPos} />
                ))}
              </div>
            </details>
          )}

          {/* Re-generate after all cancelled */}
          {isAlreadyConfirmed && !hasActivePOs && pos.length > 0 && (
            <div className="rounded-xl border border-[#E4E9F5] p-4">
              <p className="text-[12px] font-semibold text-slate-600 mb-2">All POs were cancelled — re-generate</p>
              <GstSelector
                gstType={gstType} gstRate={gstRate}
                onChangeType={setGstType} onChangeRate={setGstRate}
              />
              {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
              <button onClick={handleGenerate} disabled={generating || !acceptedQuotation}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#4451E8] px-4 py-2 text-[12px] font-semibold text-[#4451E8] hover:bg-[#EEF4FF] transition disabled:opacity-60">
                <ShoppingCart size={13} /> {generating ? "Generating…" : "Re-generate POs"}
              </button>
            </div>
          )}

          {error && !generating && !confirming && !isAlreadyConfirmed && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
