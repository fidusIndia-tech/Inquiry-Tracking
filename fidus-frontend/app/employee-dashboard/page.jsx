"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InquiryDetailModal from "@/app/components/InquiryDetailModal";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";

const PORTAL_BASE_EMP = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://practical-amazement-production-3539.up.railway.app").replace(/\/$/, "");

function AppSwitcherEmp() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const goToPortal = async () => {
    setOpen(false);
    try {
      const userId = localStorage.getItem("userId");
      const res = await fetch(`/api/auth/portal-token?userId=${encodeURIComponent(userId || "")}`);
      const data = await res.json();
      if (data.redirect_url) { window.location.href = data.redirect_url; return; }
    } catch {}
    window.location.href = `${PORTAL_BASE_EMP}/dashboard`;
  };

  const apps = [
    { id: "price-desk",      label: "PriceDesk",      emoji: "💹" },
    { id: "inquiry-tracker", label: "InquiryTracker",  emoji: "📨" },
    { id: "lead-clip",       label: "LeadFlow",        emoji: "🎯" },
    { id: "tender-ai",       label: "TenderAI",        emoji: "📄" },
    { id: "crm",             label: "CRM",             emoji: "🤝" },
  ];

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Switch app"
        className="flex h-7 items-center gap-1.5 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] font-medium text-slate-500 transition hover:bg-[#EEF2FF] hover:text-[#4451E8] hover:border-[#BFDBFE]"
      >
        <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
          {[0,1,2].map(r => [0,1,2].map(c => (
            <rect key={`${r}-${c}`} x={c*5} y={r*5} width="3" height="3" rx="0.7" fill="currentColor" />
          )))}
        </svg>
        <span className="hidden sm:inline">Apps</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, right: pos.right,
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: "8px 6px", minWidth: 190,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.07)",
            zIndex: 99999,
          }}
        >
          <p style={{ fontSize: 10, color: "#94a3b8", padding: "2px 10px 8px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            Switch app
          </p>
          {apps.map((app) => (
            <a
              key={app.id}
              href={`${PORTAL_BASE_EMP}/go?app=${app.id}`}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 9, textDecoration: "none", color: "#0f172a", fontSize: 13, fontWeight: 600 }}
              className="hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              <span style={{ fontSize: 16 }}>{app.emoji}</span>
              {app.label}
            </a>
          ))}
          <div style={{ height: 1, background: "#f1f5f9", margin: "6px 4px" }} />
          <button
            onClick={goToPortal}
            style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 9, color: "#64748b", fontSize: 12, fontWeight: 500, width: "100%", background: "none", border: "none", cursor: "pointer" }}
            className="hover:bg-slate-50 transition-colors"
          >
            🏠 FidusSource Portal
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

const STATUS_OPTIONS = [
  { value: "assigned",    label: "Assigned"    },
  { value: "in_progress", label: "In Progress" },
  { value: "quoted",      label: "Quoted"      },
  { value: "converted",   label: "Converted"   },
  { value: "lost",        label: "Lost"        },
];

