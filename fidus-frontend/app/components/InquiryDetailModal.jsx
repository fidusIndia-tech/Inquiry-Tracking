"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, CheckCircle2, ClipboardCopy, FileText, Globe,
  History, Mail, MapPin, Phone, RefreshCw, Send, Store, Tag, X,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Shared helpers
───────────────────────────────────────────── */
const STATUS_CLASSES = {
  new:         "text-[#1D6FD8] border-[#BFDBFE] bg-[#EFF6FF]",
  assigned:    "text-[#4451E8] border-[#A5B4FC] bg-[#EEF0FF]",
  in_progress: "text-[#059669] border-[#6EE7B7] bg-[#EFFAF6]",
  quoted:      "text-[#6D28D9] border-[#C4B5FD] bg-[#F5F3FF]",
  converted:   "text-[#047857] border-[#6EE7B7] bg-[#ECFDF5]",
  lost:        "text-[#BE123C] border-[#FECDD3] bg-[#FFF1F2]",
  dropped:     "text-[#64748B] border-[#E2E8F0] bg-[#F8FAFC]",
};

function formatStatus(s) {
  if (!s) return "New";
  return s.split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, ${dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-[12px] font-medium text-slate-800 break-all">{value || "—"}</p>
    </div>
  );
}

function SectionHeader({ icon, label, count, accent = "blue" }) {
  const colors = {
    blue:  { bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", text: "text-[#1D6FD8]", dot: "bg-[#3B82F6]" },
    amber: { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", text: "text-[#B45309]", dot: "bg-[#F59E0B]" },
  };
  const c = colors[accent] || colors.blue;
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${c.bg} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      <span className={`text-[11px] font-bold uppercase tracking-widest ${c.text}`}>{label}</span>
      {count !== undefined && (
        <span className={`ml-auto text-[11px] font-semibold ${c.text}`}>{count} vendor{count !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Details Tab
───────────────────────────────────────────── */
function DetailsTab({ inquiry }) {
  const items = inquiry.items?.length ? inquiry.items : [];
  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <InfoField label="Client Name"   value={inquiry.client_name} />
        <InfoField label="Location"      value={inquiry.location} />
        <InfoField label="Sender"        value={inquiry.sender_name} />
        <InfoField label="Email"         value={inquiry.sender_email} />
        <InfoField label="Received"      value={formatDate(inquiry.email_date)} />
        <InfoField label="Assigned To"   value={inquiry.assigned_to_name} />
        <InfoField label="Assigned At"   value={formatDate(inquiry.assigned_at)} />
        {inquiry.in_progress_at && <InfoField label="In Progress Since" value={formatDate(inquiry.in_progress_at)} />}
        {inquiry.quoted_at       && <InfoField label="Quoted Since"       value={formatDate(inquiry.quoted_at)} />}
      </div>

      {inquiry.subject && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Subject</p>
          <p className="rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 break-words">
            {inquiry.subject}
          </p>
        </div>
      )}

      {inquiry.notes && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
          <p className="rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 break-words">
            {inquiry.notes}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Line Items ({items.length})
          </p>
          <div className="overflow-hidden rounded-xl border border-[#E4E8EE]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr style={{ background: "linear-gradient(90deg,#EEF4FF,#E6EDFC)" }}>
                  {["Brand", "Part Number", "Qty", "UOM", "Notes"].map((h) => (
                    <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left font-bold text-[#4461A8]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-[#EEF2F6] last:border-b-0"
                      style={{ background: idx % 2 === 0 ? "white" : "#F8FAFC" }}>
                    <td className="px-3 py-2 text-slate-600">{item.brand      || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{item.partNumber || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{item.quantity   || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{item.uom        || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{item.itemNotes  || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Vendors Tab
───────────────────────────────────────────── */
function VendorsTab({ inquiry, onDraftsGenerated }) {
  const [discovered,    setDiscovered]    = useState([]);
  const [legacy,        setLegacy]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [selDisc,       setSelDisc]       = useState(new Set()); // vendor IDs
  const [selLeg,        setSelLeg]        = useState(new Set()); // parts_table IDs
  const [generating,    setGenerating]    = useState(false);
  const [genError,      setGenError]      = useState("");

  const brands = [...new Set((inquiry.items || []).map((i) => i.brand).filter(Boolean))];

  useEffect(() => {
    setLoading(true); setError("");
    const brandsQ = brands.length ? `&brands=${encodeURIComponent(brands.join(","))}` : "";
    fetch(`/api/vendors?unique_code=${encodeURIComponent(inquiry.unique_code)}${brandsQ}`)
      .then((r) => r.json())
      .then((d) => { setDiscovered(d.discovered || []); setLegacy(d.legacy || []); })
      .catch(() => setError("Failed to load vendors"))
      .finally(() => setLoading(false));
  }, [inquiry.unique_code]);

  const toggleDisc = (id) =>
    setSelDisc((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLeg = (id) =>
    setSelLeg((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAllDisc = () =>
    setSelDisc(selDisc.size === discovered.length ? new Set() : new Set(discovered.map((v) => v.id)));
  const toggleAllLeg = () =>
    setSelLeg(selLeg.size === legacy.length ? new Set() : new Set(legacy.map((v) => v.id)));

  const totalSelected = selDisc.size + selLeg.size;

  const generateDrafts = async () => {
    setGenerating(true); setGenError("");
    try {
      const vendors = [
        ...discovered.filter((v) => selDisc.has(v.id)).map((v) => ({
          source: "discovered",
          name:   v.name,
          email:  v.email,
          brand:  v.brand,
        })),
        ...legacy.filter((v) => selLeg.has(v.id)).map((v) => ({
          source: "legacy",
          name:   v.name,
          email:  v.email,
          brand:  v.brand,
        })),
      ];

      const inquiryItems = (inquiry.items || []).map((i) => ({
        brand:      i.brand,
        partNumber: i.partNumber,
        quantity:   i.quantity,
        uom:        i.uom,
        itemNotes:  i.itemNotes,
      }));

      const res  = await fetch("/api/drafts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          unique_code:   inquiry.unique_code,
          client_name:   inquiry.client_name,
          vendors,
          inquiry_items: inquiryItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate drafts");
      onDraftsGenerated(data.drafts || []);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <RefreshCw size={20} className="animate-spin text-[#4451E8]" />
        <p className="text-[12px] text-slate-400">Loading vendors…</p>
      </div>
    );
  }

  if (error) {
    return <p className="p-6 text-center text-[12px] text-rose-500">{error}</p>;
  }

  const noData = discovered.length === 0 && legacy.length === 0;

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      {/* Scrollable vendor lists */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Discovered vendors ── */}
        <div className="space-y-2">
          <SectionHeader icon={Store} label="Discovered Vendors" count={discovered.length} accent="blue" />
          {discovered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D0DCF4] bg-[#FAFBFF] px-4 py-8 text-center">
              <Store size={18} className="mx-auto mb-2 text-slate-300" />
              <p className="text-[12px] font-medium text-slate-500">No vendors discovered yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Vendor discovery runs automatically after inquiry creation. Check back in a few minutes.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E4E8EE]">
              <table className="w-full border-collapse text-[11px]" style={{ minWidth: 640 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(90deg,#EEF4FF,#E6EDFC)" }}>
                    <th className="w-8 border-b border-[#D0DCF4] px-3 py-2">
                      <input type="checkbox" checked={selDisc.size === discovered.length && discovered.length > 0}
                        onChange={toggleAllDisc} className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer" />
                    </th>
                    {["Vendor / Domain", "Brand", "Email", "Phone", "Location", "Auth", ""].map((h) => (
                      <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {discovered.map((v) => (
                    <tr key={`d-${v.id}-${v.brand}`}
                        className="border-b border-[#EEF2F6] last:border-b-0 transition"
                        style={{ background: selDisc.has(v.id) ? "#EEF6FF" : "white" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selDisc.has(v.id)} onChange={() => toggleDisc(v.id)}
                          className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer" />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-900 leading-tight">{v.name || "—"}</p>
                        {v.domain && <p className="text-[10px] text-slate-400">{v.domain}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1D6FD8]">
                          {v.brand || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {v.email
                          ? <a href={`mailto:${v.email}`} className="flex items-center gap-1 text-[#4451E8] hover:underline"><Mail size={9} />{v.email}</a>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {v.phone
                          ? <span className="flex items-center gap-1 text-slate-600"><Phone size={9} className="text-slate-400" />{v.phone}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {(v.city || v.country)
                          ? <span className="flex items-center gap-1 text-slate-500"><MapPin size={9} className="text-slate-400" />{[v.city, v.country].filter(Boolean).join(", ")}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {v.is_authorized_dealer
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-[#6EE7B7] bg-[#EFFAF6] px-2 py-0.5 text-[10px] font-semibold text-[#059669]"><CheckCircle2 size={9} />Auth</span>
                          : <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {v.website && (
                          <a href={v.website} target="_blank" rel="noopener noreferrer"
                             className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#4451E8] transition">
                            <Globe size={9} />Visit
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Company history vendors ── */}
        <div className="space-y-2">
          <SectionHeader icon={History} label="Company History" count={legacy.length} accent="amber" />
          {legacy.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#FDE68A] bg-[#FFFDF5] px-4 py-8 text-center">
              <History size={18} className="mx-auto mb-2 text-amber-300" />
              <p className="text-[12px] font-medium text-slate-500">No historical data for this brand</p>
              <p className="text-[11px] text-slate-400 mt-1">Past vendor quotes for {brands.join(", ") || "this brand"} will appear here.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#FDE68A]">
              <table className="w-full border-collapse text-[11px]" style={{ minWidth: 640 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(90deg,#FFFBEB,#FEF3C7)" }}>
                    <th className="w-8 border-b border-[#FDE68A] px-3 py-2">
                      <input type="checkbox" checked={selLeg.size === legacy.length && legacy.length > 0}
                        onChange={toggleAllLeg} className="h-3.5 w-3.5 accent-[#F59E0B] cursor-pointer" />
                    </th>
                    {["Supplier", "Brand", "Email", "Last Price", "Delivery", ""].map((h) => (
                      <th key={h} className="border-b border-[#FDE68A] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#B45309]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {legacy.map((v) => {
                    const price = v.price
                      ? `${v.currency === "INR" ? "₹" : v.currency === "EUR" ? "€" : v.currency === "USD" ? "$" : (v.currency || "")} ${Number(v.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                      : "—";
                    return (
                      <tr key={`l-${v.id}`}
                          className="border-b border-[#FEF3C7] last:border-b-0 transition"
                          style={{ background: selLeg.has(v.id) ? "#FFFBEB" : "white" }}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={selLeg.has(v.id)} onChange={() => toggleLeg(v.id)}
                            className="h-3.5 w-3.5 accent-[#F59E0B] cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900 leading-tight">{v.name || "—"}</p>
                          <p className="text-[10px] text-slate-400">{v.part_no || ""}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold text-[#B45309]">
                            {v.brand || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {v.email
                            ? <a href={`mailto:${v.email}`} className="flex items-center gap-1 text-[#B45309] hover:underline"><Mail size={9} />{v.email}</a>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-slate-800">{price}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {v.delivery_time || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[9px] font-semibold text-[#B45309]">
                            <History size={8} />History
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {noData && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Store size={24} className="text-slate-300" />
            <p className="text-[13px] font-medium text-slate-500">No vendor data available yet</p>
            <p className="text-[11px] text-slate-400">Vendor discovery is running in the background.</p>
          </div>
        )}
      </div>

      {/* ── Sticky bottom action bar ── */}
      <div className="shrink-0 border-t border-[#EEF2F6] bg-white px-5 py-3 flex items-center justify-between gap-3">
        <div>
          {totalSelected > 0 ? (
            <p className="text-[12px] font-semibold text-slate-700">
              {totalSelected} vendor{totalSelected !== 1 ? "s" : ""} selected
              <span className="ml-1.5 font-normal text-slate-400">
                ({selDisc.size} discovered · {selLeg.size} from history)
              </span>
            </p>
          ) : (
            <p className="text-[12px] text-slate-400">Select vendors to generate RFQ drafts</p>
          )}
          {genError && <p className="text-[11px] text-rose-500 mt-0.5">{genError}</p>}
        </div>
        <button
          onClick={generateDrafts}
          disabled={totalSelected === 0 || generating}
          className="flex h-9 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
        >
          {generating
            ? <><RefreshCw size={13} className="animate-spin" />Generating…</>
            : <><FileText size={13} />Generate RFQ Drafts</>}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Drafts Tab
───────────────────────────────────────────── */
function DraftCard({ draft, onChange }) {
  const [subject,  setSubject]  = useState(draft.subject || "");
  const [body,     setBody]     = useState(draft.body    || "");
  const [saving,   setSaving]   = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [status,   setStatus]   = useState(draft.status  || "draft");
  const [sending,  setSending]  = useState(false);
  const [sendError, setSendError] = useState("");
  const [editingHtml, setEditingHtml] = useState(false);
  const debounceRef = useRef(null);

  const isSent = status === "sent" || status === "replied";

  const handleSend = async () => {
    setSending(true); setSendError("");
    try {
      const res  = await fetch("/api/drafts/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft_id: draft.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setStatus("sent");
      onChange(data.draft);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  const persist = useCallback(
    (newSubject, newBody, newStatus) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await fetch("/api/drafts", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id: draft.id, subject: newSubject, body: newBody, status: newStatus }),
          });
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [draft.id]
  );

  const handleSubjectChange = (v) => { setSubject(v); persist(v, body, status); };
  const handleBodyChange    = (v) => { setBody(v);    persist(subject, v, status); };
  const handleApprove = () => {
    const ns = status === "approved" ? "draft" : "approved";
    setStatus(ns);
    persist(subject, body, ns);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sourceColor = draft.source === "legacy"
    ? "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"
    : "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D6FD8]";

  return (
    <div
      className="overflow-hidden rounded-2xl border transition"
      style={{
        borderColor: status === "approved" ? "#6EE7B7" : "#E4E8EE",
        background: status === "approved" ? "#F0FDF8" : "white",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 border-b border-[#EEF2F6] px-4 py-3"
           style={{ background: status === "approved" ? "#ECFDF5" : "#FAFBFF" }}>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 truncate">{draft.vendor_name || "Vendor"}</p>
          <p className="text-[11px] text-slate-400">{draft.vendor_email || "—"}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sourceColor}`}>
          {draft.source === "legacy" ? "History" : "Discovered"}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold
          ${status === "replied" ? "border-[#6EE7B7] bg-[#ECFDF5] text-[#059669]"
            : status === "sent" ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D6FD8]"
            : status === "approved" ? "border-[#6EE7B7] bg-[#ECFDF5] text-[#059669]"
            : "border-[#E4E8EE] bg-white text-slate-500"}`}>
          {status === "replied" ? <><Check size={9} />Replied</>
            : status === "sent" ? <><Send size={9} />Sent</>
            : status === "approved" ? <><Check size={9} />Approved</> : "Draft"}
        </span>
        {saving && <RefreshCw size={12} className="animate-spin text-slate-300" />}
      </div>

      {/* Subject */}
      <div className="border-b border-[#EEF2F6] px-4 py-2">
        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Subject</label>
        <input
          value={subject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          disabled={isSent}
          className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium text-slate-800 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:bg-white focus:ring-2 focus:ring-[#5BA7FF]/10 disabled:text-slate-500"
        />
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Email Body</label>
          {!isSent && (
            <button
              onClick={() => setEditingHtml((v) => !v)}
              className="text-[10px] font-semibold text-[#4451E8] hover:underline"
            >
              {editingHtml ? "Preview" : "Edit HTML"}
            </button>
          )}
        </div>
        {editingHtml ? (
          <textarea
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            rows={14}
            disabled={isSent}
            className="w-full resize-none rounded-xl border border-[#E4E8EE] bg-[#FAFBFF] px-3 py-2.5 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:bg-white focus:ring-2 focus:ring-[#5BA7FF]/10 font-mono disabled:text-slate-400"
          />
        ) : (
          // This renders exactly what the vendor will see in their inbox — the
          // body is our own server-generated HTML (escaped at build time in
          // buildDraft()), not arbitrary external input, so rendering it
          // directly here is safe.
          <div
            className="overflow-x-auto rounded-xl border border-[#E4E8EE] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-700"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-[#EEF2F6] px-4 py-3">
        <button
          onClick={copyToClipboard}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[11px] font-medium text-slate-600 transition hover:bg-[#F3F5F7]"
        >
          {copied ? <><Check size={11} className="text-emerald-500" />Copied</> : <><ClipboardCopy size={11} />Copy</>}
        </button>
        {!isSent && (
          <button
            onClick={handleApprove}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition
              ${status === "approved"
                ? "border-[#6EE7B7] bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
                : "border-[#E4E8EE] bg-white text-slate-600 hover:bg-[#F3F5F7]"}`}
          >
            <CheckCircle2 size={11} />
            {status === "approved" ? "Approved" : "Approve"}
          </button>
        )}
        {!isSent ? (
          <button
            onClick={handleSend}
            disabled={sending || !draft.vendor_email}
            title={!draft.vendor_email ? "This vendor has no email on file" : ""}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" }}
          >
            {sending ? <><RefreshCw size={11} className="animate-spin" />Sending…</> : <><Send size={11} />Send to Vendor</>}
          </button>
        ) : (
          <span className="flex h-8 items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[11px] font-semibold text-[#1D6FD8]">
            <CheckCircle2 size={11} />Sent{draft.sent_at ? ` · ${new Date(draft.sent_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
          </span>
        )}
        <p className="ml-auto text-[10px] text-slate-300">
          {draft.source === "legacy" ? "From company history" : "From web discovery"} · Auto-saves
        </p>
      </div>
      {sendError && (
        <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[11px] font-medium text-rose-600">{sendError}</p>
      )}
    </div>
  );
}

function DraftsTab({ inquiry, initialDrafts }) {
  const [drafts,  setDrafts]  = useState(initialDrafts);
  const [loading, setLoading] = useState(initialDrafts === null);

  useEffect(() => {
    if (initialDrafts !== null) { setDrafts(initialDrafts); return; }
    setLoading(true);
    fetch(`/api/drafts?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => setDrafts(d.drafts || []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [inquiry.unique_code, initialDrafts]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <RefreshCw size={20} className="animate-spin text-[#4451E8]" />
        <p className="text-[12px] text-slate-400">Loading drafts…</p>
      </div>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
             style={{ background: "linear-gradient(135deg,#EEF0FF,#C7D2FE)" }}>
          <Mail size={20} className="text-[#4451E8]" />
        </div>
        <p className="text-[13px] font-semibold text-slate-700">No drafts yet</p>
        <p className="text-[11px] text-slate-400 text-center max-w-xs">
          Go to the Vendors tab, select the vendors you want to contact, then click "Generate RFQ Drafts".
        </p>
      </div>
    );
  }

  const approved = drafts.filter((d) => d.status === "approved").length;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          <span className="font-semibold text-slate-800">{drafts.length}</span> draft{drafts.length !== 1 ? "s" : ""}
          {approved > 0 && <> · <span className="text-[#059669] font-semibold">{approved} approved</span></>}
        </p>
        <p className="text-[10px] text-slate-400">Edits save automatically</p>
      </div>
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} onChange={(updated) =>
          setDrafts((prev) => prev.map((d) => d.id === updated.id ? updated : d))
        } />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Reply to Client Tab — vendor quotes received, pick the best
   per part, add margin, send the final quotation.
───────────────────────────────────────────── */
const QUOTE_CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function formatQuotePrice(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  const symbol = QUOTE_CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : "");
  return `${symbol}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function QuotesTab({ inquiry }) {
  const [quotes,        setQuotes]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState({}); // part_number -> quote id
  const [sellingPrices, setSellingPrices] = useState({}); // part_number -> string
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState("");
  const [sentOk,        setSentOk]        = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/quotes?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes || []))
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
  }, [inquiry.unique_code]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <RefreshCw size={20} className="animate-spin text-[#4451E8]" />
        <p className="text-[12px] text-slate-400">Loading vendor quotes…</p>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
             style={{ background: "linear-gradient(135deg,#EFFAF6,#A7F3D0)" }}>
          <Tag size={20} className="text-[#059669]" />
        </div>
        <p className="text-[13px] font-semibold text-slate-700">No vendor quotes received yet</p>
        <p className="text-[11px] text-slate-400 text-center max-w-xs">
          Once a vendor replies with pricing to a sent RFQ draft, their quote will appear here automatically.
        </p>
      </div>
    );
  }

  const byPart = {};
  for (const q of quotes) {
    const key = q.part_number || "—";
    (byPart[key] = byPart[key] || []).push(q);
  }
  const partNumbers = Object.keys(byPart);

  const itemQty = (partNumber) => {
    const item = (inquiry.items || []).find((i) => (i.partNumber || "") === partNumber);
    return item?.quantity ?? null;
  };

  const readyLines = partNumbers
    .filter((pn) => selected[pn] && sellingPrices[pn])
    .map((pn) => {
      const q = byPart[pn].find((x) => String(x.id) === String(selected[pn]));
      return {
        part_number: pn,
        quantity: itemQty(pn),
        currency: q?.currency || null,
        selling_price: sellingPrices[pn],
      };
    });

  const sendQuote = async () => {
    setSending(true); setSendError("");
    try {
      const res = await fetch("/api/quotes/send-to-client", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: inquiry.unique_code, lines: readyLines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send quote");
      setSentOk(true);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {partNumbers.map((pn) => {
          const rows = byPart[pn];
          const qty = itemQty(pn);
          return (
            <div key={pn} className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#1D6FD8]">{pn}</span>
                {qty !== null && <span className="ml-auto text-[11px] text-slate-500">Qty: {qty}</span>}
              </div>
              <div className="overflow-hidden rounded-xl border border-[#E4E8EE]">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr style={{ background: "linear-gradient(90deg,#EEF4FF,#E6EDFC)" }}>
                      <th className="w-8 border-b border-[#D0DCF4] px-3 py-2" />
                      {["Vendor", "Unit Price", "Lead Time", "Availability"].map((h) => (
                        <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((q) => (
                      <tr key={q.id} style={{ background: String(selected[pn]) === String(q.id) ? "#EEF6FF" : "white" }}
                          className="border-b border-[#EEF2F6] last:border-b-0">
                        <td className="px-3 py-2.5">
                          <input
                            type="radio"
                            name={`quote-${pn}`}
                            checked={String(selected[pn]) === String(q.id)}
                            onChange={() => setSelected((prev) => ({ ...prev, [pn]: q.id }))}
                            className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900">{q.vendor_name || "—"}</p>
                          <p className="text-[10px] text-slate-400">{q.vendor_email || ""}</p>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{formatQuotePrice(q.unit_price, q.currency)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{q.lead_time || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{q.availability || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected[pn] && (
                <div className="flex items-center gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFDF5] px-3 py-2">
                  <Tag size={12} className="text-[#B45309]" />
                  <label className="text-[11px] font-semibold text-[#B45309]">Your Selling Price</label>
                  <input
                    type="number"
                    value={sellingPrices[pn] || ""}
                    onChange={(e) => setSellingPrices((prev) => ({ ...prev, [pn]: e.target.value }))}
                    placeholder="0.00"
                    className="w-32 rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom action bar */}
      <div className="shrink-0 border-t border-[#EEF2F6] bg-white px-5 py-3 flex items-center justify-between gap-3">
        <div>
          {sentOk ? (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#059669]">
              <CheckCircle2 size={13} />Quotation sent to client
            </p>
          ) : (
            <p className="text-[12px] text-slate-400">
              {readyLines.length > 0
                ? `${readyLines.length} of ${partNumbers.length} part${partNumbers.length !== 1 ? "s" : ""} priced`
                : "Select a vendor quote and enter your selling price for each part"}
            </p>
          )}
          {sendError && <p className="text-[11px] text-rose-500 mt-0.5">{sendError}</p>}
        </div>
        {!sentOk && (
          <button
            onClick={sendQuote}
            disabled={readyLines.length === 0 || sending}
            className="flex h-9 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            {sending ? <><RefreshCw size={13} className="animate-spin" />Sending…</> : <><Send size={13} />Send Quote to Client</>}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main modal
───────────────────────────────────────────── */
export default function InquiryDetailModal({ inquiry, onClose }) {
  const [activeTab,          setActiveTab]          = useState("details");
  const [draftsFromGenerate, setDraftsFromGenerate] = useState(null);

  const status = inquiry.status || "new";

  const handleDraftsGenerated = (drafts) => {
    setDraftsFromGenerate(drafts);
    setActiveTab("drafts");
  };

  // Reset drafts state when switching away from drafts tab so re-opening fetches fresh
  const handleTabChange = (tabId) => {
    if (activeTab === "drafts" && tabId !== "drafts") setDraftsFromGenerate(null);
    setActiveTab(tabId);
  };

  const TABS = [
    { id: "details", label: "Details",         Icon: FileText },
    { id: "vendors", label: "Vendors",          Icon: Store    },
    { id: "drafts",  label: "Drafts",           Icon: Mail     },
    { id: "quotes",  label: "Reply to Client",  Icon: Tag      },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white"
        style={{ maxHeight: "90vh", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-[#EEF2F6] p-5"
          style={{ background: "linear-gradient(90deg,#F5F8FF,#EEF4FF)" }}
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inquiry</p>
              <h3 className="mt-0.5 text-[17px] font-bold text-slate-900">{inquiry.unique_code}</h3>
            </div>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[status] || STATUS_CLASSES.new}`}>
              {formatStatus(status)}
            </span>
            {inquiry.client_name && (
              <span className="text-[12px] text-slate-500 font-medium">{inquiry.client_name}</span>
            )}
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-[#EEF2F6] px-5" style={{ background: "#FAFBFF" }}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className="relative mr-5 flex items-center gap-1.5 py-3 text-[12px] font-semibold transition"
              style={{ color: activeTab === id ? "#4451E8" : "#94A3B8" }}
            >
              <Icon size={12} />
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: "#4451E8" }} />
              )}
            </button>
          ))}
        </div>

        {/* Body — fills remaining height */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "details" && (
            <div className="flex-1 overflow-y-auto">
              <DetailsTab inquiry={inquiry} />
            </div>
          )}
          {activeTab === "vendors" && (
            <VendorsTab inquiry={inquiry} onDraftsGenerated={handleDraftsGenerated} />
          )}
          {activeTab === "drafts" && (
            <div className="flex-1 overflow-y-auto">
              <DraftsTab inquiry={inquiry} initialDrafts={draftsFromGenerate} />
            </div>
          )}
          {activeTab === "quotes" && (
            <QuotesTab inquiry={inquiry} />
          )}
        </div>

        {/* Footer */}
        {activeTab !== "vendors" && activeTab !== "quotes" && (
          <div className="flex shrink-0 justify-end border-t border-[#EEF2F6] p-4" style={{ background: "#F8FAFC" }}>
            <button onClick={onClose}
              className="h-9 rounded-xl border border-[#E4E8EE] bg-white px-5 text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
