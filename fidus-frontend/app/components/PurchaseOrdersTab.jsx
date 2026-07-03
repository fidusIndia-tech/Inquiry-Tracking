"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, CheckCircle, AlertCircle, RefreshCw,
  Download, Send, XCircle, Eye, Package,
} from "lucide-react";

const STATUS_STYLES = {
  generated: { bg: "#EEF4FF", text: "#4451E8", label: "Generated" },
  sent:      { bg: "#F0FDF4", text: "#16A34A", label: "Sent"      },
  cancelled: { bg: "#FEF2F2", text: "#DC2626", label: "Cancelled" },
};

function badge(status) {
  const s = STATUS_STYLES[status] || { bg: "#F3F4F6", text: "#6B7280", label: status };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function formatMoney(value, currency) {
  const code = (currency || "INR").toUpperCase();
  return `${code} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Single PO card ── */
function PoCard({ po, onRefresh }) {
  const [sending, setSending]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [error, setError]         = useState("");

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

  const items = po.items || [];

  return (
    <div className="rounded-xl border border-[#E4E9F5] bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Package size={15} className="shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-800 truncate">{po.po_number}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {po.vendor_name || po.vendor_email || "Unknown vendor"}
              {po.vendor_email ? <span className="ml-1 text-slate-400">· {po.vendor_email}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge(po.status)}
          <span className="text-[12px] font-semibold text-slate-700">{formatMoney(po.grand_total, po.currency)}</span>
          <button onClick={() => setExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4E9F5] text-slate-400 hover:bg-[#F3F5F7]">
            <Eye size={13} />
          </button>
        </div>
      </div>

      {/* Items table (expandable) */}
      {expanded && items.length > 0 && (
        <div className="border-t border-[#EEF2F6] overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#F8FAFF]">
                {["#", "Part Number", "Description", "Make", "Qty", "UOM", "Unit Price", "Lead Time", "Availability"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFBFF]"}>
                  <td className="px-3 py-2 text-slate-400">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{item.part_number || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{item.description || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{item.brand || "—"}</td>
                  <td className="px-3 py-2 text-right">{item.quantity || "—"}</td>
                  <td className="px-3 py-2">{item.uom || "—"}</td>
                  <td className="px-3 py-2 text-right">{item.unit_price != null ? formatMoney(item.unit_price, item.currency || po.currency) : "—"}</td>
                  <td className="px-3 py-2">{item.lead_time || "—"}</td>
                  <td className="px-3 py-2">{item.availability || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {po.status !== "cancelled" && (
        <div className="flex items-center gap-2 border-t border-[#EEF2F6] px-4 py-2.5">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-[#E4E9F5] bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#F3F5F7] transition">
            <Download size={12} /> Download PDF
          </button>
          {po.vendor_email && (
            <button onClick={handleSend} disabled={sending}
              className="flex items-center gap-1.5 rounded-lg bg-[#4451E8] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3340D0] transition disabled:opacity-60">
              <Send size={12} /> {sending ? "Sending…" : po.status === "sent" ? "Resend" : "Send to Vendor"}
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
  const [pos, setPos]             = useState([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState("");
  const [confirming, setConfirming] = useState(false);
  const [acceptedQuotation, setAcceptedQuotation] = useState(null);

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
      // Prefer one already marked accepted; fall back to sent/downloaded (awaiting client confirm)
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
    if (!confirm("Generate Purchase Orders from the confirmed quotation?")) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_unique_code: inquiry.unique_code,
          quotation_id: acceptedQuotation.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PO generation failed");
      if (data.missing_vendor_lines?.length > 0) {
        alert(`POs generated. Note: the following parts had no vendor selected and were skipped: ${data.missing_vendor_lines.join(", ")}`);
      }
      await fetchPos();
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const activePOs = pos.filter((p) => p.status !== "cancelled");
  const hasActivePOs = activePOs.length > 0;

  /* ── Determine which state we're in ── */
  const isConverted = inquiry.status === "converted";
  const hasAccepted = acceptedQuotation != null;
  const isAlreadyConfirmed = acceptedQuotation?.status === "accepted" || inquiry.status === "converted";

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5 gap-4">

      {/* Step 1: No accepted quotation — must confirm first */}
      {!hasAccepted && !hasActivePOs && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E4E9F5] py-12 text-center">
          <ShoppingCart size={32} className="mb-3 text-slate-300" />
          <p className="text-[13px] font-semibold text-slate-500">No confirmed quotation yet</p>
          <p className="mt-1 text-[12px] text-slate-400">
            Go to <span className="font-semibold">Reply to Client</span> tab, send or download the quotation,
            then come back here to generate Purchase Orders once the client confirms.
          </p>
        </div>
      )}

      {/* Step 2: Has accepted/downloaded quotation but not yet "accepted" status — show Confirm button */}
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

      {/* Step 3: Quotation is confirmed — show Generate button */}
      {(isAlreadyConfirmed || isConverted) && !hasActivePOs && !loading && (
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

          {/* Cancelled POs — collapsed at bottom */}
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
          {(isAlreadyConfirmed || isConverted) && hasActivePOs === false && pos.length > 0 && (
            <div className="flex items-center justify-center pt-2">
              <button onClick={handleGenerate} disabled={generating || !acceptedQuotation}
                className="flex items-center gap-1.5 rounded-lg border border-[#4451E8] px-4 py-2 text-[12px] font-semibold text-[#4451E8] hover:bg-[#EEF4FF] transition disabled:opacity-60">
                <ShoppingCart size={13} /> {generating ? "Generating…" : "Re-generate POs"}
              </button>
            </div>
          )}

          {error && !generating && !confirming && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