const STATUS_COLORS = {
  assigned:    { text: "#4451E8", bg: "#EEF0FF", border: "#A5B4FC" },
  in_progress: { text: "#059669", bg: "#EFFAF6", border: "#6EE7B7" },
  quoted:      { text: "#6D28D9", bg: "#F5F3FF", border: "#C4B5FD" },
  converted:   { text: "#047857", bg: "#ECFDF5", border: "#6EE7B7" },
  lost:        { text: "#BE123C", bg: "#FFF1F2", border: "#FECDD3" },
};

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeId,            setEmployeeId]            = useState(null);
  const [employeeName,          setEmployeeName]          = useState("Employee");
  const [inquiries,             setInquiries]             = useState([]);
  const [statusDrafts,          setStatusDrafts]          = useState({});
  const [search,                setSearch]                = useState("");
  const [loading,               setLoading]               = useState(true);
  const [saving,                setSaving]                = useState(false);
  const [error,                 setError]                 = useState("");
  const [notice,                setNotice]                = useState("");
  const [notificationsEnabled,  setNotificationsEnabled]  = useState(false);
  // Stores the unique_code only, never a snapshot of the inquiry object —
  // the actual data passed to the modal is re-derived from `inquiries` on
  // every render (below), so background refreshes (SSE/poll) keep an
  // already-open modal showing live data instead of whatever existed at
  // the moment it was opened.
  const [detailModalCode,       setDetailModalCode]       = useState(null);
  const [expandedCodes,         setExpandedCodes]         = useState(new Set());
  const knownAssignmentsRef = useRef(new Map());
  const firstLoadRef        = useRef(true);

  const loadInquiries = useCallback(async (userId, options = {}) => {
    const silent = Boolean(options.silent);
    if (!silent) setLoading(true);
    setError("");
    if (!silent) setNotice("");
    try {
      const url  = userId ? `/api/inquiries?userId=${encodeURIComponent(userId)}` : "/api/inquiries";
      const res  = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load assigned inquiries");

      const assigned = (data.inquiries || []).filter(
        (item) => Number(item.assigned_to) === Number(userId)
      );

      if (!firstLoadRef.current && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        assigned.forEach((item) => {
          const prev = knownAssignmentsRef.current.get(item.unique_code);
          const curr = item.assigned_at || "";
          if (!prev || prev !== curr) {
            const title = "New inquiry assigned";
            const opts  = { body: `${item.unique_code} ${item.client_name || item.sender_name || ""}`.trim(), tag: item.unique_code, requireInteraction: true, icon: "/logo-dark.png" };
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => new Notification(title, opts));
            } else {
              new Notification(title, opts);
            }
          }
        });
      }

      knownAssignmentsRef.current = new Map(assigned.map((item) => [item.unique_code, item.assigned_at || ""]));
      firstLoadRef.current = false;
      setInquiries(assigned);
      setStatusDrafts(Object.fromEntries(assigned.map((item) => [item.unique_code, item.status || "assigned"])));
    } catch (err) {
      setError(err.message || "Failed to load assigned inquiries");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employeeId) return undefined;
    const es    = new EventSource("/api/inquiries/stream");
    es.onmessage = () => loadInquiries(employeeId, { silent: true });
    const timer  = window.setInterval(() => loadInquiries(employeeId, { silent: true }), 30000);
    return () => { es.close(); window.clearInterval(timer); };
  }, [employeeId, loadInquiries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((p) => setNotificationsEnabled(p === "granted"));
      } else {
        setNotificationsEnabled(Notification.permission === "granted");
      }
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const role          = localStorage.getItem("role");
      const storedUserId  = localStorage.getItem("userId");
      const storedName    = localStorage.getItem("userName");
      if (role !== "employee" || !storedUserId) { router.push("/login"); return; }
      const id = Number(storedUserId);
      setEmployeeId(id);
      setEmployeeName(storedName || "Employee");
      loadInquiries(id);
    }, 0);
    return () => window.clearTimeout(t);
  }, [router, loadInquiries]);

  const toggleExpand = useCallback((code) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const handlePricesSeen = useCallback(async (uniqueCode) => {
    if (!uniqueCode || !employeeId) return;
    setInquiries((current) =>
      current.map((inq) =>
        inq.unique_code === uniqueCode ? { ...inq, has_unseen_prices: false } : inq
      )
    );
    try {
      await fetch("/api/inquiries/prices-seen", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, user_id: Number(employeeId) }),
      });
    } catch {}
  }, [employeeId]);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    const filtered = text
      ? inquiries.filter((inq) => {
          const items = inq.items?.length ? inq.items : [{}];
          return [inq.unique_code, inq.client_name, inq.location, inq.sender_name, inq.subject,
            ...items.flatMap((it) => [it.brand, it.partNumber])
          ].join(" ").toLowerCase().includes(text);
        })
      : inquiries;

    return filtered.flatMap((inquiry) => {
      const items = inquiry.items?.length ? inquiry.items : [{}];
      const isExpanded = expandedCodes.has(inquiry.unique_code);
      const visible = isExpanded ? items : [items[0]];
      return visible.map((item, index) => ({
        rowKey:              `${inquiry.unique_code}-${item?.id || index}`,
        unique_code:         inquiry.unique_code,
        vendor_price_count:  inquiry.vendor_price_count,
        has_unseen_prices:   Boolean(inquiry.has_unseen_prices),
        email_date:       inquiry.email_date,
        client_name:      inquiry.client_name  || "-",
        location:         inquiry.location     || "-",
        sender_name:      inquiry.sender_name  || "-",
        subject:          inquiry.subject      || "-",
        status:           inquiry.status       || "assigned",
        remark:           inquiry.remark       || "",
        isFirstItem:      index === 0,
        isChildRow:       isExpanded && index > 0,
        isExpanded,
        groupSize:        items.length,
        brand:            item?.brand           || "-",
        part_number:      item?.partNumber      || "-",
        quantity:         item?.quantity        ?? "-",
        uom:              item?.uom             || "-",
        item_notes:       item?.itemNotes       || "-",
      }));
    });
  }, [inquiries, search, expandedCodes]);

  const changedStatuses = useMemo(
    () => inquiries.filter((item) => statusDrafts[item.unique_code] && statusDrafts[item.unique_code] !== item.status),
    [inquiries, statusDrafts]
  );

  const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://practical-amazement-production-3539.up.railway.app").replace(/\/$/, "");

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    window.location.href = PORTAL_URL + "/login";
  };

  const openDetail = (uniqueCode) => {
    setDetailModalCode(uniqueCode);
  };
  const detailModal = detailModalCode
    ? inquiries.find((i) => i.unique_code === detailModalCode) || null
    : null;

  const updateDraftStatus = (uniqueCode, value) => {
    setNotice("");
    setStatusDrafts((prev) => ({ ...prev, [uniqueCode]: value }));
  };

  const saveStatuses = async () => {
    if (!changedStatuses.length) { setNotice("No status changes to save."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await Promise.all(
        changedStatuses.map(async (item) => {
          const res  = await fetch("/api/inquiries/status", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ unique_code: item.unique_code, status: statusDrafts[item.unique_code], changed_by: employeeId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to save status");
        })
      );
      setNotice("Status updated successfully.");
      await loadInquiries(employeeId);
    } catch (err) {
      setError(err.message || "Failed to save status");
    } finally {
      setSaving(false);
    }
  };

  const enableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) { setNotice("Browser notifications are not supported here."); return; }
    const perm = await Notification.requestPermission();
    setNotificationsEnabled(perm === "granted");
    setNotice(perm === "granted" ? "Notifications enabled." : "Notifications blocked by browser.");
  };

  return (
    <div className="min-h-screen text-slate-900 dashboard-bg flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      {/* ── Top bar ── */}
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-[#D0D8F0] px-4"
        style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <Image src="/logo-dark.png" alt="FIAPL" width={110} height={36} className="h-7 w-auto object-contain shrink-0" priority />
          <div className="h-5 w-px bg-[#D8E3F8]" />
          <button
            className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            <LayoutDashboard size={12} />
            Dashboard
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="hidden sm:flex h-8 min-w-48 items-center gap-2 rounded-lg border border-[#E4E8EE] bg-white px-3 transition focus-within:border-[#5BA7FF] focus-within:ring-2 focus-within:ring-[#5BA7FF]/10"
          >
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, client, part…"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => employeeId && loadInquiries(employeeId)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4E8EE] bg-white text-slate-600 transition hover:bg-[#F3F5F7]"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={enableNotifications}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4E8EE] bg-white transition hover:bg-[#F3F5F7] ${notificationsEnabled ? "text-emerald-600" : "text-slate-500"}`}
            title={notificationsEnabled ? "Notifications on" : "Enable notifications"}
          >
            <Bell size={13} />
          </button>
          <AppSwitcherEmp />
          <div className="h-5 w-px bg-[#D8E3F8]" />
          <button
            onClick={handleLogout}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-auto p-4 lg:p-5">
            {/* Metric cards */}
            <section className="mb-4 flex gap-3">
              <MetricCard icon={<FileText size={15} />}     label="Assigned"     value={loading ? "—" : inquiries.length} accent="blue"   />
              <MetricCard icon={<LayoutDashboard size={15}/>} label="Line Items"  value={loading ? "—" : rows.length}      accent="indigo" />
              <MetricCard icon={<Clock3 size={15} />}       label="Pending Save" value={loading ? "—" : changedStatuses.length} accent={changedStatuses.length > 0 ? "amber" : "mint"} />
            </section>

            {/* Table card */}
            <section
              className="overflow-hidden rounded-2xl"
              style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}
            >
              {/* Card header */}
              <div
                className="flex flex-col gap-3 border-b border-[#D8E3F8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ background: "linear-gradient(90deg,#F5F8FF 0%,#F0F6FF 100%)" }}
              >
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Inquiry Information</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Update status for inquiries assigned to you · {rows.length} line items
                  </p>
                </div>

                <button
                  onClick={saveStatuses}
                  disabled={saving || changedStatuses.length === 0}
                  className="flex h-9 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
                >
                  {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  {saving ? "Saving…" : `Save${changedStatuses.length > 0 ? ` (${changedStatuses.length})` : ""}`}
                </button>
              </div>

              {/* Notices */}
              {error && (
                <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-[12px] font-medium text-rose-700">{error}</div>
              )}
              {notice && (
                <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-5 py-2.5 text-[12px] font-medium text-emerald-700">
                  <CheckCircle2 size={14} />
                  {notice}
                </div>
              )}

              <EmployeeTable
                rows={rows}
                loading={loading}
                statusDrafts={statusDrafts}
                originalStatuses={Object.fromEntries(inquiries.map((i) => [i.unique_code, i.status]))}
                onStatusChange={updateDraftStatus}
                onDetailOpen={openDetail}
                onToggleExpand={toggleExpand}
              />
            </section>
      </main>

      {detailModal && (
        <InquiryDetailModal
          inquiry={detailModal}
          onClose={() => setDetailModalCode(null)}
          onPricesSeen={() => handlePricesSeen(detailModal.unique_code)}
        />
      )}
    </div>
  );
}

/* ── Metric Card ── */
const ACCENT = {
  blue:   { grad: "linear-gradient(135deg,#EFF6FF,#DBEAFE)", icon: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", text: "#1D6FD8", glow: "rgba(91,167,255,0.18)"  },
  indigo: { grad: "linear-gradient(135deg,#EEF0FF,#C7D2FE)", icon: "linear-gradient(135deg,#818CF8,#6D7CFF)", text: "#4451E8", glow: "rgba(129,140,248,0.18)" },
  mint:   { grad: "linear-gradient(135deg,#EFFAF6,#A7F3D0)", icon: "linear-gradient(135deg,#7FD8BE,#34D399)", text: "#059669", glow: "rgba(127,216,190,0.18)" },
  amber:  { grad: "linear-gradient(135deg,#FFFBEB,#FDE68A)", icon: "linear-gradient(135deg,#F59E0B,#D97706)", text: "#B45309", glow: "rgba(245,158,11,0.18)"  },
};

function MetricCard({ icon, label, value, accent = "blue", delay = "0ms" }) {
  const a = ACCENT[accent] || ACCENT.blue;
  return (
    <div
      className="flex-1 rounded-2xl p-4 animate-modal"
      style={{ background: a.grad, boxShadow: `0 0 0 1px ${a.glow}, 0 4px 16px ${a.glow}`, animationDelay: delay }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: a.icon, boxShadow: `0 2px 8px ${a.glow}` }}
        >
          <span style={{ color: "white" }}>{icon}</span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: a.text }}>{label}</p>
          <p className="text-[22px] font-bold leading-tight" style={{ color: a.text }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Employee Table ── */
function EmpRemarkCell({ uniqueCode, initialRemark }) {
  const [value, setValue] = useState(initialRemark);
  const savedRef = useRef(initialRemark);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(initialRemark);
    savedRef.current = initialRemark;
  }, [initialRemark]);

  const handleBlur = async () => {
    if (value === savedRef.current) return;
    try {
      const res = await fetch("/api/inquiries/remark", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, remark: value }),
      });
      if (res.ok) {
        savedRef.current = value;
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        rows={2}
        placeholder="Add remark…"
        className="w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-slate-700 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10 focus:bg-white placeholder:text-slate-300"
      />
      {saved && (
        <span className="absolute right-1 top-0.5 text-[10px] text-emerald-500 font-semibold">Saved ✓</span>
      )}
    </div>
  );
}

