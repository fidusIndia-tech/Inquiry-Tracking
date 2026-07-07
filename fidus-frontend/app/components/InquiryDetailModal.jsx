"use client";

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Award, Ban, Bot, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, FileText, Globe,
  History, Loader2, Mail, MapPin, Phone, RefreshCw, Search, Send, ShoppingCart, Store, Tag, Trash2, UserPlus, X, XCircle,
} from "lucide-react";
import PurchaseOrdersTab from "./PurchaseOrdersTab";

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
            Line Items ({items.length}) <span className="font-normal text-slate-300">· click brand, part number, or qty to edit</span>
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
                    <td className="px-1 py-1">
                      {item.id ? <PartNumberCell item={item} /> : <span className="px-2 font-semibold text-slate-900">{item.partNumber || "—"}</span>}
                    </td>
                    <td className="px-1 py-1">
                      {item.id ? <QuantityCell item={item} /> : <span className="px-2 text-slate-600">{item.quantity || "—"}</span>}
                    </td>
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

function QuantityCell({ item }) {
  const [value,   setValue]   = useState(String(item.quantity ?? ""));
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const savedRef = useRef(String(item.quantity ?? ""));

  const handleBlur = async () => {
    if (value === savedRef.current) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inquiries/items", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: item.id, quantity: value }),
      });
      if (res.ok) {
        savedRef.current = value;
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Qty…"
        className="w-full min-w-[48px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-slate-600 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:bg-white focus:ring-2 focus:ring-[#5BA7FF]/10 placeholder:text-slate-300 placeholder:italic"
      />
      {saving && <RefreshCw size={10} className="shrink-0 animate-spin text-slate-300" />}
      {saved  && <Check     size={11} className="shrink-0 text-emerald-500" />}
    </div>
  );
}

