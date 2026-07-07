"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award, Ban, CheckCircle2, Download, Eye, ExternalLink,
  FileText, MessageSquare, Pencil, Plus, Receipt, RefreshCw,
  Search, Send, ThumbsDown, ThumbsUp, TrendingUp, X,
} from "lucide-react";
import ManualQuotationForm from "@/app/components/ManualQuotationForm";

/* ── Palette ── */
const ACCENT_PALETTE = {
  blue:   { border: "#BFDBFE", top: "#5BA7FF", glow: "rgba(91,167,255,0.22)",  grad: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" },
  indigo: { border: "#A5B4FC", top: "#6D7CFF", glow: "rgba(109,124,255,0.22)", grad: "linear-gradient(135deg,#6D7CFF,#8C9EFF)" },
  mint:   { border: "#6EE7B7", top: "#7FD8BE", glow: "rgba(127,216,190,0.22)", grad: "linear-gradient(135deg,#7FD8BE,#34D399)" },
  violet: { border: "#C4B5FD", top: "#8C9EFF", glow: "rgba(140,158,255,0.22)", grad: "linear-gradient(135deg,#8C9EFF,#A78BFA)" },
  amber:  { border: "#FDE68A", top: "#F59E0B", glow: "rgba(245,158,11,0.22)",  grad: "linear-gradient(135deg,#F59E0B,#FBBF24)" },
  rose:   { border: "#FECDD3", top: "#FB7185", glow: "rgba(251,113,133,0.22)", grad: "linear-gradient(135deg,#FB7185,#F43F5E)" },
};

const QUOTATION_STATUS_OPTIONS = [
  { value: "",           label: "All Statuses" },
  { value: "draft",      label: "Draft" },
  { value: "sent",       label: "Sent" },
  { value: "downloaded", label: "Downloaded" },
  { value: "revised",    label: "Revised" },
  { value: "accepted",   label: "Accepted" },
  { value: "lost",       label: "Lost" },
  { value: "cancelled",  label: "Cancelled" },
];

const REVISION_FILTER_OPTIONS = [
  { value: "all",      label: "All" },
  { value: "original", label: "Original Quotes" },
  { value: "revised",  label: "Revised Quotes Only" },
];

const QUOTE_STATUS_BADGE = {
  draft:      { bg: "#F3F4F6", text: "#6B7280", label: "Draft" },
  sent:       { bg: "#EFF6FF", text: "#1D6FD8", label: "Sent" },
  downloaded: { bg: "#FFFBEB", text: "#B45309", label: "Downloaded" },
  revised:    { bg: "#F5F3FF", text: "#6D28D9", label: "Revised" },
  accepted:   { bg: "#ECFDF5", text: "#059669", label: "Accepted" },
  lost:       { bg: "#FFF1F2", text: "#BE123C", label: "Lost" },
  cancelled:  { bg: "#FFF1F2", text: "#BE123C", label: "Cancelled" },
};

/* ── Helpers ── */
function fmtQuoteINR(v) {
  return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtQuoteDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Sub-components ── */
function MetricCard({ icon, label, value, accent, delay = "0ms" }) {
  const a = ACCENT_PALETTE[accent] || ACCENT_PALETTE.blue;
  return (
    <div
      className="animate-fade-up flex flex-1 items-center gap-3 rounded-2xl px-4 py-3.5 cursor-default"
      style={{
        animationDelay: delay,
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(12px)",
        boxShadow: `0 0 0 1px ${a.border}, 0 4px 20px ${a.glow}, inset 0 2px 0 ${a.top}`,
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
        e.currentTarget.style.boxShadow = `0 0 0 1px ${a.border}, 0 12px 32px ${a.glow}, inset 0 2px 0 ${a.top}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = `0 0 0 1px ${a.border}, 0 4px 20px ${a.glow}, inset 0 2px 0 ${a.top}`;
      }}
    >
      <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: a.grad, boxShadow: `0 4px 12px ${a.glow}` }}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">{label}</p>
        <p className="mt-1 text-[24px] font-bold text-slate-900 leading-none tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function StatList({ title, rows, primary, showValue = true }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</h3>
      {(!rows || rows.length === 0) ? (
        <p className="text-[11px] text-slate-400">No data yet</p>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-700">{r[primary] || "Unassigned"}</span>
              <span className="shrink-0 font-semibold text-slate-900 whitespace-nowrap">
                {r.count}{showValue && r.value ? ` · ${fmtQuoteINR(r.value)}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteStatusBadge({ status }) {
  const s = QUOTE_STATUS_BADGE[status] || QUOTE_STATUS_BADGE.sent;
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────────────
   Props:
     onOpenInquiry(code)  — called when clicking the ExternalLink icon on a row
     salespersonLock      — when set, pre-filters to this salesperson only and
                            hides the salesperson dropdown + New Quotation button
────────────────────────────────────────────────────────────────────────────── */
export default function QuotationSummaryPanel({ onOpenInquiry, salespersonLock }) {
  const [summary,    setSummary]    = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [search,            setSearch]            = useState("");
  const [statusFilter,      setStatusFilter]      = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState(salespersonLock || "");
  const [dateFrom,          setDateFrom]          = useState("");
  const [dateTo,            setDateTo]            = useState("");
  const [revisionFilter,    setRevisionFilter]    = useState("all");

  const [viewId,      setViewId]      = useState(null);
  const [viewData,    setViewData]    = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [showManualForm, setShowManualForm] = useState(false);
  const [editId,         setEditId]         = useState(null);
  const [refreshKey,     setRefreshKey]     = useState(0);

  const [notes,        setNotes]        = useState([]);
  const [noteText,     setNoteText]     = useState("");
  const [noteSaving,   setNoteSaving]   = useState(false);
  const [remarkMap,    setRemarkMap]    = useState({});
  const [savingRemark, setSavingRemark] = useState(null);

  // When salespersonLock changes (e.g. employee name loads async), sync filter
  useEffect(() => {
    if (salespersonLock) setSalespersonFilter(salespersonLock);
  }, [salespersonLock]);

  useEffect(() => {
    const url = salespersonLock
      ? `/api/quotations/summary?salesperson=${encodeURIComponent(salespersonLock)}`
      : "/api/quotations/summary";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setSummary(d.error ? null : d))
      .catch(() => setSummary(null));
  }, [refreshKey, salespersonLock]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams();
      if (search.trim())            params.set("search", search.trim());
      if (statusFilter)             params.set("status", statusFilter);
      if (salespersonFilter)        params.set("salesperson", salespersonFilter);
      if (dateFrom)                 params.set("date_from", dateFrom);
      if (dateTo)                   params.set("date_to", dateTo);
      if (revisionFilter !== "all") params.set("revision", revisionFilter);
      fetch(`/api/quotations?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          const qs = d.quotations || [];
          setQuotations(qs);
          setRemarkMap((prev) => {
            const next = { ...prev };
            qs.forEach((q) => { if (!(q.id in next)) next[q.id] = q.remark || ""; });
            return next;
          });
        })
        .catch((e) => setError(e.message || "Failed to load quotations"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, salespersonFilter, dateFrom, dateTo, revisionFilter, refreshKey]);

  const saveRemark = async (id, value) => {
    setSavingRemark(id);
    try {
      await fetch(`/api/quotations/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ remark: value || null }),
      });
    } finally {
      setSavingRemark(null);
    }
  };

  const openView = (id) => {
    setViewId(id); setViewLoading(true); setViewData(null); setNotes([]);
    Promise.all([
      fetch(`/api/quotations?id=${id}`).then((r) => r.json()),
      fetch(`/api/quotations/${id}/notes`).then((r) => r.json()),
    ])
      .then(([qData, nData]) => {
        setViewData(qData.quotation || null);
        setNotes(nData.notes || []);
      })
      .catch(() => { setViewData(null); setNotes([]); })
      .finally(() => setViewLoading(false));
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !viewId) return;
    setNoteSaving(true);
    try {
      await fetch(`/api/quotations/${viewId}/notes`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          note_text:       noteText.trim(),
          created_by:      typeof window !== "undefined" ? (localStorage.getItem("userName") || "User") : "User",
          created_by_role: salespersonLock ? "employee" : "admin",
        }),
      });
      const updated = await fetch(`/api/quotations/${viewId}/notes`).then((r) => r.json());
      setNotes(updated.notes || []);
      setNoteText("");
    } catch {}
    setNoteSaving(false);
  };

  const handleSetOutcome = async (uniqueCode, status) => {
    if (!uniqueCode || uniqueCode.startsWith("MANUAL-")) return;
    try {
      const res = await fetch("/api/inquiries/status", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          unique_code: uniqueCode,
          status,
          changed_by: typeof window !== "undefined" ? (Number(localStorage.getItem("userId")) || null) : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setRefreshKey((k) => k + 1);
    } catch (e) { alert(e.message); }
  };

  const handleManualSaved = () => setRefreshKey((k) => k + 1);

  const salespersonOptions = useMemo(
    () => [...new Set(quotations.map((q) => q.salesperson).filter(Boolean))],
    [quotations]
  );

  const hasFilters = search || statusFilter || (!salespersonLock && salespersonFilter) || dateFrom || dateTo || revisionFilter !== "all";
  const clearFilters = () => {
    setSearch(""); setStatusFilter("");
    if (!salespersonLock) setSalespersonFilter("");
    setDateFrom(""); setDateTo(""); setRevisionFilter("all");
  };

  const s = summary || {};

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <section className="flex flex-wrap gap-3">
        <MetricCard icon={<FileText size={15} />}    label="Total Quotations"     value={summary ? s.total : "—"}                      accent="blue"   delay="0ms" />
        <MetricCard icon={<Pencil size={15} />}      label="Draft"                value={summary ? s.draft : "—"}                      accent="indigo" delay="40ms" />
        <MetricCard icon={<CheckCircle2 size={15}/>} label="Sent / Downloaded"    value={summary ? s.sent : "—"}                       accent="mint"   delay="80ms" />
        <MetricCard icon={<RefreshCw size={15} />}   label="Revised"              value={summary ? s.revised : "—"}                    accent="violet" delay="120ms" />
        <MetricCard icon={<Award size={15} />}       label="Converted / Accepted" value={summary ? s.converted : "—"}                  accent="mint"   delay="160ms" />
        <MetricCard icon={<Ban size={15} />}         label="Lost / Cancelled"     value={summary ? s.lost : "—"}                       accent="rose"   delay="200ms" />
        <MetricCard icon={<Receipt size={15} />}     label="Total Quoted Value"   value={summary ? fmtQuoteINR(s.total_value) : "—"}   accent="amber"  delay="240ms" />
        <MetricCard icon={<TrendingUp size={15} />}  label="This Month Value"     value={summary ? fmtQuoteINR(s.monthly_value) : "—"} accent="blue"   delay="280ms" />
      </section>

      {/* Stats */}
      {summary && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {!salespersonLock && <StatList title="By Salesperson"      rows={s.by_salesperson} primary="salesperson" />}
          <StatList title="Most Quoted Clients" rows={s.by_client}      primary="client_name" />
          <StatList title="Most Quoted Brands"  rows={s.by_brand}       primary="brand" showValue={false} />
          <StatList title="By Month"            rows={s.by_month}       primary="month" />
        </section>
      )}

      {/* Table */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4EDFF] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" }}>
              <FileText size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-[13px] font-bold text-slate-800">Quotation Summary</h2>
              <p className="text-[10px] text-slate-400">
                {salespersonLock ? `Your quotations — ${salespersonLock}` : "All quotations sent by the system, including revisions"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1D6FD8]">{quotations.length} shown</span>
            {!salespersonLock && (
              <button
                onClick={() => { setEditId(null); setShowManualForm(true); }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
              >
                <Plus size={12} />New Quotation
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E4EDFF] px-4 py-2.5">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-3 transition focus-within:border-[#5BA7FF] focus-within:bg-white">
            <Search size={12} className="shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation, client, FIAPL code…"
              className="w-48 flex-1 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]">
            {QUOTATION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!salespersonLock && (
            <select value={salespersonFilter} onChange={(e) => setSalespersonFilter(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]">
              <option value="">All Salespersons</option>
              {salespersonOptions.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
            </select>
          )}
          <select value={revisionFilter} onChange={(e) => setRevisionFilter(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]">
            {REVISION_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
          <span className="text-[11px] text-slate-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
          {hasFilters && (
            <button onClick={clearFilters} className="text-[11px] font-semibold text-[#4451E8] hover:underline">Clear filters</button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]" style={{ minWidth: 1100 }}>
            <thead>
              <tr style={{ background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}>
                {["Quotation No", "FIAPL Code", "Client", "Salesperson", "Date", "Amend Code", "Amend Date", "Status", "Taxable", "Tax", "Grand Total", "Remarks", "Actions"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 13 }, (_, c) => (
                    <td key={c} className="border-b border-r border-[#DCE6F7] px-3 py-2.5 last:border-r-0">
                      <div className="skeleton h-3" style={{ width: "60%" }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && error && (
                <tr><td colSpan={13} className="px-4 py-8 text-[12px] text-rose-600">{error}</td></tr>
              )}
              {!loading && !error && quotations.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-14 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}>
                      <FileText size={20} className="text-[#1D6FD8]" />
                    </div>
                    <p className="text-[13px] font-semibold text-slate-700">No quotations found</p>
                    <p className="mt-1 text-[11px] text-slate-400">Quotations sent to clients will show up here.</p>
                  </td>
                </tr>
              )}
              {!loading && !error && quotations.map((q, i) => {
                const isManual    = String(q.inquiry_unique_code || "").startsWith("MANUAL-");
                const quotedLines = (q.lines || []).length;
                const totalItems  = Number(q.inquiry_item_count || 0);
                const partial     = !isManual && totalItems > 0 && quotedLines < totalItems;
                return (
                  <tr
                    key={q.id}
                    className="border-b border-[#EEF2F6] transition"
                    style={{ background: i % 2 === 0 ? "white" : "#FAFBFF" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F0F6FF")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#FAFBFF")}
                  >
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 font-mono text-[10px] font-semibold text-slate-700">{q.quotation_number || "—"}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">
                      <p className="font-mono text-[10px] font-semibold text-[#4451E8]">{q.inquiry_unique_code}</p>
                      {!isManual && totalItems > 0 && (
                        <p className={`mt-0.5 text-[9px] font-medium ${partial ? "text-amber-600" : "text-emerald-600"}`}>
                          {quotedLines}/{totalItems} items{partial ? " (partial)" : ""}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[140px] truncate border-r border-[#DCE6F7] px-3 py-2" title={q.client_name}>{q.client_name || "—"}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.salesperson || "—"}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{fmtQuoteDate(q.quoted_at)}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.amendment_code || "—"}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.amendment_date ? fmtQuoteDate(q.amendment_date) : "—"}</td>
                    <td className="border-r border-[#DCE6F7] px-3 py-2"><QuoteStatusBadge status={q.display_status} /></td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right">{fmtQuoteINR(q.taxable_amount)}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right">{fmtQuoteINR(q.tax_amount)}</td>
                    <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right font-semibold">{fmtQuoteINR(q.grand_total)}</td>
                    <td className="border-r border-[#DCE6F7] px-2 py-1.5" style={{ minWidth: "160px", maxWidth: "220px" }}>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={remarkMap[q.id] ?? ""}
                          onChange={(e) => setRemarkMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          onBlur={() => saveRemark(q.id, remarkMap[q.id] ?? "")}
                          placeholder="Add remark…"
                          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-slate-700 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:bg-white focus:ring-1 focus:ring-[#5BA7FF]/20 placeholder:text-slate-300"
                        />
                        {savingRemark === q.id && (
                          <RefreshCw size={9} className="absolute right-1.5 shrink-0 animate-spin text-slate-300" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(q.id)} title="View / Notes" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                          <Eye size={13} />
                        </button>
                        <a href={`/api/quotations/pdf?id=${q.id}`} target="_blank" rel="noreferrer" title="Download PDF" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                          <Download size={13} />
                        </a>
                        {q.display_status === "draft" ? (
                          <button onClick={() => { setEditId(q.id); setShowManualForm(true); }} title="Edit Draft" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                            <Pencil size={13} />
                          </button>
                        ) : (
                          <button onClick={() => onOpenInquiry?.(q.inquiry_unique_code)} title="Open Inquiry" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                            <ExternalLink size={13} />
                          </button>
                        )}
                        {/* Converted / Lost outcome buttons — system quotations only */}
                        {!isManual && q.display_status !== "accepted" && q.display_status !== "lost" && (
                          <>
                            <button
                              onClick={() => handleSetOutcome(q.inquiry_unique_code, "converted")}
                              title="Mark as Converted"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#ECFDF5] hover:text-[#047857]"
                            >
                              <ThumbsUp size={13} />
                            </button>
                            <button
                              onClick={() => handleSetOutcome(q.inquiry_unique_code, "lost")}
                              title="Mark as Lost"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                            >
                              <ThumbsDown size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* View modal */}
      {viewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
            onClick={() => { setViewId(null); setViewData(null); setNotes([]); setNoteText(""); }}
          />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white card-shadow-lg animate-modal">
            <div className="flex shrink-0 items-center justify-between border-b border-[#EEF2F6] px-6 py-4">
              <div>
                {viewLoading
                  ? <p className="text-[12px] text-slate-400">Loading…</p>
                  : viewData
                    ? <>
                        <h3 className="text-[14px] font-bold text-slate-900">{viewData.quotation_number}</h3>
                        <p className="text-[11px] text-slate-400">
                          {viewData.inquiry_unique_code} · {fmtQuoteDate(viewData.quoted_at)}
                          {viewData.source === "manual" && (
                            <span className="ml-2 rounded-full bg-[#F5F3FF] px-1.5 py-0.5 text-[9px] font-bold text-[#6D28D9]">Manual</span>
                          )}
                        </p>
                      </>
                    : <p className="text-[12px] text-rose-500">Quotation not found</p>
                }
              </div>
              <button
                onClick={() => { setViewId(null); setViewData(null); setNotes([]); setNoteText(""); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </div>

            {!viewLoading && viewData && (
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-slate-400">Client:</span> {viewData.client_name || "—"}</div>
                  <div><span className="text-slate-400">Salesperson:</span> {viewData.salesperson || "—"}</div>
                  {viewData.client_phone && <div><span className="text-slate-400">Phone:</span> {viewData.client_phone}</div>}
                  {viewData.billing_address && <div className="col-span-2"><span className="text-slate-400">Address:</span> {viewData.billing_address}</div>}
                  <div><span className="text-slate-400">Amendment Code:</span> {viewData.amendment_code || "—"}</div>
                  <div><span className="text-slate-400">Amendment Date:</span> {viewData.amendment_date ? fmtQuoteDate(viewData.amendment_date) : "—"}</div>
                  <div><span className="text-slate-400">Taxable Amount:</span> {fmtQuoteINR(viewData.taxable_amount)}</div>
                  <div><span className="text-slate-400">Tax Amount:</span> {fmtQuoteINR(viewData.tax_amount)}</div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Grand Total:</span>{" "}
                    <span className="font-bold text-slate-900">{fmtQuoteINR(viewData.grand_total)}</span>
                  </div>
                </div>

                {/* Item breakdown — quoted vs not quoted */}
                {(() => {
                  const isManual = String(viewData.inquiry_unique_code || "").startsWith("MANUAL-");
                  const inquiryItems = Array.isArray(viewData.inquiry_items_json) ? viewData.inquiry_items_json : [];
                  const quotedLines  = viewData.lines || [];

                  // Normalize part number for matching (lowercase, strip separators)
                  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_./]+/g, "");
                  const quotedMap = {};
                  for (const l of quotedLines) {
                    const key = norm(l.part_number);
                    if (key) quotedMap[key] = l;
                  }

                  // If no inquiry items (manual quotation), just show lines as-is
                  if (isManual || inquiryItems.length === 0) {
                    return (
                      <div className="rounded-xl border border-[#EEF2F6] p-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Line Items Quoted</p>
                        <div className="space-y-1.5">
                          {quotedLines.map((l, idx) => (
                            <div key={idx} className="flex items-start justify-between gap-4 text-[11px]">
                              <span className="text-slate-700">
                                {l.part_number || "—"}{l.brand ? ` (${l.brand})` : ""}
                                {l.description ? <span className="ml-1 text-slate-400">— {l.description}</span> : null}
                              </span>
                              <span className="shrink-0 text-slate-500">
                                {l.quantity} {l.uom || ""} × {viewData.currency || "INR"} {Number(l.selling_price || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  const quotedCount = inquiryItems.filter((it) => quotedMap[norm(it.part_number)]).length;
                  return (
                    <div className="rounded-xl border border-[#EEF2F6] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Items Breakdown</p>
                        <span className={`text-[10px] font-semibold ${quotedCount < inquiryItems.length ? "text-amber-600" : "text-emerald-600"}`}>
                          {quotedCount}/{inquiryItems.length} items quoted
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {inquiryItems.map((it, idx) => {
                          const match = quotedMap[norm(it.part_number)];
                          return (
                            <div key={idx} className={`flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-[11px] ${match ? "bg-[#F0FDF4]" : "bg-[#FFF7F7]"}`}>
                              <div className="flex items-start gap-2 min-w-0">
                                <span className={`mt-0.5 shrink-0 text-[12px] ${match ? "text-emerald-600" : "text-rose-400"}`}>
                                  {match ? "✓" : "✗"}
                                </span>
                                <div className="min-w-0">
                                  <p className={`font-semibold truncate ${match ? "text-slate-800" : "text-slate-400"}`}>
                                    {it.part_number || "—"}{it.brand ? ` (${it.brand})` : ""}
                                  </p>
                                  {it.item_notes && <p className="text-[10px] text-slate-400 truncate">{it.item_notes}</p>}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-slate-500">{it.quantity} {it.uom || ""}</p>
                                {match && (
                                  <p className="text-[10px] font-semibold text-emerald-700">
                                    {viewData.currency || "INR"} {Number(match.selling_price || 0).toLocaleString("en-IN")}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <a
                  href={`/api/quotations/pdf?id=${viewData.id}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-3 py-2 text-[11px] font-semibold text-[#4451E8] transition hover:bg-[#EEF0FF]"
                >
                  <Download size={12} />Download PDF
                </a>

                {/* Log Notes */}
                <div className="border-t border-[#EEF2F6] pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquare size={13} className="text-slate-400" />
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Internal Notes</p>
                    {notes.length > 0 && (
                      <span className="rounded-full bg-[#EEF4FF] px-1.5 py-0.5 text-[9px] font-bold text-[#4451E8]">{notes.length}</span>
                    )}
                  </div>
                  {notes.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {notes.map((n) => (
                        <div key={n.id} className="rounded-xl border border-[#E4EDFF] bg-[#FAFBFF] p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-700">{n.created_by || "User"}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(n.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-[11px] text-slate-700">{n.note_text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Log an internal note…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-[#E4E8EE] bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#5BA7FF] placeholder:text-slate-400"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || noteSaving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" }}
                    >
                      <Send size={11} />
                      {noteSaving ? "Saving…" : "Log Note"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual quotation form (admin only) */}
      {showManualForm && (
        <ManualQuotationForm
          editId={editId}
          onClose={() => { setShowManualForm(false); setEditId(null); }}
          onSaved={handleManualSaved}
        />
      )}
    </div>
  );
}