const EMP_COLS = [
  { label: "Code",        defaultW: 110 },
  { label: "Client",      defaultW: 120 },
  { label: "Location",    defaultW: 100 },
  { label: "Brand",       defaultW: 90  },
  { label: "Part Number", defaultW: 130 },
  { label: "Qty",         defaultW: 55  },
  { label: "UOM",         defaultW: 55  },
  { label: "Notes",       defaultW: 130 },
  { label: "Status",      defaultW: 120 },
  { label: "Remark",      defaultW: 160 },
];

function EmployeeTable({ rows, loading, statusDrafts, originalStatuses, onStatusChange, onDetailOpen, onToggleExpand }) {
  const [colWidths, setColWidths] = useState(() => EMP_COLS.map((c) => c.defaultW));
  const dragRef = useRef(null);

  const startResize = (colIdx, e) => {
    e.preventDefault();
    dragRef.current = { colIdx, startX: e.clientX, startW: colWidths[colIdx] };
    const onMove = (ev) => {
      const { colIdx: ci, startX, startW } = dragRef.current;
      setColWidths((prev) => { const next = [...prev]; next[ci] = Math.max(36, startW + ev.clientX - startX); return next; });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]" style={{ tableLayout: "fixed", width: "100%", minWidth: 600 }}>
          <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr className="text-left">
              {EMP_COLS.map((col, i) => (
                <th
                  key={col.label}
                  style={{ background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}
                  className="border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: 10 }, (_, c) => (
                  <td key={c} className="border-b border-r border-[#DCE6F7] px-2 py-2.5 last:border-r-0">
                    <div className="skeleton h-3.5" style={{ width: c === 4 ? "75%" : "55%" }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="px-5 py-14 text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}
        >
          <LayoutDashboard size={22} className="text-[#1D6FD8]" />
        </div>
        <h3 className="text-[14px] font-semibold text-slate-900">No assigned inquiries</h3>
        <p className="mt-1 text-[12px] text-slate-400">When admin assigns inquiries to you, they will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[11px]" style={{ tableLayout: "fixed", width: "100%", minWidth: 600 }}>
        <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr className="text-left">
            {EMP_COLS.map((col, i) => (
              <th
                key={col.label}
                style={{ position: "relative", background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}
                className="sticky top-0 border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0 select-none"
              >
                <span className="block truncate pr-2">{col.label}</span>
                <div
                  onMouseDown={(e) => startResize(i, e)}
                  style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 1 }}
                  className="hover:bg-blue-400/30 transition-colors"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isDirty = statusDrafts[row.unique_code] && statusDrafts[row.unique_code] !== (originalStatuses?.[row.unique_code] || row.status);
            return (
              <tr
                key={row.rowKey}
                className="border-b border-[#EEF2F6] transition"
                style={{ background: row.isChildRow ? "rgba(238,246,255,0.85)" : idx % 2 === 0 ? "white" : "#FAFBFF" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F0F6FF")}
                onMouseLeave={(e) => (e.currentTarget.style.background = row.isChildRow ? "rgba(238,246,255,0.85)" : idx % 2 === 0 ? "white" : "#FAFBFF")}
              >
                <td
                  className="border-r border-[#DCE6F7] px-2 py-2.5"
                  title={row.isFirstItem ? "Click to view details and vendors" : undefined}
                >
                  {row.isChildRow ? (
                    <p className="pl-4 text-[10px] text-slate-400 italic">↳ item</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        {row.groupSize > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleExpand(row.unique_code); }}
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#C8D6F0] bg-white text-[10px] font-bold text-[#4461A8] hover:bg-[#EEF4FF] transition"
                            title={row.isExpanded ? "Collapse items" : "Expand items"}
                          >
                            {row.isExpanded ? "−" : "+"}
                          </button>
                        )}
                        <p
                          className="truncate font-semibold text-[#1D6FD8] text-[11px] cursor-pointer"
                          onClick={() => onDetailOpen(row.unique_code)}
                        >
                          {row.unique_code}
                        </p>
                      </div>
                      {row.groupSize > 1 && (
                        <p className="mt-0.5 text-[9px] text-[#5BA7FF] font-medium pl-5">{row.groupSize} items</p>
                      )}
                      {(() => {
                        const count     = Number(row.vendor_price_count) || 0;
                        const hasUnseen = Boolean(row.has_unseen_prices);
                        if (count === 0) return <p className="mt-0.5 text-[9px] text-slate-400">No prices yet</p>;
                        if (!hasUnseen)  return <span className="mt-0.5 inline-block rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">Prices arrived</span>;
                        if (count === 1) return <span className="mt-0.5 inline-block rounded-full bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Prices arrived</span>;
                        return <span className="mt-0.5 inline-block rounded-full bg-green-50 border border-green-300 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">More prices arrived</span>;
                      })()}
                    </>
                  )}
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="truncate font-medium text-slate-800 text-[11px]">{row.client_name}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="truncate text-slate-600 text-[11px]">{row.location}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="truncate text-slate-600 text-[11px]">{row.brand}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="truncate font-semibold text-slate-900 text-[11px]">{row.part_number}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="font-medium text-slate-700 text-[11px]">{row.quantity}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5">
                  <p className="text-slate-600 text-[11px]">{row.uom}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2.5" title={row.item_notes}>
                  <p className="truncate text-slate-500 text-[11px]">{row.item_notes}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-2 py-2">
                  <select
                    value={statusDrafts[row.unique_code] || row.status}
                    onChange={(e) => onStatusChange(row.unique_code, e.target.value)}
                    className="h-7 w-full rounded-lg px-2 text-[11px] font-medium outline-none cursor-pointer transition"
                    style={{
                      border: isDirty ? "1.5px solid #F59E0B" : "1px solid #E4E8EE",
                      background: isDirty ? "#FFFBEB" : "white",
                      color: isDirty ? "#92400E" : "#334155",
                    }}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 align-top">
                  {row.isFirstItem ? (
                    <EmpRemarkCell uniqueCode={row.unique_code} initialRemark={row.remark} />
                  ) : (
                    row.remark ? (
                      <p className="truncate text-[10px] text-slate-400 px-1.5">{row.remark}</p>
                    ) : null
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