function PartNumberCell({ item }) {
  const [value,   setValue]   = useState(item.partNumber || "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const savedRef = useRef(item.partNumber || "");

  const handleBlur = async () => {
    if (value === savedRef.current) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inquiries/items", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: item.id, part_number: value }),
      });
      if (res.ok) {
        savedRef.current = value;
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Enter part no…"
        className="w-full min-w-[100px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold text-slate-900 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:bg-white focus:ring-2 focus:ring-[#5BA7FF]/10 placeholder:text-slate-300 placeholder:italic"
      />
      {saving && <RefreshCw size={10} className="shrink-0 animate-spin text-slate-300" />}
      {saved  && <Check     size={11} className="shrink-0 text-emerald-500" />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Vendors Tab
───────────────────────────────────────────── */

// Vendor discovery is employee-triggered, not automatic — this renders
// either the "Search Vendors" button (idle/done/failed) or a live progress
// bar (queued/running), driven by polling /api/parser/vendors/discovery-status.
function DiscoveryControl({ run, starting, error, onStart, onDismiss }) {
  const isActive = run && (run.status === "queued" || run.status === "running");

  if (isActive) {
    const pct = run.total_items > 0 ? Math.round((run.items_done / run.total_items) * 100) : 4;
    return (
      <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#1D6FD8]">
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            {run.current_brand ? `Searching ${run.current_brand}…` : "Searching vendors…"}
            {run.total_items > 0 && (
              <span className="font-normal text-[#5B8FD9]">({run.items_done}/{run.total_items})</span>
            )}
          </span>
          <button onClick={onDismiss}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-[#5B8FD9] hover:bg-[#DBEAFE] transition">
            <X size={11} />Dismiss
          </button>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#DBEAFE]">
          <div
            className="h-full rounded-full bg-[#3B82F6] transition-all duration-700"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-[#5B8FD9]">Runs in the background — feel free to switch tabs or close this.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onStart}
        disabled={starting}
        className="flex items-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#4451E8] transition hover:bg-[#EEF0FF] disabled:opacity-50"
      >
        <Search size={12} />
        {starting ? "Starting..." : run?.status === "failed" ? "Retry Search" : "Search Vendors"}
      </button>
      {run?.status === "done" && !error && (
        <span className="text-[11px] text-slate-400">
          Last search found {run.vendors_found} vendor{run.vendors_found !== 1 ? "s" : ""}
        </span>
      )}
      {(error || (run?.status === "failed" && run.error)) && (
        <span className="text-[11px] text-rose-500">{error || run.error}</span>
      )}
    </div>
  );
}
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

  // On-demand vendor discovery — see DiscoveryControl. `prevRunStatus` lets
  // the poller tell "just finished while I was watching" apart from
  // "was already done before I opened this tab", so it only refetches the
  // vendor list on a real running→done transition, not on every mount.
  const [discoveryRun,      setDiscoveryRun]      = useState(null);
  const [discoveryStarting, setDiscoveryStarting] = useState(false);
  const [discoveryError,    setDiscoveryError]    = useState("");
  const prevRunStatus = useRef(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Brand strings get captured at different times by different pipelines
  // (client email extraction, SearchApi.io discovery, the legacy parts_table) and
  // routinely disagree on casing/whitespace ("Panasonic" vs "PANASONIC").
  // The backend matches brands case-insensitively (SQL ILIKE); this filter
  // must too, or it silently hides rows the API correctly returned.
  const normBrand = (b) => (b || "").trim().toLowerCase();
  const brands = useMemo(
    () => [...new Set((inquiry.items || []).map((i) => i.brand).filter(Boolean))],
    [inquiry.items]
  );
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
  }, [inquiry.unique_code, refreshTrigger]);

  const pollDiscoveryStatus = useCallback(() => {
    fetch(`/api/parser/vendors/discovery-status?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((data) => {
        const run = data.run || null;
        const prevStatus = prevRunStatus.current;
        prevRunStatus.current = run?.status || null;
        setDiscoveryRun(run);
        // Only refetch the vendor list on a genuine running→done transition
        // observed live — not just because the run was already done before
        // this tab happened to mount.
        if (run && (run.status === "done" || run.status === "failed") &&
            (prevStatus === "queued" || prevStatus === "running")) {
          setRefreshTrigger((n) => n + 1);
        }
      })
      .catch(() => {});
  }, [inquiry.unique_code]);

  // Check once on mount/inquiry change — picks up a run already in progress
  // if the employee closed and reopened this modal while it was working.
  useEffect(() => { pollDiscoveryStatus(); }, [pollDiscoveryStatus]);

  // Keep polling every 3s for as long as a run is actively in progress.
  useEffect(() => {
    if (!discoveryRun || (discoveryRun.status !== "queued" && discoveryRun.status !== "running")) return;
    const timer = setTimeout(pollDiscoveryStatus, 3000);
    return () => clearTimeout(timer);
  }, [discoveryRun, pollDiscoveryStatus]);

  const startDiscovery = () => {
    setDiscoveryError("");
    setDiscoveryStarting(true);
    fetch("/api/parser/vendors/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unique_code: inquiry.unique_code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setDiscoveryError(data.error); return; }
        if (data.status === "skipped") { setDiscoveryError(data.message || "Nothing new to search"); return; }
        prevRunStatus.current = "queued";
        setDiscoveryRun({ status: "queued", total_items: 0, items_done: 0 });
      })
      .catch(() => setDiscoveryError("Failed to start vendor search"))
      .finally(() => setDiscoveryStarting(false));
  };

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
      // Legacy: group by email+name so the same real vendor (same email AND same
      // supplier name) across multiple brands still gets ONE combined draft, but
      // two genuinely different suppliers that happen to share a generic email
      // address are kept as separate drafts instead of being silently merged.
      legacy.forEach((v) => {
        const email = (v.email || "").trim().toLowerCase();
        const name  = (v.name  || "").trim().toLowerCase();
        const key   = email ? `l-${email}\x00${name}` : `l-id-${v.id}`;
        if (selLeg.has(legKey(v))) addToGroup(key, "legacy", v.name, v.email, v.brand);
      });
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
          employee_id:   localStorage.getItem("userId") || null,
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
          <DiscoveryControl
            run={discoveryRun}
            starting={discoveryStarting}
            error={discoveryError}
            onStart={startDiscovery}
            onDismiss={() => setDiscoveryRun(null)}
          />
          {filteredDiscovered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D0DCF4] bg-[#FAFBFF] px-4 py-8 text-center">
              <Store size={18} className="mx-auto mb-2 text-slate-300" />
              <p className="text-[12px] font-medium text-slate-500">No vendors discovered yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Tap "Search Vendors" above to look for suppliers for this inquiry.</p>
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
                      ? `${({ INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ", CNY: "¥", THB: "฿", SGD: "S$", MYR: "RM " }[v.currency] ?? (v.currency || ""))} ${Number(v.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger((n) => n + 1)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[#C8D6F0] bg-white px-3 text-[12px] font-semibold text-slate-600 transition hover:bg-[#EEF4FF] hover:text-[#4461A8]"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
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
    </div>
  );
}

/* ─────────────────────────────────────────────
   Drafts Tab
───────────────────────────────────────────── */
const DraftCard = memo(function DraftCard({ draft, onChange }) {
  const [subject,  setSubject]  = useState(draft.subject || "");
  const [body,     setBody]     = useState(draft.body    || "");
  const [saving,   setSaving]   = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [status,   setStatus]   = useState(draft.status  || "draft");
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState("");
  const [markingReplied, setMarkingReplied] = useState(false);
  const [editingHtml,    setEditingHtml]    = useState(false);
  const debounceRef = useRef(null);
  const bodyRef     = useRef(null);

  // ── Attachments ──────────────────────────────────────────────────────────
  const [showAttach,     setShowAttach]     = useState(false);
  const [clientAtts,     setClientAtts]     = useState(null);   // null = not loaded yet
  const [attsLoading,    setAttsLoading]    = useState(false);
  const [selAtts,        setSelAtts]        = useState(new Set()); // selected attachment_ids
  const [uploadedFiles,  setUploadedFiles]  = useState([]);         // [{filename, data_base64, mime_type}]
  const fileInputRef     = useRef(null);

  const toggleAttachPanel = () => {
    setShowAttach((v) => {
      if (!v && clientAtts === null) {
        setAttsLoading(true);
        fetch(`/api/inquiries/attachments?unique_code=${encodeURIComponent(draft.inquiry_unique_code)}`)
          .then((r) => r.json())
          .then((d) => {
            const list = d.attachments || [];
            setClientAtts(list);
            // Pre-select all attachments that look like images or drawings
            const preSelect = new Set(
              list
                .filter((a) => /\.(jpg|jpeg|png|gif|bmp|webp|pdf|dwg|dxf)$/i.test(a.filename))
                .map((a) => a.attachment_id)
            );
            setSelAtts(preSelect);
          })
          .catch(() => setClientAtts([]))
          .finally(() => setAttsLoading(false));
      }
      return !v;
    });
  };

  const toggleAtt = (id) => setSelAtts((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const base64 = dataUrl.split(",")[1];
        setUploadedFiles((prev) => [
          ...prev,
          { filename: file.name, data_base64: base64, mime_type: file.type || "application/octet-stream" },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeUploaded = (idx) => setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));

  const totalAttachments = (selAtts.size) + uploadedFiles.length;

  // Sync body state into the contentEditable div whenever edit mode is entered.
  // We can't use dangerouslySetInnerHTML on a contentEditable element (React
  // would reset the cursor on every keystroke), so we write innerHTML once via
  // ref immediately after the DOM node appears.
  useLayoutEffect(() => {
    if (editingHtml && bodyRef.current) {
      bodyRef.current.innerHTML = body;
      bodyRef.current.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHtml]); // deliberately omit `body` — only re-init on mode change

  const handleMarkReplied = async () => {
    setMarkingReplied(true);
    try {
      const repliedAt = new Date().toISOString();
      const res = await fetch("/api/drafts", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: draft.id, status: "replied", replied_at: repliedAt }),
      });
      if (!res.ok) throw new Error("Failed to mark as replied");
      setStatus("replied");
      onChange({ ...draft, status: "replied", replied_at: repliedAt });
    } catch (e) {
      alert(e.message);
    } finally {
      setMarkingReplied(false);
    }
  };

  const isSent = status === "sent" || status === "replied";

  const handleSend = async () => {
    setSending(true); setSendError("");
    try {
      const selectedClientAtts = (clientAtts || [])
        .filter((a) => selAtts.has(a.attachment_id))
        .map((a) => ({ attachment_id: a.attachment_id, filename: a.filename, mime_type: a.mime_type }));

      const res = await fetch("/api/drafts/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draft.id,
          client_attachments: selectedClientAtts,
          uploaded_attachments: uploadedFiles,
        }),
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
              onClick={() => {
                if (editingHtml && bodyRef.current) {
                  // Exiting edit mode — capture whatever the employee typed
                  handleBodyChange(bodyRef.current.innerHTML);
                }
                setEditingHtml((v) => !v);
              }}
              className="text-[10px] font-semibold text-[#4451E8] hover:underline"
            >
              {editingHtml ? "Preview" : "Edit"}
            </button>
          )}
        </div>
        {editingHtml ? (
          // contentEditable lets employees click directly into table cells to
          // correct part numbers, quantities, or any other text in the draft.
          // innerHTML is initialised once via bodyRef + useLayoutEffect above.
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={() => {
              if (bodyRef.current) handleBodyChange(bodyRef.current.innerHTML);
            }}
            className="min-h-[180px] overflow-x-auto rounded-xl border border-[#5BA7FF] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 outline-none ring-2 ring-[#5BA7FF]/10 cursor-text
              [&_table]:w-full [&_table]:border-collapse
              [&_td]:border [&_td]:border-[#D0DCF4] [&_td]:px-2 [&_td]:py-1.5 [&_td]:min-w-[60px]
              [&_th]:border [&_th]:border-[#D0DCF4] [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-[#EEF4FF] [&_th]:font-semibold"
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

      {/* Attachments panel — collapsed by default */}
      {!isSent && (
        <div className="border-t border-[#EEF2F6]">
          <button
            onClick={toggleAttachPanel}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 hover:bg-[#F8FAFC] transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            Attachments
            {totalAttachments > 0 && (
              <span className="ml-1 rounded-full bg-[#4461A8] px-1.5 py-0.5 text-[9px] font-bold text-white">{totalAttachments}</span>
            )}
            <span className="ml-auto">{showAttach ? "▲" : "▼"}</span>
          </button>

          {showAttach && (
            <div className="border-t border-[#EEF2F6] bg-[#F8FAFC] px-4 py-3 space-y-3">

              {/* Client email attachments */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">From client email</p>
                {attsLoading && <p className="text-[11px] text-slate-400">Loading…</p>}
                {!attsLoading && clientAtts !== null && clientAtts.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic">No attachments in the original client email.</p>
                )}
                {!attsLoading && (clientAtts || []).map((att) => (
                  <label key={att.attachment_id} className="flex items-center gap-2 mb-1 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selAtts.has(att.attachment_id)}
                      onChange={() => toggleAtt(att.attachment_id)}
                      className="accent-[#4461A8] h-3.5 w-3.5 flex-shrink-0"
                    />
                    <FileText size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-700 truncate">{att.filename}</span>
                    <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">
                      {att.size > 0 ? (att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / 1048576).toFixed(1)} MB`) : ""}
                    </span>
                  </label>
                ))}
              </div>

              {/* Manual upload */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Upload files</p>
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <FileText size={11} className="text-[#4461A8] flex-shrink-0" />
                    <span className="text-[11px] text-slate-700 truncate flex-1">{f.filename}</span>
                    <button onClick={() => removeUploaded(i)} className="text-slate-400 hover:text-rose-500 transition flex-shrink-0">
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-[#C8D6F0] bg-white px-3 text-[11px] font-medium text-[#4461A8] transition hover:bg-[#EEF4FF]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload file
                </button>
              </div>

            </div>
          )}
        </div>
      )}

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
            {sending
              ? <><RefreshCw size={11} className="animate-spin" />Sending…</>
              : <><Send size={11} />Send to Vendor{totalAttachments > 0 ? ` (+${totalAttachments})`  : ""}</>}
          </button>
        ) : (
          <span className="flex h-8 items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[11px] font-semibold text-[#1D6FD8]">
            <CheckCircle2 size={11} />
            {status === "replied" ? "Replied" : `Sent${draft.sent_at ? ` · ${new Date(draft.sent_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}`}
          </span>
        )}
        {status === "sent" && (
          <button
            onClick={handleMarkReplied}
            disabled={markingReplied}
            title="Vendor replied with regret / no stock — stop reminders"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-3 text-[11px] font-semibold text-[#C2410C] transition hover:bg-[#FFEDD5] disabled:opacity-40"
          >
            {markingReplied
              ? <RefreshCw size={11} className="animate-spin" />
              : <XCircle size={11} />}
            Mark Replied
          </button>
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
});

function DraftsTab({ inquiry, initialDrafts }) {
  const [drafts,      setDrafts]      = useState(initialDrafts);
  const [loading,     setLoading]     = useState(initialDrafts === null);
  const [selMode,     setSelMode]     = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting,    setDeleting]    = useState(false);

  useEffect(() => {
    if (initialDrafts !== null) { setDrafts(initialDrafts); return; }
    setLoading(true);
    fetch(`/api/drafts?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => setDrafts(d.drafts || []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [inquiry.unique_code, initialDrafts]);

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => setSelectedIds(
    selectedIds.size === (drafts || []).length ? new Set() : new Set((drafts || []).map((d) => d.id))
  );

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} draft${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/drafts", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft_ids: [...selectedIds] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete");
      setDrafts((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
      setSelMode(false);
    } catch (e) {
      alert("Delete failed: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

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

  const approved  = drafts.filter((d) => d.status === "approved").length;
  const allChosen = selectedIds.size === drafts.length;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          <span className="font-semibold text-slate-800">{drafts.length}</span> draft{drafts.length !== 1 ? "s" : ""}
          {approved > 0 && <> · <span className="text-[#059669] font-semibold">{approved} approved</span></>}
        </p>
        <div className="flex items-center gap-2">
          {selMode ? (
            <>
              <button
                onClick={toggleAll}
                className="h-7 rounded-lg border border-[#C8D6F0] bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-[#EEF4FF]"
              >
                {allChosen ? "Deselect All" : "Select All"}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-7 rounded-lg bg-rose-600 px-3 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : `Delete Selected (${selectedIds.size})`}
                </button>
              )}
              <button
                onClick={() => { setSelMode(false); setSelectedIds(new Set()); }}
                className="h-7 rounded-lg border border-[#C8D6F0] bg-white px-3 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <p className="text-[10px] text-slate-400">Edits save automatically</p>
              <button
                onClick={() => setSelMode(true)}
                className="h-7 rounded-lg border border-[#C8D6F0] bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-[#EEF4FF] hover:text-[#4461A8]"
              >
                <Trash2 size={11} className="inline mr-1" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {drafts.map((draft) => (
        <div key={draft.id} className={`relative ${selMode && selectedIds.has(draft.id) ? "ring-2 ring-[#4451E8] rounded-2xl" : ""}`}>
          {selMode && (
            <label className="absolute top-3.5 right-3.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border-2 transition"
                   style={{ borderColor: selectedIds.has(draft.id) ? "#4451E8" : "#CBD5E1", background: selectedIds.has(draft.id) ? "#4451E8" : "white" }}>
              <input type="checkbox" checked={selectedIds.has(draft.id)} onChange={() => toggleSelect(draft.id)} className="sr-only" />
              {selectedIds.has(draft.id) && <Check size={11} className="text-white" />}
            </label>
          )}
          <DraftCard draft={draft} onChange={(updated) =>
            setDrafts((prev) => prev.map((d) => d.id === updated.id ? updated : d))
          } />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Reply to Client Tab — vendor quotes received, pick the best
   per part, add margin, send the final quotation.
───────────────────────────────────────────── */
const QUOTE_CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ", CNY: "¥", THB: "฿", SGD: "S$", MYR: "RM " };

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "IDR"]);

function formatQuotePrice(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  const code = (currency || "").toUpperCase();
  const symbol = QUOTE_CURRENCY_SYMBOLS[code] || (code ? `${code} ` : "");
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  return `${symbol}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals })}`;
}

const INR = (v) =>
  "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GST_OPTIONS = [
  { label: "No GST / 0%",                    type: "NONE",      rate: 0  },
  { label: "CGST + SGST @ 18%",              type: "CGST_SGST", rate: 18 },
  { label: "IGST @ 18%",                     type: "IGST",      rate: 18 },
  { label: "CGST + SGST @ 12%",              type: "CGST_SGST", rate: 12 },
  { label: "IGST @ 12%",                     type: "IGST",      rate: 12 },
  { label: "CGST + SGST @ 5%",               type: "CGST_SGST", rate: 5  },
  { label: "IGST @ 5%",                      type: "IGST",      rate: 5  },
  { label: "CGST + SGST @ 28%",              type: "CGST_SGST", rate: 28 },
  { label: "IGST @ 28%",                     type: "IGST",      rate: 28 },
  { label: "Export / LUT / Zero Rated @ 0%", type: "EXPORT",    rate: 0  },
  { label: "Custom Tax",                     type: "CUSTOM",    rate: 0  },
];

function calcGst(readyLines, gstOpt, customTax = {}) {
  const taxable = readyLines.reduce(
    (s, l) => s + (parseFloat(String(l.selling_price).replace(/[^0-9.]/g, "")) || 0) * (Number(l.quantity) || 1),
    0
  );
  let cgst = 0, sgst = 0, igst = 0, customAmount = 0;
  if (gstOpt.type === "CGST_SGST") { cgst = sgst = taxable * (gstOpt.rate / 2) / 100; }
  if (gstOpt.type === "IGST")      { igst = taxable * gstOpt.rate / 100; }
  if (gstOpt.type === "CUSTOM") {
    const rate = Math.max(0, parseFloat(String(customTax.rate).replace(/[^0-9.]/g, "")) || 0);
    customAmount = taxable * rate / 100;
  }
  const totalGst = cgst + sgst + igst + customAmount;
  return { taxable, cgst, sgst, igst, customAmount, totalGst, grandTotal: taxable + totalGst };
}

const DEFAULT_TERMS = [
  "Prices: All prices are quoted in INR and are valid for 30 days from the date of this quotation. Prices are exclusive of applicable taxes, duties, and freight unless otherwise mentioned.",
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
].join("\n");

// Custom tax name must be non-empty and rate must be a finite number >= 0.
function isCustomTaxValid(customTax) {
  const name = String(customTax?.name || "").trim();
  const rate = parseFloat(String(customTax?.rate ?? "").replace(/[^0-9.]/g, ""));
  return name.length > 0 && Number.isFinite(rate) && rate >= 0;
}

function QuotesTab({ inquiry }) {
  /* ── State ── */
  const [quotes,        setQuotes]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState({});
  const [sellingPrices, setSellingPrices] = useState({});
  const [leadTimes,     setLeadTimes]     = useState({});
  const [salesperson,   setSalesperson]   = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("userName") : "") || ""
  );
  const salespersonEditedRef = useRef(false);
  useEffect(() => {
    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    if (!userId) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        const me = (d.users || []).find((u) => String(u.id) === String(userId));
        if (me?.name && !salespersonEditedRef.current) {
          setSalesperson(me.name);
          localStorage.setItem("userName", me.name);
        }
      })
      .catch(() => {});
  }, []);
  const [quoteCurrency,       setQuoteCurrency]       = useState("INR");
  const [gstOption,           setGstOption]           = useState(GST_OPTIONS[1]);
  const [customTaxName,       setCustomTaxName]       = useState("");
  const [customTaxRate,       setCustomTaxRate]       = useState("");
  const [expanded,            setExpanded]            = useState({});
  const [sending,             setSending]             = useState(false);
  const [sendError,           setSendError]           = useState("");
  const [sentOk,              setSentOk]              = useState(false);
  const [sentInfo,            setSentInfo]            = useState(null);
  const [priorQuotationCount, setPriorQuotationCount] = useState(0);
  const [showAddManual,       setShowAddManual]       = useState(null);
  const [manualForm,          setManualForm]          = useState({ vendor_name: "", vendor_email: "", unit_price: "", currency: "INR", lead_time: "", availability: "", remarks: "" });
  const [poCreating,          setPoCreating]          = useState({});
  const [quickPOMap,          setQuickPOMap]          = useState({}); // pn → po_number
  const [lockedParts,         setLockedParts]         = useState(new Set()); // parts locked because PO is sent
  const [showBatchPOForm,     setShowBatchPOForm]     = useState(false);
  const [batchPOForm,         setBatchPOForm]         = useState({
    gst_type:             "NONE",
    gst_rate:             "18",
    currency:             "INR",
    sales_representative: "SCM",
    terms_text: `Payment Terms: 20% advance with the purchase order, and the remaining 80% prior to shipment.\nDispatch Schedule: As per Quotation\nWarranty: One year from the date the goods arrive to us.\nRemarks: Delivery at Shipping address\nNote: Goods should be Original & Genuine`,
  });
  const [batchPOCreating,     setBatchPOCreating]     = useState(false);
  const [batchPOError,        setBatchPOError]        = useState("");
  const [addingManual,        setAddingManual]        = useState(false);
  const [expandedItems,       setExpandedItems]       = useState({});
  const [unmatchedAssign,     setUnmatchedAssign]     = useState({});
  const [savingAssign,        setSavingAssign]        = useState(null);
  const [rawReplyQuote,       setRawReplyQuote]       = useState(null);
  const [termsText,           setTermsText]           = useState(DEFAULT_TERMS);
  const [clientNote,          setClientNote]          = useState("");
  const [lineRemarks,         setLineRemarks]         = useState({});
  const [lineDescriptions,    setLineDescriptions]    = useState({});
  const [showPreview,         setShowPreview]         = useState(false);
  const [downloading,         setDownloading]         = useState(false);

  /* ── Data fetch ── */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/quotes?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => setQuotes(Array.isArray(d.quotes) ? d.quotes : []))
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
    fetch(`/api/quotations?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d.quotations) ? d.quotations : [];
        setPriorQuotationCount(rows.filter((q) => q.status === "sent").length);
      })
      .catch(() => setPriorQuotationCount(0));

    // Fetch existing POs to populate quick-PO indicators (keyed by vendor_quote_id) and lock sent items
    fetch(`/api/purchase-orders?unique_code=${encodeURIComponent(inquiry.unique_code)}`)
      .then((r) => r.json())
      .then((d) => {
        const pos = Array.isArray(d.purchase_orders) ? d.purchase_orders : [];
        const poMap = {};   // vendor_quote_id → po_number
        const locked = new Set();
        for (const po of pos) {
          for (const item of (po.items || [])) {
            if (item.vendor_quote_id) poMap[item.vendor_quote_id] = po.po_number;
            if (po.status === "sent" && item.part_number) locked.add(item.part_number);
          }
        }
        setQuickPOMap(poMap);
        setLockedParts(locked);
      })
      .catch(() => {});
  }, [inquiry.unique_code]);

  /* ── Normalise part number for matching ── */
  const norm = useCallback(
    (s) => String(s || "").trim().toUpperCase().replace(/[\s\-_./]+/g, ""),
    []
  );

  /* ── Group quotes: matched to inquiry items vs unmatched ── */
  const { matchedByItem, unmatchedQuotes, byPart, partNumbers } = useMemo(() => {
    const items     = inquiry.items || [];
    const normItems = items.map((it) => norm(it.partNumber || ""));
    const matched   = {};
    const unmatched = [];
    const legacy    = {};

    for (const q of quotes) {
      const qNorm = norm(q.part_number);
      if (items.length > 0) {
        const idx = normItems.findIndex((n) => n && n === qNorm);
        if (idx !== -1) {
          const key = items[idx].partNumber;
          (matched[key] = matched[key] || []).push(q);
        } else {
          unmatched.push(q);
        }
      } else {
        const key = q.part_number || "—";
        (legacy[key] = legacy[key] || []).push(q);
      }
    }

    const sortByPrice = (arr) =>
      arr.sort((a, b) => {
        const pa = Number(a.unit_price), pb = Number(b.unit_price);
        const va = isNaN(pa) || pa <= 0, vb = isNaN(pb) || pb <= 0;
        if (va && vb) return 0;
        if (va) return 1;
        if (vb) return -1;
        return pa - pb;
      });

    for (const key of Object.keys(matched)) sortByPrice(matched[key]);
    for (const key of Object.keys(legacy))  sortByPrice(legacy[key]);

    return {
      matchedByItem:   matched,
      unmatchedQuotes: unmatched,
      byPart:          legacy,
      partNumbers:     Object.keys(legacy),
    };
  }, [quotes, inquiry.items, norm]);

  /* ── Item metadata map (used by legacy view) ── */
  const itemByPart = useMemo(() => {
    const m = {};
    for (const i of inquiry.items || []) m[i.partNumber || ""] = i;
    return m;
  }, [inquiry.items]);

  /* ── Lines ready to send (inquiry items as anchor; legacy fallback) ── */
  const readyLines = useMemo(() => {
    const items = inquiry.items || [];
    if (items.length > 0) {
      return items
        .filter((item) => selected[item.id] && sellingPrices[item.id])
        .map((item) => {
          const pn     = item.partNumber;
          const itemId = item.id;
          const q      = (matchedByItem[pn] || []).find((x) => String(x.id) === String(selected[itemId]));
          return {
            item_id:            itemId,
            part_number:        pn,
            description:        lineDescriptions[itemId] !== undefined ? lineDescriptions[itemId] : (item.itemNotes || null),
            brand:              item.brand     || null,
            quantity:           item.quantity  || null,
            uom:                item.uom       || null,
            currency:           quoteCurrency,
            selling_price:      sellingPrices[itemId],
            lead_time:          leadTimes[itemId] || q?.lead_time || "",
            remark:             lineRemarks[itemId] || null,
            // Vendor fields — persisted in quotations.lines JSONB for PO generation.
            // The PDF renderer ignores unknown keys so these are non-breaking.
            vendor_quote_id:    q?.id                || null,
            vendor_name:        q?.vendor_name       || null,
            vendor_email:       q?.vendor_email      || null,
            vendor_unit_price:  q?.unit_price        || null,
            vendor_currency:    q?.currency          || null,
            vendor_availability: q?.availability     || null,
          };
        });
    }
    return partNumbers
      .filter((pn) => selected[pn] && sellingPrices[pn])
      .map((pn) => {
        const q = byPart[pn]?.find((x) => String(x.id) === String(selected[pn]));
        return {
          part_number:        pn,
          description:        itemByPart[pn]?.itemNotes || null,
          brand:              itemByPart[pn]?.brand     || null,
          quantity:           itemByPart[pn]?.quantity  || null,
          uom:                itemByPart[pn]?.uom       || null,
          currency:           quoteCurrency,
          selling_price:      sellingPrices[pn],
          lead_time:          leadTimes[pn] || q?.lead_time || "",
          remark:             lineRemarks[pn] || null,
          vendor_quote_id:    q?.id                || null,
          vendor_name:        q?.vendor_name       || null,
          vendor_email:       q?.vendor_email      || null,
          vendor_unit_price:  q?.unit_price        || null,
          vendor_currency:    q?.currency          || null,
          vendor_availability: q?.availability     || null,
        };
      });
  }, [inquiry.items, selected, sellingPrices, leadTimes, lineRemarks, lineDescriptions, matchedByItem, quoteCurrency, partNumbers, byPart, itemByPart]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <RefreshCw size={20} className="animate-spin text-[#4451E8]" />
        <p className="text-[12px] text-slate-400">Loading vendor quotes…</p>
      </div>
    );
  }

  const inquiryItems = inquiry.items || [];
  const hasItems     = inquiryItems.length > 0;
  const totalParts   = hasItems ? inquiryItems.length : partNumbers.length;

  if (!hasItems && quotes.length === 0) {
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

  const customTax = { name: customTaxName, rate: customTaxRate };
  const MAX_V     = 5;

  /* ── Manual price add ── */
  const handleManualAdd = async (itemId, partNumber) => {
    if (!manualForm.vendor_name.trim() || !manualForm.unit_price) return;
    setAddingManual(true);
    try {
      // Use a synthetic email derived from vendor name so the dedup index
      // (inquiry_code, vendor_email, part_number) creates a NEW row instead
      // of colliding with existing extracted quotes that have a null email.
      // Use real email if provided; otherwise synthesise one for dedup-index uniqueness
      const manualEmail = manualForm.vendor_email.trim()
        || manualForm.vendor_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".") + "@manual.fiapl";
      const res = await fetch("/api/quotes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_code:  inquiry.unique_code,
          vendor_name:  manualForm.vendor_name.trim(),
          vendor_email: manualEmail,
          source_type:  "manual",
          quotes: [{
            part_number:  partNumber,
            unit_price:   parseFloat(manualForm.unit_price),
            currency:     manualForm.currency || quoteCurrency,
            lead_time:    manualForm.lead_time    || null,
            availability: manualForm.availability || null,
            remarks:      manualForm.remarks      || null,
          }],
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add"); }
      const d = await fetch(`/api/quotes?unique_code=${encodeURIComponent(inquiry.unique_code)}`).then((r) => r.json());
      const fresh = Array.isArray(d.quotes) ? d.quotes : [];
      setQuotes(fresh);
      // Auto-select the newly saved price so the employee only needs to
      // enter their selling price — no extra radio click required.
      const saved = fresh.find(
        (q) => q.vendor_email === manualEmail && norm(q.part_number) === norm(partNumber)
      );
      if (saved) {
        setSelected((prev) => ({ ...prev, [itemId]: saved.id }));
        if (manualForm.lead_time) {
          setLeadTimes((prev) => ({ ...prev, [itemId]: manualForm.lead_time }));
        }
      }
      setShowAddManual(null);
      setManualForm({ vendor_name: "", vendor_email: "", unit_price: "", currency: quoteCurrency, lead_time: "", availability: "", remarks: "" });
    } catch (e) { alert(e.message); }
    finally     { setAddingManual(false); }
  };

  /* ── Batch-create POs for all selected vendors ── */
  const handleBatchCreatePOs = async () => {
    const entries = Object.entries(selected).filter(([, qId]) => qId);
    if (entries.length === 0) return;
    setBatchPOCreating(true); setBatchPOError("");
    const newMap = { ...quickPOMap };
    let anyError = "";
    for (const [pn, quoteId] of entries) {
      setPoCreating((prev) => ({ ...prev, [pn]: true }));
      try {
        const res = await fetch("/api/purchase-orders/quick-create", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inquiry_unique_code:  inquiry.unique_code,
            vendor_quote_id:      quoteId,
            gst_type:             batchPOForm.gst_type,
            gst_rate:             Number(batchPOForm.gst_rate) || 0,
            sales_representative: batchPOForm.sales_representative,
            terms_text:           batchPOForm.terms_text,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "PO creation failed");
        // key by vendor_quote_id so only THIS vendor card shows the badge
        newMap[quoteId] = data.purchase_order.po_number;
      } catch (e) { anyError = e.message; }
      finally { setPoCreating((prev) => ({ ...prev, [pn]: false })); }
    }
    setQuickPOMap(newMap);
    if (anyError) setBatchPOError(anyError);
    else setShowBatchPOForm(false);
    setBatchPOCreating(false);
  };

  /* ── Quick-create PO from a selected vendor quote ── */
  const handleQuickPO = async (partNumber, quoteId) => {
    setPoCreating((prev) => ({ ...prev, [partNumber]: true }));
    try {
      const res = await fetch("/api/purchase-orders/quick-create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_unique_code: inquiry.unique_code,
          vendor_quote_id:     quoteId,
          gst_type:            "NONE",
          gst_rate:            0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PO creation failed");
      setQuickPOMap((prev) => ({ ...prev, [partNumber]: data.purchase_order.po_number }));
    } catch (e) { alert(e.message); }
    finally { setPoCreating((prev) => ({ ...prev, [partNumber]: false })); }
  };

  /* ── Assign unmatched quote to an inquiry item ── */
  const handleAssignUnmatched = async (quoteId) => {
    const partNumber = unmatchedAssign[quoteId];
    if (!partNumber) return;
    setSavingAssign(quoteId);
    try {
      const res = await fetch("/api/quotes", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quoteId, part_number: partNumber }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const d = await fetch(`/api/quotes?unique_code=${encodeURIComponent(inquiry.unique_code)}`).then((r) => r.json());
      setQuotes(Array.isArray(d.quotes) ? d.quotes : []);
    } catch (e) { alert(e.message); }
    finally     { setSavingAssign(null); }
  };

  /* ── Send quote to client ── */
  const sendQuote = async () => {
    if (gstOption.type === "CUSTOM" && !isCustomTaxValid(customTax)) {
      setSendError("Enter a valid custom tax name and a non-negative percentage first.");
      return;
    }
    setSending(true); setSendError("");
    try {
      const res = await fetch("/api/quotes/send-to-client", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_code:    inquiry.unique_code,
          lines:          readyLines,
          salesperson,
          gstOption,
          customTax:      gstOption.type === "CUSTOM" ? customTax : null,
          employee_id:    localStorage.getItem("userId") || null,
          quote_currency: quoteCurrency,
          terms_text:     termsText.trim() || null,
          client_note:    clientNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send quote");
      setShowPreview(false);
      setSentOk(true);
      setSentInfo({ quotation_number: data.quotation_number, amendment_code: data.amendment_code });
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  /* ── Save record + download PDF (no-email flow for portal clients) ── */
  const downloadQuote = async () => {
    if (gstOption.type === "CUSTOM" && !isCustomTaxValid(customTax)) {
      setSendError("Enter a valid custom tax name and a non-negative percentage first.");
      return;
    }
    setDownloading(true); setSendError("");
    try {
      const saveRes = await fetch("/api/quotes/save-without-send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_code:    inquiry.unique_code,
          lines:          readyLines,
          salesperson,
          gstOption,
          customTax:      gstOption.type === "CUSTOM" ? customTax : null,
          quote_currency: quoteCurrency,
          terms_text:     termsText.trim() || null,
          client_note:    clientNote.trim() || null,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Failed to save quotation");

      // Stream the PDF and trigger browser download
      const pdfRes = await fetch(`/api/quotations/pdf?id=${saveData.quotation_id}`);
      if (!pdfRes.ok) throw new Error("Failed to generate PDF");
      const blob = await pdfRes.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${saveData.quotation_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setShowPreview(false);
      setSentOk(true);
      setSentInfo({ quotation_number: saveData.quotation_number, amendment_code: saveData.amendment_code });
    } catch (e) {
      setSendError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  /* ── Render ── */
  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Manual Add Price modal */}
        {showAddManual !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
               onClick={() => setShowAddManual(null)}>
            <div className="w-full max-w-sm rounded-2xl border border-[#E4E8EE] bg-white shadow-xl p-5"
                 onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-bold text-slate-800">Add Manual Price</p>
                <button onClick={() => setShowAddManual(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={15} />
                </button>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mb-3">
                Part: <span className="font-semibold text-slate-800">{showAddManual?.partNumber}</span>
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Vendor Name *</label>
                    <input type="text" value={manualForm.vendor_name}
                      onChange={(e) => setManualForm((f) => ({ ...f, vendor_name: e.target.value }))}
                      placeholder="e.g. ABC Traders"
                      className="w-full rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Vendor Email</label>
                    <input type="email" value={manualForm.vendor_email}
                      onChange={(e) => setManualForm((f) => ({ ...f, vendor_email: e.target.value }))}
                      placeholder="vendor@email.com"
                      className="w-full rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Unit Price *</label>
                  <div className="flex gap-2">
                    <select
                      value={manualForm.currency}
                      onChange={(e) => setManualForm((f) => ({ ...f, currency: e.target.value }))}
                      className="h-[38px] rounded-lg border border-[#E4E8EE] bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    >
                      {["INR", "USD", "EUR", "AED", "GBP", "JPY", "THB", "SGD", "CNY", "MYR"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input type="number" min="0" step="0.01" value={manualForm.unit_price}
                      onChange={(e) => setManualForm((f) => ({ ...f, unit_price: e.target.value }))}
                      placeholder="0.00"
                      className="flex-1 rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Lead Time</label>
                    <input type="text" value={manualForm.lead_time}
                      onChange={(e) => setManualForm((f) => ({ ...f, lead_time: e.target.value }))}
                      placeholder="e.g. 2 weeks"
                      className="w-full rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Availability</label>
                    <input type="text" value={manualForm.availability}
                      onChange={(e) => setManualForm((f) => ({ ...f, availability: e.target.value }))}
                      placeholder="In stock"
                      className="w-full rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Remarks</label>
                  <textarea rows={2} value={manualForm.remarks}
                    onChange={(e) => setManualForm((f) => ({ ...f, remarks: e.target.value }))}
                    placeholder="Optional notes"
                    className="w-full resize-none rounded-lg border border-[#E4E8EE] px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowAddManual(null)}
                  className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-4 text-[12px] text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={() => handleManualAdd(showAddManual.itemId, showAddManual.partNumber)}
                  disabled={!manualForm.vendor_name.trim() || !manualForm.unit_price || addingManual}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-4 text-[12px] font-semibold text-white disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" }}
                >
                  {addingManual
                    ? <><RefreshCw size={11} className="animate-spin" />Saving…</>
                    : "Save Price"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vendor reply viewer modal */}
        {rawReplyQuote && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 sm:items-center"
               onClick={() => setRawReplyQuote(null)}>
            <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-[#E4E8EE] bg-white shadow-2xl"
                 onClick={(e) => e.stopPropagation()}>
              {/* Email header */}
              <div className="flex items-start justify-between border-b border-[#EEF2F6] px-5 py-4"
                   style={{ background: "linear-gradient(90deg,#F5F8FF,#EEF4FF)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Vendor Reply</p>
                  <p className="text-[14px] font-bold text-slate-900 truncate">{rawReplyQuote.vendor_name || "Unknown Vendor"}</p>
                  {rawReplyQuote.vendor_email && (
                    <p className="text-[11px] text-slate-400 mt-0.5">{rawReplyQuote.vendor_email}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {rawReplyQuote.part_number && (
                      <span className="text-[10px] text-[#1D6FD8] font-semibold">Part: {rawReplyQuote.part_number}</span>
                    )}
                    {rawReplyQuote.unit_price && (
                      <span className="text-[10px] text-slate-500">Price: {formatQuotePrice(rawReplyQuote.unit_price, rawReplyQuote.currency)}</span>
                    )}
                    {rawReplyQuote.lead_time && (
                      <span className="text-[10px] text-slate-500">Lead Time: {rawReplyQuote.lead_time}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setRawReplyQuote(null)}
                  className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
              {/* Email body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {rawReplyQuote.raw_reply ? (
                  (rawReplyQuote.raw_reply_is_html || /<[a-zA-Z][^>]*>/.test(rawReplyQuote.raw_reply)) ? (
                    <div
                      className="text-[12px] leading-relaxed text-slate-700
                        [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-[11px]
                        [&_td]:border [&_td]:border-[#E4E8EE] [&_td]:px-3 [&_td]:py-2
                        [&_th]:border [&_th]:border-[#E4E8EE] [&_th]:px-3 [&_th]:py-2 [&_th]:bg-[#F3F6FC] [&_th]:font-semibold [&_th]:text-left
                        [&_p]:my-2 [&_br]:block [&_div]:my-1
                        [&_a]:text-[#4451E8] [&_a]:underline
                        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                        [&_li]:my-0.5
                        [&_b]:font-semibold [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: rawReplyQuote.raw_reply }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                      {rawReplyQuote.raw_reply}
                    </p>
                  )
                ) : (
                  <p className="text-[12px] text-slate-400 italic">No reply content available.</p>
                )}
                {rawReplyQuote.remarks && (
                  <div className="mt-4 rounded-xl border border-[#E4E8EE] bg-[#FAFBFF] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Remarks</p>
                    <p className="text-[12px] text-slate-700">{rawReplyQuote.remarks}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Horizontal comparison table (when inquiry items are available) ── */}
        {hasItems && (
          <div className="overflow-x-auto rounded-xl border border-[#E4E8EE]">
            <table className="border-collapse text-[11px]" style={{ minWidth: "960px", width: "100%" }}>
              <thead>
                <tr style={{ background: "linear-gradient(90deg,#EEF4FF,#E6EDFC)" }}>
                  {["Brand", "Part No", "Qty", "UOM", "Notes"].map((h) => (
                    <th key={h} className="border-b border-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="border-b border-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]"
                      style={{ minWidth: "380px" }}>
                    Vendor Prices
                  </th>
                  <th className="border-b border-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#B45309] whitespace-nowrap">
                    Your Price ({quoteCurrency})
                  </th>
                  <th className="border-b border-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#B45309] whitespace-nowrap">
                    Lead Time
                  </th>
                  <th className="border-b border-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#B45309] whitespace-nowrap">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {inquiryItems.map((item, rowIdx) => {
                  const pn          = item.partNumber;
                  const itemId      = item.id ?? rowIdx;
                  const rowQuotes   = matchedByItem[pn] || [];
                  const bestId      = rowQuotes.find((q) => Number.isFinite(Number(q.unit_price)) && Number(q.unit_price) > 0)?.id;
                  const isExp       = expandedItems[itemId];
                  const visible     = isExp ? rowQuotes : rowQuotes.slice(0, MAX_V);
                  const hiddenCount = rowQuotes.length - MAX_V;
                  const isSel       = !!selected[itemId];
                  const isLocked    = lockedParts.has(pn);
                  const bg          = isLocked ? "#F0FDF4" : isSel ? "#FFFBEB" : (rowIdx % 2 === 0 ? "white" : "#FAFBFF");

                  return (
                    <tr key={itemId} style={{ background: bg }}
                        className="border-b border-[#EEF2F6] last:border-b-0 align-top">
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.brand || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-bold text-[#1D6FD8]">{pn || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600">{item.quantity ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.uom || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500" style={{ maxWidth: "140px" }}>
                        <span className="block truncate" title={item.itemNotes || ""}>{item.itemNotes || "—"}</span>
                      </td>

                      {/* Vendor price cards */}
                      <td className="px-3 py-2" style={{ minWidth: "380px" }}>
                        <div className="flex flex-wrap gap-2">
                          {visible.map((q) => {
                            const isCurrent  = String(selected[itemId]) === String(q.id);
                            const hasQPO     = !!quickPOMap[q.id];  // keyed by vendor_quote_id
                            const isCreating = poCreating[pn] && isCurrent;
                            return (
                              <div key={q.id}
                                onClick={() => {
                                  if (isLocked) return;
                                  setSelected((prev) => ({ ...prev, [itemId]: q.id }));
                                  setLeadTimes((prev) => prev[itemId] ? prev : { ...prev, [itemId]: q.lead_time || "" });
                                }}
                                className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 transition select-none ${
                                  isLocked
                                    ? "border-green-300 bg-[#F0FDF4] cursor-default"
                                    : isCurrent
                                      ? "border-[#5BA7FF] bg-[#EFF6FF] cursor-pointer"
                                      : "border-[#E4E8EE] bg-white hover:border-[#C7D9F8] hover:bg-[#F5F8FF] cursor-pointer"
                                }`}
                                style={{ minWidth: "110px" }}
                              >
                                <div className="flex items-center gap-1.5">
                                  {/* Visual radio indicator */}
                                  <span className={`h-3 w-3 shrink-0 rounded-full border-2 flex items-center justify-center ${isCurrent ? "border-[#4451E8]" : "border-[#D1D5DB]"}`}>
                                    {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-[#4451E8]" />}
                                  </span>
                                  <span
                                    className="text-[10px] font-semibold text-slate-800 truncate"
                                    style={{ maxWidth: "80px" }}
                                    title={q.raw_reply ? `${q.vendor_name || ""} — double-click to view reply` : (q.vendor_name || "")}
                                    onDoubleClick={(e) => {
                                      if (!q.raw_reply) return;
                                      e.preventDefault(); e.stopPropagation();
                                      setRawReplyQuote(q);
                                    }}
                                  >
                                    {q.vendor_name || "Unknown"}
                                  </span>
                                  {q.source_type === "manual" && (
                                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-600">M</span>
                                  )}
                                  {q.raw_reply && (
                                    <span className="shrink-0 text-[8px] text-slate-300" title="Double-click vendor name to view reply">✉</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 pl-4">
                                  <span className="text-[11px] font-bold text-slate-900">
                                    {formatQuotePrice(q.unit_price, q.currency)}
                                  </span>
                                  {q.id === bestId && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-[#6EE7B7] bg-[#ECFDF5] px-1.5 py-0.5 text-[8px] font-bold text-[#059669]">
                                      <Award size={8} />Best
                                    </span>
                                  )}
                                </div>
                                {q.lead_time && (
                                  <span className="text-[9px] text-slate-400 pl-4 truncate">{q.lead_time}</span>
                                )}
                                {q.remarks && (
                                  <span className="text-[8px] text-amber-600 pl-4 leading-tight" style={{ maxWidth: "110px", whiteSpace: "normal" }} title={q.remarks}>{q.remarks}</span>
                                )}
                                {/* PO created indicator — shown on this vendor's card specifically */}
                                {hasQPO && !isLocked && (
                                  <div className="mt-1 pl-4">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[8px] font-bold text-green-700">
                                      ✓ {quickPOMap[q.id]}
                                    </span>
                                  </div>
                                )}
                                {isCurrent && isCreating && (
                                  <div className="mt-1 pl-4">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-semibold text-amber-600">
                                      Creating…
                                    </span>
                                  </div>
                                )}
                                {isLocked && isCurrent && (
                                  <span className="mt-1 pl-4 text-[8px] font-semibold text-green-600">PO Sent ✓</span>
                                )}
                              </div>
                            );
                          })}

                          {!isExp && hiddenCount > 0 && (
                            <button
                              onClick={() => setExpandedItems((prev) => ({ ...prev, [itemId]: true }))}
                              className="self-start mt-1 text-[10px] font-semibold text-[#4451E8] hover:underline"
                            >
                              +{hiddenCount} more
                            </button>
                          )}
                          {isExp && rowQuotes.length > MAX_V && (
                            <button
                              onClick={() => setExpandedItems((prev) => ({ ...prev, [itemId]: false }))}
                              className="self-start mt-1 text-[10px] font-semibold text-slate-400 hover:underline"
                            >
                              Show less
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setManualForm({ vendor_name: "", vendor_email: "", unit_price: "", currency: quoteCurrency, lead_time: "", availability: "", remarks: "" });
                              setShowAddManual({ itemId, partNumber: pn });
                            }}
                            className="self-start flex items-center gap-1 rounded-lg border border-dashed border-[#C7D9F8] bg-[#F5F8FF] px-2.5 py-2 text-[10px] font-semibold text-[#4451E8] hover:bg-[#EEF4FF] transition whitespace-nowrap"
                          >
                            + Add Price
                          </button>
                        </div>
                      </td>

                      {/* Selling Price */}
                      <td className="px-3 py-2.5">
                        {isLocked ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] font-semibold text-slate-700">{sellingPrices[itemId] || "—"}</span>
                            <span title="Locked — PO already sent" className="text-[10px] text-green-600">🔒</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={sellingPrices[itemId] || ""}
                            onChange={(e) => setSellingPrices((prev) => ({ ...prev, [itemId]: e.target.value }))}
                            placeholder="0.00"
                            disabled={!isSel}
                            className="w-24 rounded-lg border px-2 py-1.5 text-[12px] font-medium text-slate-800 outline-none transition disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
                            style={{ borderColor: isSel ? "#FDE68A" : "#E4E8EE" }}
                          />
                        )}
                      </td>

                      {/* Lead Time */}
                      <td className="px-3 py-2.5">
                        {isLocked ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] text-slate-700">{leadTimes[itemId] || "—"}</span>
                            <span title="Locked — PO already sent" className="text-[10px] text-green-600">🔒</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={leadTimes[itemId] || ""}
                            onChange={(e) => setLeadTimes((prev) => ({ ...prev, [itemId]: e.target.value }))}
                            placeholder="e.g. 2 weeks"
                            disabled={!isSel}
                            className="w-28 rounded-lg border px-2 py-1.5 text-[12px] font-medium text-slate-800 outline-none transition disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
                            style={{ borderColor: isSel ? "#FDE68A" : "#E4E8EE" }}
                          />
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="px-3 py-2.5">
                        <textarea
                          rows={2}
                          value={lineRemarks[itemId] || ""}
                          onChange={(e) => setLineRemarks((prev) => ({ ...prev, [itemId]: e.target.value }))}
                          placeholder="Add remark…"
                          disabled={!isSel}
                          className="w-32 resize-none rounded-lg border px-2 py-1.5 text-[11px] leading-snug text-slate-800 outline-none transition disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
                          style={{ borderColor: isSel ? "#FDE68A" : "#E4E8EE" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Legacy vertical view when no inquiry items exist ── */}
        {!hasItems && partNumbers.map((pn) => {
          const rows   = byPart[pn];
          const bestId = rows.find((q) => Number.isFinite(Number(q.unit_price)) && Number(q.unit_price) > 0)?.id;
          const qty    = itemByPart[pn]?.quantity ?? null;
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
                            <input type="radio" name={`quote-${pn}`}
                              checked={String(selected[pn]) === String(q.id)}
                              onChange={() => {
                                setSelected((prev) => ({ ...prev, [pn]: q.id }));
                                setLeadTimes((prev) => prev[pn] ? prev : { ...prev, [pn]: q.lead_time || "" });
                              }}
                              className="h-3.5 w-3.5 accent-[#4451E8] cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-slate-900">{q.vendor_name || "—"}</p>
                            <p className="text-[10px] text-slate-400">{q.vendor_email || ""}</p>
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
                              <button onClick={() => setExpanded((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                                className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-[#4451E8] transition">
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
                              {q.raw_reply_is_html
                                ? <div className="text-[11px] leading-relaxed text-slate-600 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-[#E4E8EE] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#E4E8EE] [&_th]:px-2 [&_th]:py-1 [&_th]:bg-[#F3F6FC] [&_th]:font-semibold [&_p]:my-1"
                                    dangerouslySetInnerHTML={{ __html: q.raw_reply }} />
                                : <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{q.raw_reply}</p>
                              }
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
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#FDE68A] bg-[#FFFDF5] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Tag size={12} className="text-[#B45309]" />
                      <label className="text-[11px] font-semibold text-[#B45309]">Your Selling Price ({quoteCurrency})</label>
                      <input type="number" value={sellingPrices[pn] || ""}
                        onChange={(e) => setSellingPrices((prev) => ({ ...prev, [pn]: e.target.value }))}
                        placeholder="0.00"
                        className="w-28 rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-[#B45309]">Lead Time</label>
                      <input type="text" value={leadTimes[pn] || ""}
                        onChange={(e) => setLeadTimes((prev) => ({ ...prev, [pn]: e.target.value }))}
                        placeholder="e.g. 15-20 days"
                        className="w-36 rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFDF5] px-3 py-2">
                    <label className="mt-1 text-[11px] font-semibold text-[#B45309] whitespace-nowrap">Remarks</label>
                    <textarea
                      rows={2}
                      value={lineRemarks[pn] || ""}
                      onChange={(e) => setLineRemarks((prev) => ({ ...prev, [pn]: e.target.value }))}
                      placeholder="Add any remark for this part (appears in the quote)…"
                      className="flex-1 resize-none rounded-lg border border-[#FDE68A] bg-white px-2 py-1 text-[12px] text-slate-800 outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Add Note to Client ── */}
        <div className="rounded-2xl border border-[#E4E8EE] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EEF2F6] px-4 py-2.5"
               style={{ background: "linear-gradient(90deg,#F8FAFF,#F3F6FF)" }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add Note to Client</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Optional — appears in the email and PDF sent to client</p>
            </div>
            {clientNote && (
              <button onClick={() => setClientNote("")}
                className="text-[10px] font-semibold text-slate-400 hover:text-red-400 transition">
                Clear
              </button>
            )}
          </div>
          <textarea
            value={clientNote}
            onChange={(e) => setClientNote(e.target.value)}
            rows={3}
            placeholder="Add any clarifications, special instructions, or notes for the client…"
            className="w-full resize-y px-4 py-3 text-[11px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-300"
          />
        </div>

        {/* ── Terms & Conditions ── */}
        <div className="rounded-2xl border border-[#E4E8EE] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EEF2F6] px-4 py-2.5"
               style={{ background: "linear-gradient(90deg,#F8FAFF,#F3F6FF)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Terms &amp; Conditions</p>
            <button
              onClick={() => setTermsText(DEFAULT_TERMS)}
              className="text-[10px] font-semibold text-slate-400 hover:text-[#4451E8] transition"
            >
              Reset to default
            </button>
          </div>
          <textarea
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            rows={8}
            placeholder="Enter terms and conditions (one per line)…"
            className="w-full resize-y px-4 py-3 text-[11px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-300"
          />
          <p className="border-t border-[#EEF2F6] px-4 py-1.5 text-[10px] text-slate-400">
            Each line becomes a numbered term in the PDF. Edits are included when the quotation is sent.
          </p>
        </div>

        {/* ── Unmatched vendor quotes (prices whose part# didn't match any item) ── */}
        {hasItems && unmatchedQuotes.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">
                Unmatched Prices ({unmatchedQuotes.length})
              </p>
              <p className="text-[11px] text-slate-400">
                — vendor part numbers that didn&apos;t match any inquiry item. Assign below.
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#FDE68A]">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr style={{ background: "#FFFBEB" }}>
                    {["Vendor", "Vendor Part No", "Price", "Lead Time", "Assign to Inquiry Item", ""].map((h) => (
                      <th key={h} className="border-b border-[#FDE68A] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-amber-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unmatchedQuotes.map((q) => (
                    <tr key={q.id} className="border-b border-[#FDE68A]/40 last:border-b-0 bg-white">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-800">{q.vendor_name || "—"}</p>
                        <p className="text-[10px] text-slate-400">{q.vendor_email || ""}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{q.part_number || "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{formatQuotePrice(q.unit_price, q.currency)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{q.lead_time || "—"}</td>
                      <td className="px-3 py-2.5">
                        <select
                          value={unmatchedAssign[q.id] || ""}
                          onChange={(e) => setUnmatchedAssign((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          className="h-7 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]"
                        >
                          <option value="">— select item —</option>
                          {inquiryItems.map((it) => (
                            <option key={it.partNumber} value={it.partNumber}>{it.partNumber}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleAssignUnmatched(q.id)}
                          disabled={!unmatchedAssign[q.id] || savingAssign === q.id}
                          className="flex h-7 items-center gap-1 rounded-lg border border-[#5BA7FF] bg-[#EFF6FF] px-3 text-[10px] font-semibold text-[#1D6FD8] hover:bg-[#DBEAFE] transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingAssign === q.id
                            ? <RefreshCw size={10} className="animate-spin" />
                            : <Check size={10} />}
                          Assign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom action bar (unchanged) ── */}
      <div className="shrink-0 border-t border-[#EEF2F6] bg-white px-5 py-3">
        {!sentOk && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-500">Salesperson</label>
              <input type="text" value={salesperson}
                onChange={(e) => { salespersonEditedRef.current = true; setSalesperson(e.target.value); }}
                placeholder="Your name"
                className="w-32 rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-500">Quote Currency</label>
              <select value={quoteCurrency} onChange={(e) => setQuoteCurrency(e.target.value)}
                className="h-7 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10 cursor-pointer">
                {["INR", "USD", "EUR", "AED", "GBP", "JPY", "THB", "SGD", "CNY", "MYR"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-500">GST</label>
              <select value={GST_OPTIONS.indexOf(gstOption)} onChange={(e) => setGstOption(GST_OPTIONS[Number(e.target.value)])}
                className="h-7 rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10 cursor-pointer">
                {GST_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
              </select>
            </div>
            {gstOption.type === "CUSTOM" && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-slate-500">Tax Name</label>
                <input type="text" value={customTaxName} onChange={(e) => setCustomTaxName(e.target.value)}
                  placeholder="e.g. TCS"
                  className="w-24 rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                />
                <label className="text-[11px] font-semibold text-slate-500">Tax %</label>
                <input type="number" min="0" step="0.01" value={customTaxRate} onChange={(e) => setCustomTaxRate(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-20 rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                />
              </div>
            )}
            {readyLines.length > 0 && (() => {
              const g = calcGst(readyLines, gstOption, customTax);
              const fmtAmt = (v) => `${quoteCurrency} ${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div className="flex items-center gap-3 rounded-lg border border-[#FDE68A] bg-[#FFFDF5] px-3 py-1.5">
                  {gstOption.type === "CGST_SGST" && (
                    <span className="text-[11px] text-slate-500">
                      CGST {gstOption.rate / 2}%: <span className="font-semibold text-slate-700">{fmtAmt(g.cgst)}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      SGST {gstOption.rate / 2}%: <span className="font-semibold text-slate-700">{fmtAmt(g.sgst)}</span>
                    </span>
                  )}
                  {gstOption.type === "IGST" && (
                    <span className="text-[11px] text-slate-500">
                      IGST {gstOption.rate}%: <span className="font-semibold text-slate-700">{fmtAmt(g.igst)}</span>
                    </span>
                  )}
                  {(gstOption.type === "NONE" || gstOption.type === "EXPORT") && (
                    <span className="text-[11px] text-slate-500">GST: <span className="font-semibold text-slate-700">{quoteCurrency} 0.00</span></span>
                  )}
                  {gstOption.type === "CUSTOM" && (
                    isCustomTaxValid(customTax) ? (
                      <span className="text-[11px] text-slate-500">
                        {customTaxName.trim() || "Custom Tax"} @ {parseFloat(String(customTaxRate).replace(/[^0-9.]/g, "")) || 0}%:{" "}
                        <span className="font-semibold text-slate-700">{fmtAmt(g.customAmount)}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-rose-500">Enter tax name &amp; valid %</span>
                    )
                  )}
                  <span className="text-[11px] text-slate-300">|</span>
                  <span className="text-[12px] font-bold text-[#B45309]">Total: {fmtAmt(g.grandTotal)}</span>
                </div>
              );
            })()}
          </div>
        )}

        {!sentOk && priorQuotationCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 mb-2.5">
            <RefreshCw size={13} className="shrink-0 text-[#B45309]" />
            <p className="text-[11px] font-medium text-[#92400E]">
              A quotation already exists for this inquiry. Sending now will create revised quotation{" "}
              <span className="font-bold">R{priorQuotationCount}</span>.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            {sentOk ? (
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#059669]">
                <CheckCircle2 size={13} />
                Quotation {sentInfo?.quotation_number || ""} sent to client
                {sentInfo?.amendment_code && (
                  <span className="ml-1 rounded-full border border-[#C4B5FD] bg-[#F5F3FF] px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                    Revision {sentInfo.amendment_code}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[12px] text-slate-400">
                {readyLines.length > 0
                  ? `${readyLines.length} of ${totalParts} part${totalParts !== 1 ? "s" : ""} priced`
                  : "Select a vendor quote and enter your selling price for each part"}
              </p>
            )}
            {sendError && <p className="text-[11px] text-rose-500 mt-0.5">{sendError}</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* Create Purchase Orders button — shown when at least one vendor is selected */}
            {Object.values(selected).some(Boolean) && (
              <button
                onClick={() => setShowBatchPOForm(true)}
                className="flex h-9 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 transition"
              >
                <ShoppingCart size={13} />
                Create Purchase Orders ({Object.values(selected).filter(Boolean).length})
              </button>
            )}
            {!sentOk && (
              <button
                onClick={() => setShowPreview(true)}
                disabled={readyLines.length === 0 || !salesperson.trim() || (gstOption.type === "CUSTOM" && !isCustomTaxValid(customTax))}
                title={
                  !salesperson.trim() ? "Enter the salesperson name first"
                  : (gstOption.type === "CUSTOM" && !isCustomTaxValid(customTax)) ? "Enter a valid custom tax name and percentage first"
                  : ""
                }
                className="flex h-9 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
              >
                <Send size={13} />
                {priorQuotationCount > 0
                  ? (inquiry.sender_email ? `Preview Revision R${priorQuotationCount}` : `Preview & Download Revision R${priorQuotationCount}`)
                  : (inquiry.sender_email ? "Preview & Send Quote" : "Preview & Download Quote")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Batch Purchase Orders Form Modal ── */}
      {showBatchPOForm && (() => {
        const selectedEntries = Object.entries(selected).filter(([, qId]) => qId);
        const vendorSummary = selectedEntries.map(([pn, qId]) => {
          const q = quotes.find((q) => String(q.id) === String(qId));
          return { pn, vendorName: q?.vendor_name || "Unknown", vendorEmail: q?.vendor_email || "" };
        });
        const showRate = batchPOForm.gst_type === "IGST" || batchPOForm.gst_type === "CGST_SGST";
        const setBF = (k, v) => setBatchPOForm((f) => ({ ...f, [k]: v }));
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !batchPOCreating && setShowBatchPOForm(false)} />
            <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
                 style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.22)" }}>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#EEF2F6] px-5 py-4"
                   style={{ background: "linear-gradient(90deg,#FFFBEB,#FFF7E6)" }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">Purchase Orders</p>
                  <h3 className="text-[15px] font-bold text-slate-900 mt-0.5">Create Purchase Orders</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedEntries.length} vendor{selectedEntries.length !== 1 ? "s" : ""} · {inquiry.unique_code}
                  </p>
                </div>
                <button onClick={() => setShowBatchPOForm(false)} disabled={batchPOCreating}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] transition">
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Vendor summary */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">POs will be created for</p>
                  <div className="space-y-1.5">
                    {vendorSummary.map(({ pn, vendorName, vendorEmail }) => (
                      <div key={pn} className="flex items-center gap-2.5 rounded-lg border border-[#E4E9F5] bg-[#FAFBFF] px-3 py-2">
                        <span className="text-[11px] font-semibold text-[#1D6FD8] min-w-[100px]">{pn}</span>
                        <span className="text-[11px] text-slate-700">{vendorName}</span>
                        {vendorEmail && <span className="text-[10px] text-slate-400 ml-auto">{vendorEmail}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    If multiple parts share the same vendor, they will be grouped into one PO automatically.
                  </p>
                </div>

                {/* PO Settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sales Representative</label>
                    <input value={batchPOForm.sales_representative} onChange={(e) => setBF("sales_representative", e.target.value)}
                      className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">PO Currency</label>
                    <select value={batchPOForm.currency} onChange={(e) => setBF("currency", e.target.value)}
                      className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#F59E0B] focus:outline-none bg-white">
                      {["INR", "USD", "EUR", "AED", "GBP", "JPY", "THB", "SGD", "CNY", "MYR"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">GST / Tax</label>
                    <select value={batchPOForm.gst_type} onChange={(e) => {
                      const opt = GST_OPTIONS.find((o) => o.type === e.target.value);
                      setBF("gst_type", e.target.value);
                      if (opt?.rate) setBF("gst_rate", String(opt.rate));
                      else setBF("gst_rate", "0");
                    }}
                      className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#F59E0B] focus:outline-none bg-white">
                      <option value="NONE">No GST / Exempt</option>
                      <option value="IGST">IGST (Interstate)</option>
                      <option value="CGST_SGST">CGST + SGST (Intrastate)</option>
                      <option value="EXPORT">Export / LUT (0%)</option>
                    </select>
                  </div>
                  {showRate && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Rate (%)
                        {batchPOForm.gst_type === "CGST_SGST" && (
                          <span className="ml-1 font-normal text-slate-400">CGST {Number(batchPOForm.gst_rate)/2}% + SGST {Number(batchPOForm.gst_rate)/2}%</span>
                        )}
                      </label>
                      <input type="number" value={batchPOForm.gst_rate} onChange={(e) => setBF("gst_rate", e.target.value)}
                        min="0" max="100" step="0.5"
                        className="w-full rounded-lg border border-[#E4E9F5] px-2.5 py-1.5 text-[12px] focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Terms & Conditions */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Terms &amp; Conditions</label>
                    <button onClick={() => setBF("terms_text", `Payment Terms: 20% advance with the purchase order, and the remaining 80% prior to shipment.\nDispatch Schedule: As per Quotation\nWarranty: One year from the date the goods arrive to us.\nRemarks: Delivery at Shipping address\nNote: Goods should be Original & Genuine`)}
                      className="text-[10px] text-slate-400 hover:text-amber-600 transition">Reset</button>
                  </div>
                  <textarea value={batchPOForm.terms_text} onChange={(e) => setBF("terms_text", e.target.value)}
                    rows={5} placeholder="One term per line…"
                    className="w-full rounded-lg border border-[#E4E9F5] px-3 py-2 text-[11px] leading-relaxed resize-y focus:border-[#F59E0B] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Each line becomes a bullet point in the PDF.</p>
                </div>

                {batchPOError && (
                  <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-600">{batchPOError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-[#EEF2F6] px-5 py-4">
                <p className="text-[11px] text-slate-400">
                  POs will be saved as drafts. You can edit and send them from the <strong>Purchase Orders</strong> tab.
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowBatchPOForm(false)} disabled={batchPOCreating}
                    className="h-9 rounded-xl border border-[#E4E9F5] bg-white px-4 text-[12px] font-medium text-slate-700 hover:bg-[#F3F5F7] transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleBatchCreatePOs} disabled={batchPOCreating}
                    className="flex h-9 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#F59E0B,#FBBF24)", boxShadow: "0 2px 8px rgba(245,158,11,0.28)" }}>
                    <ShoppingCart size={13} />
                    {batchPOCreating ? "Creating…" : `Create ${selectedEntries.length} PO${selectedEntries.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Quotation Preview Modal ── */}
      {showPreview && (() => {
        const g = calcGst(readyLines, gstOption, customTax);
        const fmtAmt = (v) => `${quoteCurrency} ${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const termLines = termsText.split("\n").map((t) => t.trim()).filter(Boolean);
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !sending && setShowPreview(false)} />
            <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
                 style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.22)" }}>

              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#EEF2F6] px-5 py-4"
                   style={{ background: "linear-gradient(90deg,#F5F8FF,#F0F6FF)" }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {inquiry.sender_email ? "Review before sending" : "Review before downloading"}
                  </p>
                  <h3 className="text-[15px] font-bold text-slate-900 mt-0.5">Quotation Preview</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    For: <span className="font-semibold text-slate-600">{inquiry.client_name || inquiry.sender_name || "Client"}</span>
                    {inquiry.sender_email
                      ? <span className="ml-1 text-slate-400">({inquiry.sender_email})</span>
                      : <span className="ml-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Portal client · PDF only</span>}
                  </p>
                </div>
                <button onClick={() => setShowPreview(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] transition">
                  <X size={15} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                {/* Line items */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Line Items</p>
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr style={{ background: "#EEF4FF" }}>
                        {["#", "Part Number", "Description (editable)", "Qty", "Lead Time", "Unit Price", "Amount"].map((h) => (
                          <th key={h} className="border border-[#D0DCF4] px-2.5 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {readyLines.map((l, i) => {
                        const amt = (Number(l.quantity) || 1) * Number(l.selling_price || 0);
                        return (
                          <tr key={i} className="border-b border-[#EEF2F6]">
                            <td className="border border-[#E4E8EE] px-2.5 py-2 text-slate-500">{i + 1}</td>
                            <td className="border border-[#E4E8EE] px-2.5 py-2 font-semibold text-slate-900">{l.part_number || "—"}</td>
                            <td className="border border-[#E4E8EE] px-1.5 py-1.5">
                              <input
                                type="text"
                                value={l.description ?? ""}
                                onChange={(e) => setLineDescriptions((prev) => ({ ...prev, [l.item_id]: e.target.value }))}
                                placeholder="Enter description…"
                                className="w-full min-w-[140px] rounded border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-slate-700 outline-none hover:border-[#D0DCF4] focus:border-[#5BA7FF] focus:bg-white focus:ring-1 focus:ring-[#5BA7FF]/20 placeholder:text-slate-300"
                              />
                            </td>
                            <td className="border border-[#E4E8EE] px-2.5 py-2 text-slate-700">{l.quantity || "—"}</td>
                            <td className="border border-[#E4E8EE] px-2.5 py-2 text-slate-600">{l.lead_time || "—"}</td>
                            <td className="border border-[#E4E8EE] px-2.5 py-2 text-right font-medium text-slate-800">
                              {quoteCurrency} {Number(l.selling_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="border border-[#E4E8EE] px-2.5 py-2 text-right font-semibold text-slate-900">
                              {fmtAmt(amt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-1 rounded-xl border border-[#E4E8EE] bg-[#FAFBFF] px-4 py-3 text-[12px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Taxable Amount</span><span className="font-medium text-slate-700">{fmtAmt(g.taxable)}</span>
                    </div>
                    {gstOption.type === "CGST_SGST" && <>
                      <div className="flex justify-between text-slate-500"><span>CGST @ {gstOption.rate/2}%</span><span>{fmtAmt(g.cgst)}</span></div>
                      <div className="flex justify-between text-slate-500"><span>SGST @ {gstOption.rate/2}%</span><span>{fmtAmt(g.sgst)}</span></div>
                    </>}
                    {gstOption.type === "IGST" && <div className="flex justify-between text-slate-500"><span>IGST @ {gstOption.rate}%</span><span>{fmtAmt(g.igst)}</span></div>}
                    {gstOption.type === "CUSTOM" && <div className="flex justify-between text-slate-500"><span>{customTax?.name || "Tax"} @ {customTax?.rate || 0}%</span><span>{fmtAmt(g.customAmount)}</span></div>}
                    {(gstOption.type === "NONE" || gstOption.type === "EXPORT") && <div className="flex justify-between text-slate-500"><span>GST</span><span>0.00</span></div>}
                    <div className="flex justify-between border-t border-[#E4E8EE] pt-1.5 font-bold text-slate-900">
                      <span>Grand Total</span><span className="text-[#B45309]">{fmtAmt(g.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* T&C preview */}
                {termLines.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Terms &amp; Conditions</p>
                    <ol className="space-y-1 rounded-xl border border-[#E4E8EE] bg-[#FAFBFF] px-5 py-3 text-[11px] leading-relaxed text-slate-600 list-decimal">
                      {termLines.map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  </div>
                )}

                {sendError && (
                  <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{sendError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-[#EEF2F6] px-5 py-4">
                <p className="text-[11px] text-slate-400">
                  {priorQuotationCount > 0
                    ? <><span className="font-semibold text-amber-600">Revision R{priorQuotationCount}</span> will be created.</>
                    : inquiry.sender_email
                      ? "This will send the quotation email and attach a PDF."
                      : "Quotation will be saved and the PDF will download — no email sent."}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowPreview(false); setSendError(""); }}
                    disabled={sending || downloading}
                    className="h-9 rounded-xl border border-[#E4E8EE] bg-white px-4 text-[12px] font-medium text-slate-700 transition hover:bg-[#F3F5F7] disabled:opacity-50">
                    Go Back
                  </button>
                  {inquiry.sender_email ? (
                    <button onClick={sendQuote} disabled={sending}
                      className="flex h-9 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}>
                      {sending
                        ? <><RefreshCw size={13} className="animate-spin" />Sending…</>
                        : <><Send size={13} />Confirm &amp; Send</>}
                    </button>
                  ) : (
                    <button onClick={downloadQuote} disabled={downloading}
                      className="flex h-9 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#F59E0B,#FBBF24)", boxShadow: "0 2px 8px rgba(245,158,11,0.28)" }}>
                      {downloading
                        ? <><RefreshCw size={13} className="animate-spin" />Saving…</>
                        : <><FileText size={13} />Save &amp; Download PDF</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main modal
───────────────────────────────────────────── */
export default function InquiryDetailModal({ inquiry, onClose, onBlockClient, onPricesSeen }) {
  const [activeTab,          setActiveTab]          = useState("details");
  const [draftsFromGenerate, setDraftsFromGenerate] = useState(null);

  const status = inquiry.status || "new";

  const handleBlock = () => {
    if (!inquiry.sender_email) { alert("This inquiry has no sender email to block."); return; }
    if (!confirm("Are you sure you want to block this client? Future inquiries from this email will not appear in the dashboard.")) return;
    onBlockClient?.(inquiry.sender_email, inquiry.client_name);
  };

  const handleDraftsGenerated = (drafts) => {
    setDraftsFromGenerate(drafts);
    setActiveTab("drafts");
  };

  // Reset drafts state when switching away from drafts tab so re-opening fetches fresh.
  // Mark vendor prices as seen when user opens the Reply to Client tab.
  const handleTabChange = (tabId) => {
    if (activeTab === "drafts" && tabId !== "drafts") setDraftsFromGenerate(null);
    if (tabId === "quotes") onPricesSeen?.();
    setActiveTab(tabId);
  };

  const TABS = [
    { id: "details", label: "Details",         Icon: FileText      },
    { id: "vendors", label: "Vendors",          Icon: Store         },
    { id: "drafts",  label: "Drafts",           Icon: Mail          },
    { id: "quotes",  label: "Reply to Client",  Icon: Tag           },
    { id: "po",      label: "Purchase Orders",  Icon: ShoppingCart  },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
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
          {activeTab === "po" && (
            <PurchaseOrdersTab inquiry={inquiry} />
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
  );
}
