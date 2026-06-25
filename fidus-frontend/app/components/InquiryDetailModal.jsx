"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Award, Ban, Bot, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, FileText, Globe,
  History, Mail, MapPin, Phone, RefreshCw, Send, Store, Tag, Trash2, UserPlus, X,
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
    blue:   { bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", text: "text-[#1D6FD8]", dot: "bg-[#3B82F6]" },
    amber:  { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", text: "text-[#B45309]", dot: "bg-[#F59E0B]" },
    violet: { bg: "bg-[#FAF9FF]", border: "border-[#DDD6FE]", text: "text-[#6D28D9]", dot: "bg-[#8B5CF6]" },
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
function BrandCell({ item }) {
  const [value, setValue] = useState(item.brand || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Once the employee actually edits and saves, this stops being "auto" —
  // the PATCH endpoint clears brand_source server-side for id-based edits,
  // so mirror that locally instead of waiting on a refetch.
  const [isAuto, setIsAuto] = useState(item.brandSource === "auto");
  const savedRef = useRef(item.brand || "");

  // useState's initial value only applies on mount. If the brand gets
  // auto-detected by the background worker while this modal is already
  // open, the parent's polling/refresh updates `item`, but this component
  // would otherwise keep showing whatever it saw when it first rendered.
  // Sync local state whenever the saved value actually changes upstream.
  useEffect(() => {
    if (item.brand !== savedRef.current) {
      setValue(item.brand || "");
      savedRef.current = item.brand || "";
      setIsAuto(item.brandSource === "auto");
    }
  }, [item.brand, item.brandSource]);

  const handleBlur = async () => {
    if (value === savedRef.current) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inquiries/items", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: item.id, brand: value }),
      });
      if (res.ok) {
        savedRef.current = value;
        setIsAuto(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      {isAuto && (
        <span title="Brand auto-detected by web search — verify before relying on it">
          <Bot size={11} className="shrink-0 text-[#8B5CF6]" />
        </span>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add brand…"
        className={`w-full min-w-[90px] rounded-md border px-1 py-0.5 text-[11px] font-medium outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:bg-white focus:ring-2 focus:ring-[#5BA7FF]/10 placeholder:text-slate-300 placeholder:italic ${
          isAuto
            ? "border-[#DDD6FE] bg-[#FAF9FF] text-[#6D28D9]"
            : "border-transparent bg-transparent text-slate-700"
        }`}
      />
      {saving && <RefreshCw size={10} className="shrink-0 animate-spin text-slate-300" />}
      {saved && <Check size={11} className="shrink-0 text-emerald-500" />}
    </div>
  );
}

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
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Line Items ({items.length}) <span className="font-normal text-slate-300">· click a brand to edit</span>
            {items.some((i) => i.brandSource === "auto") && (
              <span className="flex items-center gap-1 font-normal text-[#8B5CF6]">
                <Bot size={10} />= auto-detected, verify before relying on it
              </span>
            )}
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
                  <tr key={item.id ?? idx} className="border-b border-[#EEF2F6] last:border-b-0"
                      style={{ background: idx % 2 === 0 ? "white" : "#F8FAFC" }}>
                    <td className="px-1 py-1">
                      {item.id ? <BrandCell item={item} /> : <span className="px-2 text-slate-600">{item.brand || "—"}</span>}
                    </td>
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
  const [manual,        setManual]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [selDisc,       setSelDisc]       = useState(new Set()); // `${vendorId}::${brand}` keys
  const [selLeg,        setSelLeg]        = useState(new Set()); // `${rowId}::${brand}` keys
  const [selMan,        setSelMan]        = useState(new Set()); // manual vendor row ids
  const [generating,    setGenerating]    = useState(false);
  const [genError,      setGenError]      = useState("");

  const [newVendor,     setNewVendor]     = useState({ name: "", email: "", phone: "", brand: "", notes: "" });
  const [addingVendor,  setAddingVendor]  = useState(false);
  const [addError,      setAddError]      = useState("");

  // Brand strings get captured at different times by different pipelines
  // (client email extraction, SerpAPI discovery, the legacy parts_table) and
  // routinely disagree on casing/whitespace ("Panasonic" vs "PANASONIC").
  // The backend matches brands case-insensitively (SQL ILIKE); this filter
  // must too, or it silently hides rows the API correctly returned.
  const normBrand = (b) => (b || "").trim().toLowerCase();
  const brands = [...new Set((inquiry.items || []).map((i) => i.brand).filter(Boolean))];
  const [selectedBrands, setSelectedBrands] = useState(() => new Set(brands.map(normBrand)));

  useEffect(() => {
    setLoading(true); setError("");
    const brandsQ = brands.length ? `&brands=${encodeURIComponent(brands.join(","))}` : "";
    Promise.all([
      fetch(`/api/vendors?unique_code=${encodeURIComponent(inquiry.unique_code)}${brandsQ}`).then((r) => r.json()),
      fetch(`/api/vendors/manual?unique_code=${encodeURIComponent(inquiry.unique_code)}`).then((r) => r.json()),
    ])
      .then(([v, m]) => {
        setDiscovered(v.discovered || []);
        setLegacy(v.legacy || []);
        setManual(m.vendors || []);
      })
      .catch(() => setError("Failed to load vendors"))
      .finally(() => setLoading(false));
  }, [inquiry.unique_code]);

  // Compound keys so selecting one (vendor, brand) row never silently selects
  // a different brand row for the same vendor — needed once brand filtering
  // can hide some of that vendor's rows from view.
  const discKey = (v) => `${v.id}::${v.brand}`;
  const legKey  = (v) => `${v.id}::${v.brand}`;

  const toggleInSet = (setter) => (key) =>
    setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleDisc = toggleInSet(setSelDisc);
  const toggleLeg  = toggleInSet(setSelLeg);
  const toggleMan  = toggleInSet(setSelMan);

  const toggleBrand = (b) =>
    setSelectedBrands((prev) => {
      const key = normBrand(b);
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const filteredDiscovered = discovered.filter((v) => selectedBrands.has(normBrand(v.brand)));
  const filteredLegacy     = legacy.filter((v) => selectedBrands.has(normBrand(v.brand)));
  // Manually added vendors are exempt from the brand filter — the whole point
  // of adding one manually is to cover a brand the inquiry doesn't already
  // recognize (e.g. the client's email never stated it), so there's often no
  // filter chip for it to match against. Always show every manual vendor.
  const filteredManual     = manual;

  const toggleAllDisc = () => {
    const keys = filteredDiscovered.map(discKey);
    const allSelected = keys.length > 0 && keys.every((k) => selDisc.has(k));
    setSelDisc((prev) => {
      const n = new Set(prev);
      keys.forEach((k) => (allSelected ? n.delete(k) : n.add(k)));
      return n;
    });
  };
  const toggleAllLeg = () => {
    const keys = filteredLegacy.map(legKey);
    const allSelected = keys.length > 0 && keys.every((k) => selLeg.has(k));
    setSelLeg((prev) => {
      const n = new Set(prev);
      keys.forEach((k) => (allSelected ? n.delete(k) : n.add(k)));
      return n;
    });
  };
  const toggleAllMan = () => {
    const ids = filteredManual.map((v) => String(v.id));
    const allSelected = ids.length > 0 && ids.every((id) => selMan.has(id));
    setSelMan((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (allSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  const totalSelected = selDisc.size + selLeg.size + selMan.size;

  const addManualVendor = async () => {
    if (!newVendor.name.trim()) { setAddError("Vendor name is required"); return; }
    setAddingVendor(true); setAddError("");
    try {
      const res = await fetch("/api/vendors/manual", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: inquiry.unique_code, ...newVendor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add vendor");
      setManual((prev) => [...prev, data.vendor]);
      setNewVendor({ name: "", email: "", phone: "", brand: "", notes: "" });
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAddingVendor(false);
    }
  };

  const removeManualVendor = async (id) => {
    setManual((prev) => prev.filter((v) => v.id !== id));
    setSelMan((prev) => { const n = new Set(prev); n.delete(String(id)); return n; });
    try {
      await fetch("/api/vendors/manual", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
    } catch {}
  };

  const generateDrafts = async () => {
    setGenerating(true); setGenError("");
    try {
      // Group selected rows by vendor identity so a vendor covering several
      // selected brands gets ONE combined draft instead of one per brand.
      const groups = new Map();
      const addToGroup = (identity, source, name, email, brand) => {
        if (!groups.has(identity)) groups.set(identity, { source, name, email, brands: new Set() });
        if (brand) groups.get(identity).brands.add(brand);
      };

      discovered.forEach((v) => { if (selDisc.has(discKey(v))) addToGroup(`d-${v.id}`, "discovered", v.name, v.email, v.brand); });
      legacy.forEach((v) => { if (selLeg.has(legKey(v))) addToGroup(`l-${(v.email || v.id || "").toLowerCase()}`, "legacy", v.name, v.email, v.brand); });
      manual.forEach((v) => { if (selMan.has(String(v.id))) addToGroup(`m-${v.id}`, "manual", v.name, v.email, v.brand); });

      const vendors = [...groups.values()].map((g) => ({
        source: g.source, name: g.name, email: g.email, brands: [...g.brands],
      }));

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

  const noData = discovered.length === 0 && legacy.length === 0 && manual.length === 0;

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      {/* Brand filter */}
      {brands.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F6] bg-[#FAFBFF] px-5 py-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Filter by brand:</span>
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => toggleBrand(b)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                selectedBrands.has(normBrand(b))
                  ? "border-[#4451E8] bg-[#EEF0FF] text-[#4451E8]"
                  : "border-[#E4E8EE] bg-white text-slate-400 hover:border-[#C7D2FE]"
              }`}
            >
              {b}
            </button>
          ))}
          {selectedBrands.size < brands.length && (
            <button onClick={() => setSelectedBrands(new Set(brands))} className="text-[10px] font-semibold text-[#4451E8] hover:underline">
              Show all
            </button>
          )}
          {selectedBrands.size > 1 && (
            <span className="ml-auto text-[10px] text-slate-400">
              Vendors covering all {selectedBrands.size} selected brands can be sent one combined email
            </span>
          )}
        </div>
      )}

      {/* Scrollable vendor lists */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Discovered vendors ── */}
        <div className="space-y-2">
          <SectionHeader icon={Store} label="Discovered Vendors" count={filteredDiscovered.length} accent="blue" />
          {filteredDiscovered.length === 0 ? (
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
                      <input type="checkbox" checked={filteredDiscovered.length > 0 && filteredDiscovered.every((v) => selDisc.has(discKey(v)))}
                        onChange={toggleAllDisc} className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer" />
                    </th>
                    {["Vendor / Domain", "Brand", "Email", "Phone", "Location", "Auth", ""].map((h) => (
                      <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDiscovered.map((v) => (
                    <tr key={discKey(v)}
                        className="border-b border-[#EEF2F6] last:border-b-0 transition"
                        style={{ background: selDisc.has(discKey(v)) ? "#EEF6FF" : "white" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selDisc.has(discKey(v))} onChange={() => toggleDisc(discKey(v))}
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
          <SectionHeader icon={History} label="Company History" count={filteredLegacy.length} accent="amber" />
          {filteredLegacy.length === 0 ? (
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
                      <input type="checkbox" checked={filteredLegacy.length > 0 && filteredLegacy.every((v) => selLeg.has(legKey(v)))}
                        onChange={toggleAllLeg} className="h-3.5 w-3.5 accent-[#F59E0B] cursor-pointer" />
                    </th>
                    {["Supplier", "Brand", "Email", "Last Price", "Delivery", ""].map((h) => (
                      <th key={h} className="border-b border-[#FDE68A] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#B45309]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLegacy.map((v) => {
                    const price = v.price
                      ? `${v.currency === "INR" ? "₹" : v.currency === "EUR" ? "€" : v.currency === "USD" ? "$" : (v.currency || "")} ${Number(v.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                      : "—";
                    return (
                      <tr key={legKey(v)}
                          className="border-b border-[#FEF3C7] last:border-b-0 transition"
                          style={{ background: selLeg.has(legKey(v)) ? "#FFFBEB" : "white" }}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={selLeg.has(legKey(v))} onChange={() => toggleLeg(legKey(v))}
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

        {/* ── Manually added vendors ── */}
        <div className="space-y-2">
          <SectionHeader icon={UserPlus} label="Manually Added" count={filteredManual.length} accent="violet" />

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[#DDD6FE] bg-[#FAF9FF] p-3">
            <input value={newVendor.name} onChange={(e) => setNewVendor((p) => ({ ...p, name: e.target.value }))}
              placeholder="Vendor name *" className="h-8 w-36 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/10" />
            <input value={newVendor.email} onChange={(e) => setNewVendor((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email" className="h-8 w-44 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/10" />
            <input value={newVendor.phone} onChange={(e) => setNewVendor((p) => ({ ...p, phone: e.target.value }))}
              placeholder="Phone" className="h-8 w-28 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/10" />
            <input value={newVendor.brand} onChange={(e) => setNewVendor((p) => ({ ...p, brand: e.target.value }))}
              placeholder="Brand" className="h-8 w-28 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/10" />
            <button
              onClick={addManualVendor}
              disabled={addingVendor || !newVendor.name.trim()}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white transition disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)" }}
            >
              {addingVendor ? <RefreshCw size={11} className="animate-spin" /> : <UserPlus size={11} />}
              Add
            </button>
            {addError && <p className="text-[11px] text-rose-500 w-full">{addError}</p>}
          </div>

          {filteredManual.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DDD6FE] bg-[#FAF9FF] px-4 py-6 text-center">
              <p className="text-[11px] text-slate-400">No manually added vendors yet — use the form above.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#DDD6FE]">
              <table className="w-full border-collapse text-[11px]" style={{ minWidth: 640 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(90deg,#FAF9FF,#F3F0FF)" }}>
                    <th className="w-8 border-b border-[#DDD6FE] px-3 py-2">
                      <input type="checkbox" checked={filteredManual.length > 0 && filteredManual.every((v) => selMan.has(String(v.id)))}
                        onChange={toggleAllMan} className="h-3.5 w-3.5 accent-[#8B5CF6] cursor-pointer" />
                    </th>
                    {["Vendor", "Brand", "Email", "Phone", "Notes", ""].map((h) => (
                      <th key={h} className="border-b border-[#DDD6FE] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#6D28D9]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredManual.map((v) => (
                    <tr key={v.id}
                        className="border-b border-[#F3F0FF] last:border-b-0 transition"
                        style={{ background: selMan.has(String(v.id)) ? "#FAF9FF" : "white" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selMan.has(String(v.id))} onChange={() => toggleMan(String(v.id))}
                          className="h-3.5 w-3.5 accent-[#8B5CF6] cursor-pointer" />
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{v.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-[#DDD6FE] bg-[#FAF9FF] px-2 py-0.5 text-[10px] font-semibold text-[#6D28D9]">
                          {v.brand || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {v.email ? <a href={`mailto:${v.email}`} className="text-[#6D28D9] hover:underline">{v.email}</a> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{v.phone || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{v.notes || "—"}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => removeManualVendor(v.id)} className="text-slate-300 hover:text-rose-500 transition">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
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
              {totalSelected} row{totalSelected !== 1 ? "s" : ""} selected
              <span className="ml-1.5 font-normal text-slate-400">
                ({selDisc.size} discovered · {selLeg.size} from history · {selMan.size} manual)
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
  const [leadTimes,     setLeadTimes]     = useState({}); // part_number -> string
  const [salesperson,   setSalesperson]   = useState("");
  const [expanded,      setExpanded]      = useState({}); // quote id -> bool
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
  const itemUom = (partNumber) => {
    const item = (inquiry.items || []).find((i) => (i.partNumber || "") === partNumber);
    return item?.uom || null;
  };
  const itemDescription = (partNumber) => {
    const item = (inquiry.items || []).find((i) => (i.partNumber || "") === partNumber);
    return item?.itemNotes || null;
  };
  const itemBrand = (partNumber) => {
    const item = (inquiry.items || []).find((i) => (i.partNumber || "") === partNumber);
    return item?.brand || null;
  };

  const readyLines = partNumbers
    .filter((pn) => selected[pn] && sellingPrices[pn])
    .map((pn) => {
      const q = byPart[pn].find((x) => String(x.id) === String(selected[pn]));
      return {
        part_number: pn,
        description: itemDescription(pn),
        brand: itemBrand(pn),
        quantity: itemQty(pn),
        uom: itemUom(pn),
        currency: q?.currency || null,
        selling_price: sellingPrices[pn],
        lead_time: leadTimes[pn] || q?.lead_time || "",
      };
    });

  const sendQuote = async () => {
    setSending(true); setSendError("");
    try {
      const res = await fetch("/api/quotes/send-to-client", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: inquiry.unique_code, lines: readyLines, salesperson }),
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
          // Cheapest valid price first — nulls/NaN sink to the bottom.
          const rows = [...byPart[pn]].sort((a, b) => {
            const pa = Number(a.unit_price);
            const pb = Number(b.unit_price);
            return (Number.isFinite(pa) ? pa : Infinity) - (Number.isFinite(pb) ? pb : Infinity);
          });
          const bestId = rows.find((q) => Number.isFinite(Number(q.unit_price)))?.id;
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
                      {["Vendor", "Unit Price", "Lead Time", "Availability", ""].map((h) => (
                        <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((q) => (
                      <Fragment key={q.id}>
                        <tr style={{ background: String(selected[pn]) === String(q.id) ? "#EEF6FF" : "white" }}
                            className="border-b border-[#EEF2F6] last:border-b-0">
                          <td className="px-3 py-2.5">
                            <input
                              type="radio"
                              name={`quote-${pn}`}
                              checked={String(selected[pn]) === String(q.id)}
                              onChange={() => {
                                setSelected((prev) => ({ ...prev, [pn]: q.id }));
                                setLeadTimes((prev) => prev[pn] ? prev : { ...prev, [pn]: q.lead_time || "" });
                              }}
                              className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div
                              className={q.raw_reply ? "cursor-pointer select-none" : ""}
                              onClick={() => q.raw_reply && setExpanded((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                            >
                              <p className="font-semibold text-slate-900">{q.vendor_name || "—"}</p>
                              <p className="text-[10px] text-slate-400">{q.vendor_email || ""}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-slate-800">{formatQuotePrice(q.unit_price, q.currency)}</span>
                            {q.id === bestId && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#6EE7B7] bg-[#ECFDF5] px-1.5 py-0.5 text-[9px] font-bold text-[#059669]">
                                <Award size={9} />Best Price
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{q.lead_time || "—"}</td>
                          <td className="px-3 py-2.5 text-slate-500">{q.availability || "—"}</td>
                          <td className="px-3 py-2.5">
                            {q.raw_reply && (
                              <button
                                onClick={() => setExpanded((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                                className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-[#4451E8] transition"
                              >
                                {expanded[q.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                Reply
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded[q.id] && (
                          <tr className="border-b border-[#EEF2F6]">
                            <td colSpan={6} className="bg-[#FAFBFF] px-4 py-3">
                              <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Vendor's Original Reply</p>
                              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{q.raw_reply}</p>
                              {q.remarks && (
                                <Fragment>
                                  <p className="mb-1 mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Remarks</p>
                                  <p className="text-[11px] text-slate-600">{q.remarks}</p>
                                </Fragment>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected[pn] && (
                <div className="flex items-center gap-4 rounded-xl border border-[#FDE68A] bg-[#FFFDF5] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Tag size={12} className="text-[#B45309]" />
                    <label className="text-[11px] font-semibold text-[#B45309]">Your Selling Price</label>
                    <input
                      type="number"
                      value={sellingPrices[pn] || ""}
                      onChange={(e) => setSellingPrices((prev) => ({ ...prev, [pn]: e.target.value }))}
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-[#B45309]">Lead Time</label>
                    <input
                      type="text"
                      value={leadTimes[pn] || ""}
                      onChange={(e) => setLeadTimes((prev) => ({ ...prev, [pn]: e.target.value }))}
                      placeholder="e.g. 15-20 days"
                      className="w-36 rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom action bar */}
      <div className="shrink-0 border-t border-[#EEF2F6] bg-white px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {!sentOk && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-500">Salesperson</label>
              <input
                type="text"
                value={salesperson}
                onChange={(e) => setSalesperson(e.target.value)}
                placeholder="Your name"
                className="w-32 rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
              />
            </div>
          )}
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
        </div>
        {!sentOk && (
          <button
            onClick={sendQuote}
            disabled={readyLines.length === 0 || sending || !salesperson.trim()}
            title={!salesperson.trim() ? "Enter the salesperson name first" : ""}
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
export default function InquiryDetailModal({ inquiry, onClose, onBlockClient }) {
  const [activeTab,          setActiveTab]          = useState("details");
  const [draftsFromGenerate, setDraftsFromGenerate] = useState(null);

  const status = inquiry.status || "new";

  const handleBlock = () => {
    if (!inquiry.sender_email) { alert("This inquiry has no sender email to block."); return; }
    if (!confirm(`Block ${inquiry.sender_email}? Future mail from this client will be skipped before parsing.`)) return;
    onBlockClient?.(inquiry.sender_email, inquiry.client_name);
  };

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
          <div className="flex items-center gap-2">
            {onBlockClient && (
              <button onClick={handleBlock} title="Block this client — future mail won't be parsed"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100">
                <Ban size={13} />
              </button>
            )}
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700">
              <X size={15} />
            </button>
          </div>
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
