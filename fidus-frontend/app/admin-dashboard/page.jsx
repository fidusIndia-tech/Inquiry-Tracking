"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InquiryDetailModal from "@/app/components/InquiryDetailModal";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Award,
  Ban,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
  Trash2,
  Users,
  X,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "new",         label: "New"         },
  { value: "assigned",    label: "Assigned"    },
  { value: "in_progress", label: "In Progress" },
  { value: "quoted",      label: "Quoted"      },
  { value: "converted",   label: "Converted"   },
  { value: "lost",        label: "Lost"        },
  { value: "dropped",     label: "Dropped"     },
];

// Single source of truth for "which parent query does this row belong to".
// Prefers the FIAPL unique code; only falls back to a raw row id when no
// code exists at all (e.g. a manually-created inquiry with no code yet).
// Never group by part number, brand, or row index — those are per-item,
// not per-query, and would silently merge unrelated inquiries together.
function getInquiryGroupKey(row) {
  return String(
    row?.unique_code ||
    row?.fiapl_unique_code ||
    row?.f_unique_code ||
    row?.f_unique_code_display ||
    row?.inquiry_code ||
    row?.inquiry_id ||
    row?.parent_inquiry_id ||
    row?.id ||
    ""
  ).trim().toUpperCase();
}

const statusClasses = {
  new:         "text-[#1D6FD8] border-[#BFDBFE]",
  assigned:    "text-[#4451E8] border-[#A5B4FC]",
  in_progress: "text-[#059669] border-[#6EE7B7]",
  quoted:      "text-[#6D28D9] border-[#C4B5FD]",
  converted:   "text-[#047857] border-[#6EE7B7]",
  lost:        "text-[#BE123C] border-[#FECDD3]",
  dropped:     "text-[#64748B] border-[#E2E8F0]",
};

const statusGrad = {
  new:         "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
  assigned:    "linear-gradient(135deg,#EEF0FF,#C7D2FE)",
  in_progress: "linear-gradient(135deg,#EFFAF6,#A7F3D0)",
  quoted:      "linear-gradient(135deg,#F5F3FF,#DDD6FE)",
  converted:   "linear-gradient(135deg,#ECFDF5,#A7F3D0)",
  lost:        "linear-gradient(135deg,#FFF1F2,#FECDD3)",
  dropped:     "linear-gradient(135deg,#F8FAFC,#E2E8F0)",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [activeMenu,         setActiveMenu]         = useState("dashboard");
  const [inquiries,          setInquiries]          = useState([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [inquiriesError,     setInquiriesError]     = useState("");
  const [users,              setUsers]              = useState([]);
  const [usersError,         setUsersError]         = useState("");
  const [searchText,         setSearchText]         = useState("");
  const [debouncedSearch,    setDebouncedSearch]    = useState("");
  const [statusFilter,       setStatusFilter]       = useState("all");
  const [assignmentFilter,   setAssignmentFilter]   = useState("all");
  const [executiveFilter,    setExecutiveFilter]    = useState("all");
  const [dateFrom,           setDateFrom]           = useState("");
  const [dateTo,             setDateTo]             = useState("");
  const [now,                setNow]                = useState(0);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);
  const [autoAssignPreview,  setAutoAssignPreview]  = useState(null);
  const [editModal,          setEditModal]          = useState(null);
  const [subjectPreview,     setSubjectPreview]     = useState(null);
  // Stores the unique_code only, never a snapshot — the inquiry object
  // passed to the modal is re-derived from `inquiries` on every render
  // (below) so background refreshes (SSE) keep an already-open modal
  // showing live data instead of whatever existed at the moment it opened.
  const [detailModalCode,    setDetailModalCode]    = useState(null);
  const [notifBadge,         setNotifBadge]         = useState(0);
  const [reminders,          setReminders]          = useState([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);
  const [showAddModal,       setShowAddModal]       = useState(false);
  const [selectedReminder,   setSelectedReminder]   = useState(null);
  const [blockedClients,     setBlockedClients]     = useState([]);
  const [blockBusy,          setBlockBusy]          = useState(false);
  const [priceFilter,        setPriceFilter]        = useState("all");
  const prevCountRef      = useRef(0);
  const knownPriceCountsRef = useRef(null); // null = not yet initialised, skip first-load notify

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  const fetchBlockedClients = useCallback(async () => {
    try {
      const res = await fetch("/api/blocked-clients");
      const data = await res.json();
      if (res.ok) setBlockedClients(data.blocked || []);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchBlockedClients(); }, [fetchBlockedClients]);

  const handleBlockClient = async (senderEmail, clientName) => {
    if (!senderEmail) { alert("This inquiry has no sender email to block."); return; }
    setBlockBusy(true);
    try {
      const res = await fetch("/api/blocked-clients", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sender_email: senderEmail,
          client_name:  clientName || null,
          blocked_by:   Number(localStorage.getItem("userId")) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to block client");
      await fetchBlockedClients();
      // Hide this client's inquiries from the current view immediately —
      // don't wait for the next poll/SSE refresh. Historical data in the
      // database is untouched; this only affects what's rendered right now.
      const blockedEmail = String(senderEmail).trim().toLowerCase();
      setInquiries((current) =>
        current.filter((inq) => String(inq.sender_email || "").trim().toLowerCase() !== blockedEmail)
      );
      setDetailModalCode(null);
      alert("Client blocked. Future inquiries from this email will be skipped.");
    } catch (e) { alert(e.message); }
    finally { setBlockBusy(false); }
  };

  const handleUnblockClient = async (id) => {
    setBlockBusy(true);
    try {
      const res = await fetch("/api/blocked-clients", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unblock client");
      await fetchBlockedClients();
    } catch (e) { alert(e.message); }
    finally { setBlockBusy(false); }
  };

  const fetchReminders = useCallback(async () => {
    setIsLoadingReminders(true);
    try {
      const res = await fetch("/api/reminders");
      if (!res.ok) return;
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch (_) {}
    finally { setIsLoadingReminders(false); }
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const unreadRemindersCount = reminders.filter((r) => r.status === "unread").length;

  const inquiriesUrl = () => {
    const uid = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    return uid ? `/api/inquiries?userId=${encodeURIComponent(uid)}` : "/api/inquiries";
  };

  async function loadInquiries() {
    try {
      setIsLoadingInquiries(true);
      setInquiriesError("");
      const response = await fetch(inquiriesUrl());
      const data     = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load inquiries");
      setInquiries(data.inquiries || []);
    } catch (error) {
      setInquiriesError(error.message);
    } finally {
      setIsLoadingInquiries(false);
    }
  }

  const handlePricesSeen = useCallback(async (uniqueCode) => {
    if (!uniqueCode) return;
    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    if (!userId) return;
    setInquiries((current) =>
      current.map((inq) =>
        inq.unique_code === uniqueCode ? { ...inq, has_unseen_prices: false } : inq
      )
    );
    try {
      await fetch("/api/inquiries/prices-seen", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, user_id: Number(userId) }),
      });
    } catch {} // silent — badge will self-correct on next poll
  }, []);

  async function loadUsers() {
    try {
      setUsersError("");
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
    } catch (error) {
      setUsersError(error.message);
    }
  }

  useEffect(() => {
    let isMounted = true;
    let lastFetchAt = 0;

    async function loadInitial() {
      try {
        setIsLoadingInquiries(true);
        setInquiriesError("");
        const response = await fetch(inquiriesUrl());
        const data     = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load inquiries");
        if (isMounted) { lastFetchAt = Date.now(); setInquiries(data.inquiries || []); }
      } catch (error) {
        if (isMounted) setInquiriesError(error.message);
      } finally {
        if (isMounted) setIsLoadingInquiries(false);
      }
    }
    async function pollInquiries() {
      if (!isMounted) return;
      if (Date.now() - lastFetchAt < 2000) return; // debounce: skip if fetched <2s ago
      lastFetchAt = Date.now();
      try {
        const response = await fetch(inquiriesUrl());
        const data     = await response.json();
        if (!response.ok || !isMounted) return;
        setInquiries(data.inquiries || []);
      } catch {
        /* silent — don't surface background poll errors */
      }
    }

    // Kick off inquiries + users in parallel
    loadInitial();
    loadUsers();

    // SSE: server pushes instantly on every DB change
    const es = new EventSource("/api/inquiries/stream");
    es.onmessage = () => { if (isMounted) pollInquiries(); };
    es.onerror   = () => {}; // silent — browser auto-reconnects SSE

    // 30 s fallback poll in case SSE misses an update
    const pollTimer = window.setInterval(pollInquiries, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(pollTimer);
      es.close();
    };
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  /* Register service worker + request notification permission */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /* Track new inquiries and push persistent notifications */
  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = inquiries.length;
    if (curr > prev && prev > 0) {
      const added = curr - prev;
      setNotifBadge((n) => n + added);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const title = "New Inquiries Received";
        const opts  = { body: `${added} new inquiry${added > 1 ? " items" : ""} arrived`, icon: "/logo-dark.png", requireInteraction: true };
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => new Notification(title, opts));
        } else {
          new Notification(title, opts);
        }
      }
    }
    prevCountRef.current = curr;
  }, [inquiries]);

  /* Notify admin when vendor prices arrive for any inquiry */
  useEffect(() => {
    if (!inquiries.length) return;
    const prev = knownPriceCountsRef.current;
    const curr = new Map(inquiries.map((i) => [i.unique_code, Number(i.vendor_price_count) || 0]));

    if (prev !== null && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      inquiries.forEach((inq) => {
        const prevCount = prev.get(inq.unique_code) ?? 0;
        const currCount = Number(inq.vendor_price_count) || 0;
        if (currCount > prevCount) {
          const label = inq.client_name || inq.sender_name || inq.unique_code;
          const opts  = {
            body: `${inq.unique_code} · ${label}`,
            tag:  `price-${inq.unique_code}`,
            icon: "/logo-dark.png",
            requireInteraction: true,
          };
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then((reg) => reg.showNotification("Vendor price received", opts)).catch(() => new Notification("Vendor price received", opts));
          } else {
            new Notification("Vendor price received", opts);
          }
        }
      });
    }
    knownPriceCountsRef.current = curr;
  }, [inquiries]);

  const filteredInquiries = useMemo(() => {
    const tokens = debouncedSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    // Use a single timestamp captured at filter-run time rather than the
    // `now` state variable, so the 30-second clock tick never invalidates
    // this memo and re-filters the entire list unnecessarily.
    const filterNow = Date.now();

    return inquiries.filter((inquiry) => {
      if (statusFilter !== "all" && inquiry.status !== statusFilter) return false;

      if (assignmentFilter !== "all") {
        const assignedAtMs = inquiry.assigned_at ? new Date(inquiry.assigned_at).getTime() : null;
        const ageHours = assignedAtMs ? (filterNow - assignedAtMs) / 36e5 : null;
        if (assignmentFilter === "over24h" && !(ageHours !== null && ageHours > 24)) return false;
        if (assignmentFilter === "over48h" && !(ageHours !== null && ageHours > 48)) return false;
      }

      if (executiveFilter !== "all") {
        if (executiveFilter === "unassigned") {
          if (inquiry.assigned_to) return false;
        } else if (String(inquiry.assigned_to || "") !== String(executiveFilter)) {
          return false;
        }
      }

      if (fromMs !== null || toMs !== null) {
        if (!inquiry.email_date) return false;
        const d = new Date(inquiry.email_date).getTime();
        if (fromMs !== null && d < fromMs) return false;
        if (toMs   !== null && d > toMs)   return false;
      }

      if (priceFilter !== "all") {
        const cnt      = Number(inquiry.vendor_price_count) || 0;
        const unseen   = Boolean(inquiry.has_unseen_prices);
        if (priceFilter === "none"   && cnt > 0)             return false;
        if (priceFilter === "unread" && !unseen)             return false;
        if (priceFilter === "viewed" && (cnt === 0 || unseen)) return false;
      }

      if (tokens.length > 0) {
        const text = [
          inquiry.unique_code,
          inquiry.client_name,
          inquiry.location,
          inquiry.sender_name,
          inquiry.sender_email,
          inquiry.subject,
          inquiry.status,
          inquiry.assigned_to_name,
          inquiry.assigned_ref_name,
          ...(inquiry.items || []).flatMap((item) => [
            item.brand, item.partNumber, item.quantity, item.uom, item.itemNotes,
          ]),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!tokens.every((token) => text.includes(token))) return false;
      }

      return true;
    });
  }, [inquiries, debouncedSearch, statusFilter, assignmentFilter, executiveFilter, dateFrom, dateTo, priceFilter]);

  const counts = useMemo(() => ({
    total:    inquiries.length,
    new:      inquiries.filter((i) => i.status === "new").length,
    assigned: inquiries.filter((i) => i.status === "assigned").length,
    quoted:   inquiries.filter((i) => i.status === "quoted").length,
  }), [inquiries]);

  const employeeOptions = useMemo(() =>
    users
      .filter((user) => user.role === "employee" && user.is_active)
      .map((user) => ({ id: user.id, name: user.name, email: user.email })),
  [users]);

  const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://practical-amazement-production-3539.up.railway.app").replace(/\/$/, "");

  const handleClearFilters = () => {
    setSearchText("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setAssignmentFilter("all");
    setExecutiveFilter("all");
    setDateFrom("");
    setDateTo("");
    setPriceFilter("all");
  };

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    window.location.href = PORTAL_URL + "/login";
  };

  const handleAssignToMe = async (uniqueCode) => {
    const adminId = Number(localStorage.getItem("userId"));
    if (!adminId) { alert("Admin session not found. Please re-login."); return; }
    try {
      const response = await fetch("/api/inquiries/assign", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, assigned_to: adminId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to assign");
      setInquiries((current) =>
        current.map((inq) =>
          inq.unique_code === uniqueCode
            ? { ...inq, assigned_to: data.inquiry.assigned_to, assigned_at: data.inquiry.assigned_at, assigned_ref_name: null, assigned_to_name: data.inquiry.assigned_to_name, status: data.inquiry.status }
            : inq
        )
      );
    } catch (e) { alert(e.message); }
  };

  const handleOpenAddModal = (reminder) => { setSelectedReminder(reminder); setShowAddModal(true); };
  const handleCloseModal   = () => { setShowAddModal(false); setSelectedReminder(null); };
  const handleInquiryCreated = () => { handleCloseModal(); loadInquiries(); fetchReminders(); };

  const handleAutoAssign = async () => {
    try {
      const response = await fetch("/api/inquiries/auto-assign");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Preview failed");
      if (data.no_mappings) {
        alert("No client mappings set up yet. Go to Access Control to map clients to employees first.");
        return;
      }
      if (data.preview.length === 0) {
        alert(data.unmatched > 0
          ? `No new inquiries matched any mapping. ${data.unmatched} unmatched.`
          : "No new unassigned inquiries to assign.");
        return;
      }
      setAutoAssignPreview(data);
    } catch (e) { alert(e.message); }
  };

  const handleAutoAssignConfirm = async () => {
    try {
      const response = await fetch("/api/inquiries/auto-assign", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Auto-assign failed");
      setAutoAssignPreview(null);
      alert(`Done: ${data.assigned} assigned, ${data.unmatched} had no match.`);
      await loadInquiries();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (uniqueCode) => {
    try {
      const response = await fetch("/api/inquiries", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }
      setInquiries((current) => current.filter((i) => i.unique_code !== uniqueCode));
      setDeleteConfirm(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Merge every raw row sharing this FIAPL code (not just the first match)
  // so the modal/Drafts tab sees the complete item list even if the backend
  // ever returns more than one inquiries-table row for the same code.
  const detailModal = useMemo(() => {
    if (!detailModalCode) return null;
    const matches = inquiries.filter((i) => i.unique_code === detailModalCode);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return { ...matches[0], items: matches.flatMap((m) => m.items || []) };
  }, [inquiries, detailModalCode]);

  return (
    <div className="min-h-screen text-slate-900 dashboard-bg flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      <TopBar
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        searchText={searchText}
        setSearchText={setSearchText}
        onRefresh={loadInquiries}
        onLogout={handleLogout}
        notifBadge={notifBadge}
        onClearNotif={() => setNotifBadge(0)}
        remindersCount={unreadRemindersCount}
      />

      <main className="flex-1 overflow-auto px-4 pb-4 lg:px-5 lg:pb-5">
            {activeMenu === "dashboard" && (
              <div className="flex flex-col gap-4 pt-4 lg:pt-5">
                <section className="flex gap-3">
                  <MetricCard icon={<FileText size={15} />}     label="Total"    value={isLoadingInquiries ? "—" : counts.total}    accent="blue"   delay="0ms"   />
                  <MetricCard icon={<Clock3 size={15} />}       label="New"      value={isLoadingInquiries ? "—" : counts.new}      accent="indigo" delay="60ms"  />
                  <MetricCard icon={<Users size={15} />}        label="Assigned" value={isLoadingInquiries ? "—" : counts.assigned} accent="mint"   delay="120ms" />
                  <MetricCard icon={<CheckCircle2 size={15} />} label="Quoted"   value={isLoadingInquiries ? "—" : counts.quoted}   accent="violet" delay="180ms" />
                </section>

                <InquiryTable
                  inquiries={filteredInquiries}
                  setInquiries={setInquiries}
                  employees={employeeOptions}
                  isLoading={isLoadingInquiries}
                  error={inquiriesError}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  assignmentFilter={assignmentFilter}
                  setAssignmentFilter={setAssignmentFilter}
                  executiveFilter={executiveFilter}
                  setExecutiveFilter={setExecutiveFilter}
                  dateFrom={dateFrom}
                  setDateFrom={setDateFrom}
                  dateTo={dateTo}
                  setDateTo={setDateTo}
                  priceFilter={priceFilter}
                  setPriceFilter={setPriceFilter}
                  onClearFilters={handleClearFilters}
                  totalCount={inquiries.length}
                  now={now}
                  onDeleteRequest={(inquiry)  => setDeleteConfirm(inquiry)}
                  onEditRequest={(inquiry)   => setEditModal(inquiry)}
                  onSubjectOpen={(inquiry)   => setSubjectPreview(inquiry)}
                  onDetailOpen={(inquiry)    => setDetailModalCode(inquiry.unique_code)}
                  onAssignToMeRequest={(uc)  => handleAssignToMe(uc)}
                  onAutoAssign={handleAutoAssign}
                />
              </div>
            )}

            {activeMenu === "sales" && (
              <div className="pt-4 lg:pt-5">
                <SalesOverview inquiries={inquiries} users={users} />
              </div>
            )}

            {activeMenu === "reminders" && (
              <div className="pt-4 lg:pt-5">
                <RemindersPage
                  reminders={reminders}
                  isLoading={isLoadingReminders}
                  onAddInquiry={handleOpenAddModal}
                />
              </div>
            )}

            {activeMenu === "access" && (
              <div className="pt-4 lg:pt-5">
                <AccessControlPanel
                  users={users}
                  usersError={usersError}
                  onUsersChanged={loadUsers}
                  blockedClients={blockedClients}
                  onBlockClient={handleBlockClient}
                  onUnblockClient={handleUnblockClient}
                  blockBusy={blockBusy}
                />
              </div>
            )}

            {activeMenu === "vendors" && (
              <div className="pt-4 lg:pt-5">
                <VendorsPanel />
              </div>
            )}

            {activeMenu === "quotes" && (
              <div className="pt-4 lg:pt-5">
                <QuotationSummaryPanel onOpenInquiry={(code) => setDetailModalCode(code)} />
              </div>
            )}
      </main>

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-6 card-shadow-lg animate-modal">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition"
            >
              <X size={14} />
            </button>
            <div className="h-11 w-11 rounded-xl bg-[#FFF1F2] flex items-center justify-center mb-4">
              <Trash2 size={18} className="text-rose-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-slate-900">Delete Inquiry?</h3>
            <p className="mt-1.5 text-[13px] text-slate-500">
              This will permanently delete{" "}
              <span className="font-semibold text-slate-800">{deleteConfirm.unique_code}</span>{" "}
              and all its line items. This action cannot be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-9 rounded-xl border border-[#E4E8EE] bg-white text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.unique_code)}
                className="flex-1 h-9 rounded-xl bg-rose-600 text-[13px] font-semibold text-white transition hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-assign preview modal ── */}
      {autoAssignPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setAutoAssignPreview(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl card-shadow-lg animate-modal flex flex-col" style={{ maxHeight: "80vh" }}>
            <div className="px-6 pt-6 pb-4 border-b border-[#EEF2F6]">
              <button
                onClick={() => setAutoAssignPreview(null)}
                className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition"
              >
                <X size={14} />
              </button>
              <h3 className="text-[15px] font-semibold text-slate-900">Auto-Assign Preview</h3>
              <p className="mt-1 text-[12px] text-slate-500">
                <span className="font-semibold text-slate-800">{autoAssignPreview.preview.length}</span> inquiries will be assigned.
                {autoAssignPreview.unmatched > 0 && (
                  <span className="ml-1 text-slate-400">{autoAssignPreview.unmatched} have no matching client mapping.</span>
                )}
              </p>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-[#F8FAFC] sticky top-0">
                    <th className="px-4 py-2 border-b border-[#EEF2F6]">Inquiry</th>
                    <th className="px-4 py-2 border-b border-[#EEF2F6]">Client</th>
                    <th className="px-4 py-2 border-b border-[#EEF2F6]">→ Assign To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {autoAssignPreview.preview.map((row) => (
                    <tr key={row.unique_code} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[#1D6FD8] font-semibold whitespace-nowrap">{row.unique_code}</td>
                      <td className="px-4 py-2.5 text-slate-700 truncate max-w-[180px]">{row.client_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {row.employee_name}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-[#EEF2F6] flex gap-2">
              <button
                onClick={() => setAutoAssignPreview(null)}
                className="flex-1 h-9 rounded-xl border border-[#E4E8EE] bg-white text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoAssignConfirm}
                className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}
              >
                Confirm & Assign {autoAssignPreview.preview.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit inquiry modal ── */}
      {editModal && (
        <EditModal
          inquiry={editModal}
          employees={employeeOptions}
          onClose={() => setEditModal(null)}
          onSave={(uniqueCode, updates) => {
            setInquiries((current) =>
              current.map((i) => (i.unique_code === uniqueCode ? { ...i, ...updates } : i))
            );
            setEditModal(null);
          }}
        />
      )}

      {subjectPreview && (
        <SubjectModal
          inquiry={subjectPreview}
          onClose={() => setSubjectPreview(null)}
        />
      )}

      {detailModal && (
        <InquiryDetailModal
          inquiry={detailModal}
          onClose={() => setDetailModalCode(null)}
          onBlockClient={(senderEmail, clientName) => handleBlockClient(senderEmail, clientName)}
          onPricesSeen={() => handlePricesSeen(detailModal.unique_code)}
        />
      )}

      {/* AssignToMeModal removed — assignment is now immediate */}

      {showAddModal && (
        <AddInquiryModal
          reminder={selectedReminder}
          onClose={handleCloseModal}
          onSuccess={handleInquiryCreated}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   EDIT MODAL
─────────────────────────────────────────────── */
function EditModal({ inquiry, employees, onClose, onSave }) {
  const [assignedTo, setAssignedTo] = useState(inquiry.assigned_to || "");
  const [status,     setStatus]     = useState(inquiry.status      || "new");
  const [form, setForm] = useState({
    client_name:  inquiry.client_name  || "",
    location:     inquiry.location     || "",
    sender_name:  inquiry.sender_name  || "",
    sender_email: inquiry.sender_email || "",
    subject:      inquiry.subject      || "",
    notes:        inquiry.notes        || "",
  });
  const [saving,     setSaving]     = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const detailsChanged = Object.keys(form).some(
        (key) => String(form[key] || "") !== String(inquiry[key] || "")
      );

      if (detailsChanged) {
        const response = await fetch("/api/inquiries", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unique_code: inquiry.unique_code,
            ...form,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update inquiry details");
        }
      }

      /* Update assignment */
      if (String(assignedTo) !== String(inquiry.assigned_to || "")) {
        await fetch("/api/inquiries/assign", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            unique_code: inquiry.unique_code,
            assigned_to: assignedTo ? Number(assignedTo) : null,
          }),
        });
      }
      /* Update status */
      if (status !== inquiry.status) {
        await fetch("/api/inquiries/status", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            unique_code: inquiry.unique_code,
            status,
            changed_by: Number(localStorage.getItem("userId")) || null,
          }),
        });
      }
      const assignedName = employees.find((e) => e.id === Number(assignedTo))?.name || null;
      onSave(inquiry.unique_code, {
        ...form,
        assigned_to:      assignedTo ? Number(assignedTo) : null,
        assigned_to_name: assignedName,
        status,
      });
    } catch (error) {
      alert(error.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const items = inquiry.items?.length ? inquiry.items : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl card-shadow-lg animate-modal overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[#EEF2F6]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Inquiry</p>
            <h3 className="text-[16px] font-semibold text-slate-900 mt-0.5">{inquiry.unique_code}</h3>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Editable inquiry details */}
          <div className="grid grid-cols-2 gap-3">
            <EditField
              label="Sender"
              value={form.sender_name}
              onChange={(value) => updateField("sender_name", value)}
            />
            <EditField
              label="Email"
              value={form.sender_email}
              onChange={(value) => updateField("sender_email", value)}
            />
            <EditField
              label="Company"
              value={form.client_name}
              onChange={(value) => updateField("client_name", value)}
            />
            <EditField
              label="Location"
              value={form.location}
              onChange={(value) => updateField("location", value)}
            />
            <div className="col-span-2">
              <EditField
                label="Subject"
                value={form.subject}
                onChange={(value) => updateField("subject", value)}
              />
            </div>
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-[11px] font-medium text-slate-600">
                Notes
              </span>
              <textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-[#E4E8EE] bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                placeholder="Add notes"
              />
            </label>
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                Line Items ({items.length})
              </p>
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2 text-[11px]">
                    <span className="font-semibold text-slate-900 truncate">{item.partNumber || "—"}</span>
                    {item.brand && <span className="text-slate-400 truncate">{item.brand}</span>}
                    {item.quantity && <span className="ml-auto text-slate-600 shrink-0">×{item.quantity}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">Assign To</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-[#EEF2F6]">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-xl border border-[#E4E8EE] bg-white text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #5BA7FF 0%, #4D9AFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-slate-600">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[13px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
        placeholder={label}
      />
    </label>
  );
}

/* ──────────────────────────────────────────────
   SIDEBAR
─────────────────────────────────────────────── */
function SubjectModal({ inquiry, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white card-shadow-lg animate-modal">
        <div className="flex items-start justify-between border-b border-[#EEF2F6] p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Subject
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold text-slate-900">
              {inquiry.unique_code}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <p className="whitespace-pre-wrap break-words rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] p-4 text-[13px] leading-relaxed text-slate-700">
            {inquiry.subject || "No subject available."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  activeMenu, setActiveMenu,
  collapsed,  setCollapsed,
  mobileOpen, setMobileOpen,
  onLogout,
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col justify-between border-r border-[#E4E8EE] transition-all duration-200 lg:relative ${
        collapsed ? "lg:w-16" : "lg:w-52"
      } ${mobileOpen ? "w-52 translate-x-0" : "-translate-x-full lg:translate-x-0"} w-52`}
      style={{ background: "linear-gradient(180deg, #F0F4FF 0%, #E8EFFF 50%, #EDF5FF 100%)" }}
    >
      <div>
        {/* Logo */}
        <div className={`flex h-14 items-center border-b border-[#E4E8EE] px-4 ${collapsed ? "justify-center" : "gap-3"}`}>
          {collapsed ? (
            <div
              className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg, #5BA7FF 0%, #6D7CFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" }}
            >
              FI
            </div>
          ) : (
            <Image
              src="/logo-dark.png"
              alt="FIAPL"
              width={190}
              height={48}
              className="h-8 w-auto object-contain max-w-36"
              priority
            />
          )}
        </div>

        {/* Nav */}
        <nav className="space-y-0.5 px-2 py-3">
          <SidebarItem
            icon={<LayoutDashboard size={15} />}
            title="Dashboard"
            active={activeMenu === "dashboard"}
            collapsed={collapsed}
            onClick={() => { setActiveMenu("dashboard"); setMobileOpen(false); }}
          />
          <SidebarItem
            icon={<Inbox size={15} />}
            title="Sales Inquiries"
            active={activeMenu === "sales"}
            collapsed={collapsed}
            onClick={() => { setActiveMenu("sales"); setMobileOpen(false); }}
          />
          <SidebarItem
            icon={<Users size={15} />}
            title="Access Control"
            active={activeMenu === "access"}
            collapsed={collapsed}
            onClick={() => { setActiveMenu("access"); setMobileOpen(false); }}
          />
          <SidebarItem
            icon={<Store size={15} />}
            title="Vendors"
            active={activeMenu === "vendors"}
            collapsed={collapsed}
            onClick={() => { setActiveMenu("vendors"); setMobileOpen(false); }}
          />
        </nav>
      </div>

      <div>
        <div className="px-2 pb-2 hidden lg:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex h-9 w-full items-center gap-2 rounded-lg border border-[#E4E8EE] bg-white text-[11px] font-medium text-slate-500 transition hover:bg-[#F3F5F7] hover:text-slate-700 ${collapsed ? "justify-center" : "px-3"}`}
          >
            {collapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
        </div>

        <div className="border-t border-[#E4E8EE] p-3">
          <div className={`flex items-center mb-3 ${collapsed ? "justify-center" : "gap-2.5"}`}>
            <div
              className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[11px] font-semibold"
              style={{ background: "linear-gradient(135deg, #6D7CFF 0%, #8C9EFF 100%)" }}
            >
              A
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900 truncate leading-tight">Admin</p>
                <p className="text-[11px] text-slate-400 truncate">Super Admin</p>
              </div>
            )}
          </div>
          <button
            onClick={onLogout}
            className={`flex h-9 w-full items-center gap-2 rounded-lg bg-[#F3F5F7] text-[11px] font-medium text-slate-600 transition hover:bg-[#FFF1F2] hover:text-rose-700 ${collapsed ? "justify-center" : "px-3"}`}
          >
            <LogOut size={13} />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ icon, title, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? title : undefined}
      className={`flex h-9 w-full items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
        active
          ? "text-[#1D6FD8]"
          : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
      } ${collapsed ? "justify-center" : "px-2.5"}`}
      style={active ? { background: "linear-gradient(135deg,#EFF6FF 0%,#E0EEFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.15)" } : {}}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${active ? "text-white" : "text-slate-400"}`} style={active ? { background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" } : {}}>
        {icon}
      </span>
      {!collapsed && title}
    </button>
  );
}

/* ──────────────────────────────────────────────
   TOP BAR
─────────────────────────────────────────────── */
const TOP_NAV = [
  { key: "dashboard", label: "Dashboard",      icon: <LayoutDashboard size={12} /> },
  { key: "sales",     label: "Sales",          icon: <Inbox size={12} /> },
  { key: "access",    label: "Access Control", icon: <Users size={12} /> },
  { key: "reminders", label: "Reminders",      icon: <Bell size={12} /> },
  { key: "vendors",   label: "Vendors",        icon: <Store size={12} /> },
  { key: "quotes",    label: "Quotes",         icon: <FileText size={12} /> },
];

const PORTAL_BASE = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://practical-amazement-production-3539.up.railway.app").replace(/\/$/, "");

function AppSwitcher() {
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
    window.location.href = `${PORTAL_BASE}/dashboard`;
  };

  const apps = [
    { id: "inquiry-tracker", label: "InquiryTracker", emoji: "📨" },
    { id: "price-desk",      label: "PriceDesk",      emoji: "💹" },
    { id: "lead-clip",       label: "LeadFlow",       emoji: "🎯" },
    { id: "tender-ai",       label: "TenderAI",       emoji: "📄" },
    { id: "crm",             label: "CRM",            emoji: "🤝" },
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
              href={`${PORTAL_BASE}/go?app=${app.id}`}
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
            style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 9, textDecoration: "none", color: "#64748b", fontSize: 12, fontWeight: 500, width: "100%", background: "none", border: "none", cursor: "pointer" }}
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

function TopBar({ activeMenu, setActiveMenu, searchText, setSearchText, onRefresh, onLogout, notifBadge, onClearNotif, remindersCount }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-[#D8E3F8] px-5 backdrop-blur-md" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.92) 0%, rgba(240,246,255,0.95) 100%)" }}>
      {/* Left: logo + separator + nav */}
      <div className="flex shrink-0 items-center gap-3">
        <Image src="/logo-dark.png" alt="FIAPL" width={120} height={40} className="h-8 w-auto object-contain shrink-0" priority />
        <div className="h-5 w-px bg-[#D8E3F8]" />
        <nav className="flex items-center gap-1">
          {TOP_NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              className={`relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-all duration-150 whitespace-nowrap ${
                activeMenu === item.key ? "text-white" : "text-slate-500 hover:bg-[#EEF2FF] hover:text-[#4451E8]"
              }`}
              style={activeMenu === item.key ? { background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" } : {}}
            >
              {item.icon}
              {item.label}
              {item.key === "reminders" && remindersCount > 0 && (
                <span className="ml-0.5 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white flex items-center justify-center" style={{ boxShadow: "0 2px 6px rgba(239,68,68,0.5)" }}>
                  {remindersCount > 9 ? "9+" : remindersCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Right: search + action buttons — pushed to far right with ml-auto */}
      <div className="ml-auto flex items-center gap-2">
        <div
          className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border bg-[#F8FAFC] w-52 transition-all duration-150 focus-within:bg-white"
          style={{ borderColor: "#E4E8EE" }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = "#5BA7FF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(91,167,255,0.10)"; }}
          onBlurCapture={(e)  => { e.currentTarget.style.borderColor = "#E4E8EE"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <Search size={13} className="text-slate-400 shrink-0" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search inquiries…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={onRefresh}
          className="refresh-spin flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-white transition-all duration-200 btn-glow"
          style={{ background: "linear-gradient(135deg,#5BA7FF 0%,#6D7CFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
        >
          <RefreshCw size={13} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          onClick={onClearNotif}
          className="relative h-8 w-8 grid place-items-center rounded-lg border border-[#D0D8F0] bg-white/80 text-slate-500 transition hover:bg-[#EEF2FF] hover:text-[#5BA7FF] hover:border-[#BFDBFE]"
          title="Notifications"
        >
          <Bell size={13} />
          {notifBadge > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center animate-fade-in" style={{ boxShadow: "0 2px 6px rgba(239,68,68,0.5)" }}>
              {notifBadge > 9 ? "9+" : notifBadge}
            </span>
          )}
        </button>
        <AppSwitcher />
        <div className="h-5 w-px bg-[#D8E3F8]" />
        <button
          onClick={onLogout}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 whitespace-nowrap"
          title="Sign out"
        >
          <LogOut size={12} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────
   METRIC CARD
─────────────────────────────────────────────── */
const ACCENT_PALETTE = {
  blue:   { bg: "linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%)", icon: "#3B82F6", border: "#BFDBFE", top: "#5BA7FF", glow: "rgba(91,167,255,0.22)",  grad: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" },
  indigo: { bg: "linear-gradient(135deg,#EEF0FF 0%,#C7D2FE 100%)", icon: "#4451E8", border: "#A5B4FC", top: "#6D7CFF", glow: "rgba(109,124,255,0.22)", grad: "linear-gradient(135deg,#6D7CFF,#8C9EFF)" },
  mint:   { bg: "linear-gradient(135deg,#EFFAF6 0%,#A7F3D0 100%)", icon: "#059669", border: "#6EE7B7", top: "#7FD8BE", glow: "rgba(127,216,190,0.22)", grad: "linear-gradient(135deg,#7FD8BE,#34D399)" },
  violet: { bg: "linear-gradient(135deg,#F5F3FF 0%,#DDD6FE 100%)", icon: "#6D28D9", border: "#C4B5FD", top: "#8C9EFF", glow: "rgba(140,158,255,0.22)", grad: "linear-gradient(135deg,#8C9EFF,#A78BFA)" },
  amber:  { bg: "linear-gradient(135deg,#FFFBEB 0%,#FDE68A 100%)", icon: "#B45309", border: "#FDE68A", top: "#F59E0B", glow: "rgba(245,158,11,0.22)", grad: "linear-gradient(135deg,#F59E0B,#FBBF24)" },
  rose:   { bg: "linear-gradient(135deg,#FFF1F2 0%,#FECDD3 100%)", icon: "#BE123C", border: "#FECDD3", top: "#FB7185", glow: "rgba(251,113,133,0.22)", grad: "linear-gradient(135deg,#FB7185,#F43F5E)" },
};

function MetricCard({ icon, label, value, accent, delay }) {
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
      <div
        className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white"
        style={{ background: a.grad, boxShadow: `0 4px 12px ${a.glow}` }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">{label}</p>
        <p className="mt-1 text-[24px] font-bold text-slate-900 leading-none tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   INQUIRY TABLE
─────────────────────────────────────────────── */
const ADMIN_COLS = [
  { label: "Select",        defaultW: 34  },
  { label: "Sr. No.",       defaultW: 52  },
  { label: "Received",      defaultW: 150 },
  { label: "F Unique Code", defaultW: 145 },
  { label: "Client Name",   defaultW: 120 },
  { label: "Location",      defaultW: 100 },
  { label: "User Name",     defaultW: 110 },
  { label: "PR #",          defaultW: 80  },
  { label: "Brand",         defaultW: 90  },
  { label: "Part Number",   defaultW: 120 },
  { label: "UOM",           defaultW: 60  },
  { label: "Qty",           defaultW: 55  },
  { label: "Allocation",    defaultW: 170 },
  { label: "Status",        defaultW: 100 },
  { label: "Remark",        defaultW: 180 },
  { label: "Actions",       defaultW: 72  },
];

function InquiryTable({
  inquiries, setInquiries,
  employees,
  isLoading, error,
  statusFilter, setStatusFilter,
  assignmentFilter, setAssignmentFilter,
  executiveFilter, setExecutiveFilter,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  priceFilter, setPriceFilter,
  onClearFilters,
  totalCount,
  now,
  onDeleteRequest, onEditRequest, onSubjectOpen, onDetailOpen, onAssignToMeRequest, onAutoAssign,
}) {
  const [colWidths, setColWidths] = useState(() => ADMIN_COLS.map((c) => c.defaultW));
  const dragRef    = useRef(null);
  const [dateOpen, setDateOpen]   = useState(false);
  const dateRef    = useRef(null);

  const [selected,       setSelected]       = useState(new Set());
  const [bulkDeleting,   setBulkDeleting]   = useState(false);
  const [selectionMode,  setSelectionMode]  = useState(false);

  // Group raw inquiry rows by normalized FIAPL unique code. This is the
  // single source of truth for "one parent row per query" — defensive even
  // against the backend ever returning more than one inquiries-table row
  // for the same FIAPL code (e.g. a re-parsed duplicate email), which would
  // otherwise render as two separate parent queries instead of merging into
  // one. `parent` carries the union of every merged row's items so the
  // detail modal / Drafts tab always sees the complete item list.
  const groupedInquiries = useMemo(() => {
    const groups = new Map();
    const order  = [];
    for (const row of inquiries) {
      const key = getInquiryGroupKey(row);
      if (!key) continue;
      let group = groups.get(key);
      if (!group) {
        group = { queryKey: key, firstRow: row, items: [] };
        groups.set(key, group);
        order.push(key);
      }
      if (row.items?.length) group.items.push(...row.items);
    }
    return order.map((key) => {
      const group = groups.get(key);
      const items = group.items.length ? group.items : [{}];
      // mainItem = first item only (the visible parent row's product columns).
      // hiddenItems = everything else — never repeats mainItem when expanded.
      return {
        queryKey:        group.queryKey,
        parent:          { ...group.firstRow, items },
        items,
        mainItem:        items[0],
        hiddenItems:     items.slice(1),
        totalItems:      items.length,
        hiddenItemCount: Math.max(items.length - 1, 0),
      };
    });
  }, [inquiries]);

  const toggleSelect = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const enterSelectionMode  = () => setSelectionMode(true);
  const cancelSelectionMode = () => { setSelectionMode(false); setSelected(new Set()); };

  const visibleCodes = groupedInquiries.map((g) => g.queryKey);
  const allSelected  = visibleCodes.length > 0 && visibleCodes.every((c) => selected.has(c));

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(visibleCodes));
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected inquiry(ies)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const codes = groupedInquiries
      .filter((g) => selected.has(g.queryKey))
      .map((g) => g.parent.unique_code);
    try {
      await Promise.all(
        codes.map((code) =>
          fetch("/api/inquiries", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ unique_code: code }),
          })
        )
      );
      setInquiries((current) => current.filter((i) => !codes.includes(i.unique_code)));
      setSelected(new Set());
      setSelectionMode(false);
    } catch (e) {
      alert(e.message || "Failed to delete selected inquiries");
    } finally {
      setBulkDeleting(false);
    }
  };

  const startResize = (colIdx, e) => {
    e.preventDefault();
    dragRef.current = { colIdx, startX: e.clientX, startW: colWidths[colIdx] };
    const onMove = (ev) => {
      const { colIdx: ci, startX, startW } = dragRef.current;
      const newW = Math.max(36, startW + ev.clientX - startX);
      setColWidths((prev) => { const next = [...prev]; next[ci] = newW; return next; });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleAssignChange = async (uniqueCode, assignedTo) => {
    try {
      const response = await fetch("/api/inquiries/assign", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, assigned_to: assignedTo ? Number(assignedTo) : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to assign");
      setInquiries((current) =>
        current.map((inq) =>
          inq.unique_code === uniqueCode
            ? { ...inq, assigned_to: data.inquiry.assigned_to, assigned_at: data.inquiry.assigned_at, assigned_ref_name: data.inquiry.assigned_ref_name, assigned_to_name: data.inquiry.assigned_to_name, status: data.inquiry.status }
            : inq
        )
      );
      // If the active filter would now hide this inquiry (e.g. "new" filter after status → "assigned"),
      // reset to "all" so the admin can still see it.
      if (statusFilter !== "all" && statusFilter !== data.inquiry.status) {
        setStatusFilter("all");
      }
    } catch (e) { alert(e.message); }
  };

  const handleStatusChange = async (uniqueCode, status) => {
    try {
      const response = await fetch("/api/inquiries/status", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, status, changed_by: Number(localStorage.getItem("userId")) || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update status");
      setInquiries((current) =>
        current.map((inq) =>
          inq.unique_code === uniqueCode
            ? { ...inq, status: data.inquiry.status, in_progress_at: data.inquiry.in_progress_at, quoted_at: data.inquiry.quoted_at }
            : inq
        )
      );
    } catch (e) { alert(e.message); }
  };

  const handleRemarkSave = async (uniqueCode, remark) => {
    try {
      await fetch("/api/inquiries/remark", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unique_code: uniqueCode, remark }),
      });
      setInquiries((current) =>
        current.map((inq) =>
          inq.unique_code === uniqueCode ? { ...inq, remark } : inq
        )
      );
    } catch {}
  };

  useEffect(() => {
    if (!dateOpen) return;
    const handle = (e) => { if (!dateRef.current?.contains(e.target)) setDateOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dateOpen]);

  const [expandedCodes, setExpandedCodes] = useState(new Set());
  const toggleExpand = useCallback((code) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const rows = useMemo(() => groupedInquiries.flatMap((group) => {
    const items = group.items;
    const isExpanded = expandedCodes.has(group.queryKey);
    const visible = isExpanded ? items : [items[0]];
    return visible.map((item, idx) => ({
      inquiry:     group.parent,
      item,
      queryKey:    group.queryKey,
      isFirstItem: idx === 0,
      groupSize:   items.length,
      isExpanded,
      isChildRow:  isExpanded && idx > 0,
    }));
  }), [groupedInquiries, expandedCodes]);

  return (
    <section className="rounded-2xl" style={{ background: "#ffffff", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
      <div className="flex flex-col gap-3 border-b border-[#D8E3F8] px-5 py-4 lg:flex-row lg:items-center lg:justify-between rounded-t-2xl overflow-hidden" style={{ background: "linear-gradient(90deg,#F5F8FF 0%,#F0F6FF 100%)" }}>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Inquiries</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{groupedInquiries.length} of {totalCount} groups</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterButton>
          {STATUS_OPTIONS.slice(0, 7).map((opt) => (
            <FilterButton key={opt.value} active={statusFilter === opt.value} onClick={() => setStatusFilter(opt.value)}>
              {opt.label}
            </FilterButton>
          ))}
          <div className="ml-1 h-4 w-px bg-slate-200" />
          {(statusFilter !== "all" || assignmentFilter !== "all" || executiveFilter !== "all" || dateFrom || dateTo || priceFilter !== "all") && (
            <button
              onClick={onClearFilters}
              className="h-7 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-100"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={onAutoAssign}
            className="h-7 rounded-lg px-3 text-[11px] font-semibold text-white transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", boxShadow: "0 1px 6px rgba(245,158,11,0.32)" }}
            title="Auto-assign new inquiries by client name mapping"
          >
            Auto Assign
          </button>
          {!selectionMode ? (
            <button
              onClick={enterSelectionMode}
              className="h-7 rounded-lg border border-[#C8D6F0] bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-[#EEF4FF] hover:text-[#4461A8]"
            >
              Select
            </button>
          ) : (
            <>
              <button
                onClick={cancelSelectionMode}
                className="h-7 rounded-lg border border-[#C8D6F0] bg-white px-3 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              {selected.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="h-7 rounded-lg bg-rose-600 px-3 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {bulkDeleting ? "Deleting…" : `Delete Selected (${selected.size})`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        {/* Derive visible column indices so the Select column is hidden outside selection mode
            while keeping colWidths indices stable for the resize handler. */}
        {(() => {
          const visibleIdxs = ADMIN_COLS.map((_, i) => i).filter(
            (i) => selectionMode || ADMIN_COLS[i].label !== "Select"
          );
          const colCount = visibleIdxs.length;
          return (
        <table className="border-collapse text-[11px]" style={{ tableLayout: "fixed", width: "100%", minWidth: 900 }}>
          <colgroup>
            {visibleIdxs.map((origIdx) => <col key={origIdx} style={{ width: colWidths[origIdx] }} />)}
          </colgroup>
          <thead>
            <tr className="text-left">
              {visibleIdxs.map((origIdx) => {
                const col = ADMIN_COLS[origIdx];
                return (
                <th
                  key={col.label}
                  style={{ position: "sticky", top: 0, zIndex: 10, background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}
                  className="align-top border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0 select-none"
                >
                  {col.label === "Select" ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Select all"
                      className="h-3.5 w-3.5 cursor-pointer"
                    />
                  ) : col.label === "Received" ? (
                    <div className="relative pr-1" ref={dateRef}>
                      <div className="flex items-center gap-1">
                        <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">Received</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDateOpen((v) => !v); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`ml-auto flex h-5 items-center gap-0.5 rounded border px-1.5 text-[9px] font-semibold transition ${
                            dateFrom || dateTo
                              ? "border-[#5BA7FF] bg-[#EEF6FF] text-[#1D6FD8]"
                              : "border-[#C8D6F0] bg-white/90 text-slate-500 hover:bg-[#EEF4FF]"
                          }`}
                        >
                          {dateFrom || dateTo ? "●" : "▾"} Date
                        </button>
                      </div>
                      {dateOpen && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-[#D0DCF4] bg-white p-3 shadow-lg"
                        >
                          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Date Range</p>
                          <label className="mb-1 block text-[9px] text-slate-500">From</label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            max={dateTo || undefined}
                            className="mb-2 h-7 w-full rounded border border-[#C8D6F0] bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-[#5BA7FF]"
                          />
                          <label className="mb-1 block text-[9px] text-slate-500">To</label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            min={dateFrom || undefined}
                            className="mb-3 h-7 w-full rounded border border-[#C8D6F0] bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-[#5BA7FF]"
                          />
                          <div className="flex gap-2">
                            {(dateFrom || dateTo) && (
                              <button
                                onClick={() => { setDateFrom(""); setDateTo(""); }}
                                className="flex-1 h-7 rounded-lg border border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-600 hover:bg-rose-100"
                              >
                                Clear
                              </button>
                            )}
                            <button
                              onClick={() => setDateOpen(false)}
                              className="flex-1 h-7 rounded-lg border border-[#C8D6F0] bg-white text-[10px] font-semibold text-slate-600 hover:bg-[#EEF4FF]"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : col.label === "F Unique Code" ? (
                    <div className="flex flex-col gap-1 pr-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">F Unique Code</span>
                      <select
                        value={priceFilter}
                        onChange={(e) => setPriceFilter(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-5 w-full rounded border border-[#C8D6F0] bg-white/90 px-1 text-[9px] font-semibold text-slate-600 outline-none cursor-pointer normal-case tracking-normal"
                        style={{ letterSpacing: 0 }}
                      >
                        <option value="all">All Prices</option>
                        <option value="none">No prices yet</option>
                        <option value="unread">Unread prices</option>
                        <option value="viewed">Prices viewed</option>
                      </select>
                    </div>
                  ) : col.label === "Allocation" ? (
                    <div className="flex flex-col gap-1 pr-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">Allocation</span>
                      <select
                        value={assignmentFilter}
                        onChange={(e) => setAssignmentFilter(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-5 w-full rounded border border-[#C8D6F0] bg-white/90 px-1 text-[9px] font-semibold text-slate-600 outline-none cursor-pointer normal-case tracking-normal"
                        style={{ letterSpacing: 0 }}
                      >
                        <option value="all">All</option>
                        <option value="over24h">Over 24h</option>
                        <option value="over48h">Over 48h</option>
                      </select>
                      <select
                        value={executiveFilter}
                        onChange={(e) => setExecutiveFilter(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-5 w-full rounded border border-[#C8D6F0] bg-white/90 px-1 text-[9px] font-semibold text-slate-600 outline-none cursor-pointer normal-case tracking-normal"
                        style={{ letterSpacing: 0 }}
                      >
                        <option value="all">All Executives</option>
                        <option value="unassigned">Unassigned</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="truncate block pr-2">{col.label}</span>
                  )}
                  <div
                    onMouseDown={(e) => startResize(origIdx, e)}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 1 }}
                    className="hover:bg-[#5BA7FF]/30 transition-colors"
                  />
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingRows />}
            {!isLoading && error && (
              <tr><td className="px-4 py-8 text-[13px] text-rose-600" colSpan={colCount}>{error}</td></tr>
            )}
            {!isLoading && !error && groupedInquiries.length === 0 && (
              <tr><td className="px-4 py-10 text-[13px] text-slate-400 text-center" colSpan={colCount}>No inquiries found.</td></tr>
            )}
            {!isLoading && !error &&
              rows.map(({ inquiry, item, queryKey, isFirstItem, groupSize, isExpanded, isChildRow }, index) => (
                <InquiryRow
                  key={`${queryKey}-${item?.id || index}`}
                  srNo={index + 1}
                  inquiry={inquiry}
                  item={item}
                  isFirstItem={isFirstItem}
                  groupSize={groupSize}
                  isExpanded={isExpanded}
                  isChildRow={isChildRow}
                  selectionMode={selectionMode}
                  onToggleExpand={() => toggleExpand(queryKey)}
                  now={now}
                  employees={employees}
                  selected={selected.has(queryKey)}
                  onToggleSelect={() => toggleSelect(queryKey)}
                  onAssignChange={(v)  => handleAssignChange(inquiry.unique_code, v)}
                  onStatusChange={(v)  => handleStatusChange(inquiry.unique_code, v)}
                  onDelete={() => onDeleteRequest(inquiry)}
                  onEdit={()   => onEditRequest(inquiry)}
                  onSubjectOpen={() => onSubjectOpen(inquiry)}
                  onDetailOpen={() => onDetailOpen(inquiry)}
                  onAssignToMe={() => onAssignToMeRequest(inquiry.unique_code)}
                  onRemarkSave={(remark) => handleRemarkSave(inquiry.unique_code, remark)}
                />
              ))}
          </tbody>
        </table>
          );
        })()}
      </div>

    </section>
  );
}

function VendorPriceBadge({ count, hasUnseen }) {
  if (count === 0) {
    return <p className="mt-0.5 text-[9px] text-slate-400">No prices yet</p>;
  }
  if (!hasUnseen) {
    return (
      <span className="mt-0.5 inline-block rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-600">
        Prices viewed
      </span>
    );
  }
  if (count === 1) {
    return (
      <span className="mt-0.5 inline-block rounded-full bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
        Prices arrived
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-block rounded-full bg-green-50 border border-green-300 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">
      More prices arrived
    </span>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 border ${
        active
          ? "text-white border-transparent"
          : "bg-white/80 text-slate-600 border-[#D0D8F0] hover:bg-[#EEF4FF] hover:text-[#1D6FD8] hover:border-[#BFDBFE]"
      }`}
      style={active ? { background: "linear-gradient(135deg,#5BA7FF 0%,#6D7CFF 100%)", boxShadow: "0 2px 10px rgba(91,167,255,0.35)", transform: "translateY(-1px)" } : {}}
    >
      {children}
    </button>
  );
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, rowIndex) => (
    <tr key={rowIndex}>
      {Array.from({ length: 16 }, (_, cellIndex) => (
        <td key={cellIndex} className="border-b border-r border-[#DCE6F7] px-2 py-2.5 last:border-r-0">
          <div className="skeleton h-3.5" style={{ width: cellIndex === 9 ? "75%" : cellIndex === 4 ? "65%" : "55%" }} />
        </td>
      ))}
    </tr>
  ));
}

const InquiryRow = memo(function InquiryRow({ srNo, inquiry, item, isFirstItem, groupSize, isExpanded, isChildRow, selectionMode, onToggleExpand, now, employees, selected, onToggleSelect, onAssignChange, onStatusChange, onDelete, onEdit, onSubjectOpen, onDetailOpen, onAssignToMe, onRemarkSave }) {
  const status = inquiry.status || "new";
  const part   = item.partNumber || "—";
  const brand  = item.brand      || "-";
  const uom    = item.uom        || "-";
  const qty    = item.quantity   || "—";

  const [pendingAssign, setPendingAssign] = useState(null);

  const [remarkText, setRemarkText] = useState(inquiry.remark || "");
  const [remarkSaved, setRemarkSaved] = useState(false);
  useEffect(() => { setRemarkText(inquiry.remark || ""); }, [inquiry.remark]);

  const handleRemarkBlur = async () => {
    if (remarkText === (inquiry.remark || "")) return;
    await onRemarkSave(remarkText);
    setRemarkSaved(true);
    setTimeout(() => setRemarkSaved(false), 2000);
  };

  return (
    <tr
      className="border-b border-[#DCE6F7] transition-all duration-150 table-row-animate"
      style={{ background: isChildRow ? "rgba(238,246,255,0.85)" : isFirstItem ? "rgba(255,255,255,0.9)" : "rgba(245,248,255,0.7)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(90deg,#EEF6FF 0%,#F5F9FF 100%)"; e.currentTarget.style.boxShadow = isChildRow ? "inset 6px 0 0 #93C5FD" : "inset 3px 0 0 #5BA7FF"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isChildRow ? "rgba(238,246,255,0.85)" : isFirstItem ? "rgba(255,255,255,0.9)" : "rgba(245,248,255,0.7)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Select — only rendered when selection mode is active */}
      {selectionMode && (
        <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
          {isFirstItem && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 cursor-pointer"
            />
          )}
        </td>
      )}

      {/* Sr No. */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="text-[11px] font-medium text-slate-500 tabular-nums">{srNo}</p>
      </td>

      {/* Received */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem ? <EmailDateCell dateStr={inquiry.email_date} /> : null}
      </td>

      {/* F Unique Code */}
      <td
        className="border-r border-[#DCE6F7] px-2 py-2 align-middle"
        onDoubleClick={isFirstItem ? onDetailOpen : undefined}
        style={{ cursor: isFirstItem ? "pointer" : "default" }}
        title={isFirstItem ? "Double-click to view full details" : undefined}
      >
        {isChildRow ? (
          <p className="pl-4 text-[10px] text-slate-400 italic">↳ item</p>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {groupSize > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#C8D6F0] bg-white text-[10px] font-bold text-[#4461A8] hover:bg-[#EEF4FF] transition"
                  title={isExpanded ? "Collapse items" : "Expand items"}
                >
                  {isExpanded ? "−" : "+"}
                </button>
              )}
              <p className="whitespace-nowrap font-semibold text-slate-900 text-[11px]">{inquiry.unique_code}</p>
            </div>
            {groupSize > 1 && (
              <p className="mt-0.5 text-[9px] text-[#5BA7FF] font-medium pl-5">
                {isExpanded
                  ? `Showing ${groupSize} items`
                  : `${groupSize - 1} more item${groupSize - 1 > 1 ? "s" : ""}`}
              </p>
            )}
            <VendorPriceBadge count={Number(inquiry.vendor_price_count) || 0} hasUnseen={Boolean(inquiry.has_unseen_prices)} />
          </>
        )}
      </td>

      {/* Client Name */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="truncate font-medium text-slate-800 text-[11px]">
          {isFirstItem ? inquiry.client_name || "—" : ""}
        </p>
      </td>

      {/* Location */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="truncate text-[11px] text-slate-600">{isFirstItem ? inquiry.location || "—" : ""}</p>
      </td>

      {/* User Name */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="truncate font-medium text-slate-800 text-[11px]">
          {isFirstItem ? inquiry.sender_name || "—" : ""}
        </p>
        <p className="truncate text-[11px] text-slate-400">
          {isFirstItem ? inquiry.sender_email || "" : ""}
        </p>
      </td>

      {/* PR # */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem && inquiry.subject ? (
          <button
            type="button"
            onClick={onSubjectOpen}
            title="Click to view full subject"
            className="block max-w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-[#1D6FD8] transition hover:bg-[#EFF6FF] hover:text-[#1559B7]"
          >
            {inquiry.subject}
          </button>
        ) : (
          <p className="text-[11px] text-slate-400">-</p>
        )}
      </td>

      {/* Brand */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="truncate text-[11px] text-slate-700">{brand}</p>
      </td>

      {/* Part Number */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="truncate font-medium text-slate-900 text-[11px]">{part}</p>
      </td>

      {/* UOM */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="text-[11px] text-slate-700">{uom}</p>
      </td>

      {/* Qty */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        <p className="font-medium text-slate-800 text-[11px]">{qty}</p>
      </td>

      {/* Allocation */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <select
                value={pendingAssign !== null ? pendingAssign : (inquiry.assigned_to || "")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__self__") { onAssignToMe(); return; }
                  const current = String(inquiry.assigned_to || "");
                  if (val === current) { setPendingAssign(null); return; }
                  setPendingAssign(val);
                }}
                className="h-7 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none cursor-pointer transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
              >
                <option value="">Unassigned</option>
                <option value="__self__">— Assign to Me —</option>
                {inquiry.assigned_to && !employees.find((e) => e.id === inquiry.assigned_to) && (
                  <option value={inquiry.assigned_to}>
                    {inquiry.assigned_to_name || "Admin"}
                  </option>
                )}
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              {pendingAssign !== null && (
                <>
                  <button
                    onClick={() => { onAssignChange(pendingAssign); setPendingAssign(null); }}
                    title="Confirm"
                    className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-600 text-[10px] font-bold transition"
                  >✓</button>
                  <button
                    onClick={() => setPendingAssign(null)}
                    title="Cancel"
                    className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-500 text-[10px] font-bold transition"
                  >✕</button>
                </>
              )}
            </div>
            {inquiry.assigned_at && (
              <p className={`text-[10px] font-medium tabular-nums whitespace-nowrap px-0.5 ${timerClass(inquiry.assigned_at, now)}`}>
                {formatAssignmentAge(inquiry.assigned_at, now)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-7 items-center">
            <span className="text-[11px] font-medium text-slate-500">
              {inquiry.assigned_to_name || "—"}
            </span>
          </div>
        )}
      </td>

      {/* Status */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem ? (
          <div className="flex flex-col gap-0.5">
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="h-7 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none cursor-pointer transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {inquiry.status === "in_progress" && inquiry.in_progress_at && (
              <p className="text-[10px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap px-0.5">
                {formatAssignmentAge(inquiry.in_progress_at, now)}
              </p>
            )}
            {inquiry.status === "quoted" && inquiry.quoted_at && (
              <p className="text-[10px] font-semibold text-violet-700 tabular-nums whitespace-nowrap px-0.5">
                {formatAssignmentAge(inquiry.quoted_at, now)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-7 items-center">
            <StatusBadge status={status} />
          </div>
        )}
      </td>

      {/* Remark — editable only on first item row */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-top">
        {isFirstItem && (
          <div className="relative">
            <textarea
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              onBlur={handleRemarkBlur}
              rows={2}
              placeholder="Add remark…"
              className="w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-slate-700 outline-none transition hover:border-[#E4E8EE] focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10 focus:bg-white placeholder:text-slate-300"
            />
            {remarkSaved && (
              <span className="absolute right-1 top-0.5 text-[10px] text-emerald-500 font-semibold">Saved ✓</span>
            )}
          </div>
        )}
      </td>

      {/* Actions — only on first item row */}
      <td className="px-2 py-2 align-middle">
        {isFirstItem && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onEdit}
              title="Edit inquiry"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#E4E8EE] bg-white text-slate-500 transition hover:bg-[#EFF6FF] hover:border-[#BFDBFE] hover:text-[#1D6FD8]"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onDelete}
              title="Delete inquiry"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#E4E8EE] bg-white text-slate-500 transition hover:bg-[#FFF1F2] hover:border-[#FECDD3] hover:text-rose-600"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
// Custom comparator: skip re-render unless the row's DATA changed.
// Function props (handlers) are intentionally excluded — they close over
// stable values and re-creating them with new references does not change
// their behaviour. `now` is excluded so the 30-second clock tick does not
// force every visible row to re-render.
}, (prev, next) =>
  prev.srNo          === next.srNo          &&
  prev.inquiry       === next.inquiry       &&
  prev.item          === next.item          &&
  prev.isFirstItem   === next.isFirstItem   &&
  prev.groupSize     === next.groupSize     &&
  prev.isExpanded    === next.isExpanded    &&
  prev.isChildRow    === next.isChildRow    &&
  prev.selectionMode === next.selectionMode &&
  prev.selected      === next.selected      &&
  prev.employees     === next.employees
);

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClasses[status] || statusClasses.new}`}
      style={{ background: statusGrad[status] || statusGrad.new }}
    >
      {formatStatus(status)}
    </span>
  );
}

/* ──────────────────────────────────────────────
   SALES OVERVIEW
─────────────────────────────────────────────── */
function formatAssignmentAge(assignedAt, now) {
  if (!assignedAt) return "-";

  const diffMinutes = Math.max(0, Math.floor((now - new Date(assignedAt).getTime()) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function timerClass(assignedAt, now) {
  if (!assignedAt) return "text-slate-400";

  const hours = (now - new Date(assignedAt).getTime()) / 36e5;
  if (hours > 48) return "text-rose-600";
  if (hours > 24) return "text-amber-600";
  return "text-emerald-700";
}

/* ──────────────────────────────────────────────
   BLOCKED CLIENTS
─────────────────────────────────────────────── */
function BlockedClientsPanel({ blocked, onAdd, onRemove, busy }) {
  const [email, setEmail] = useState("");

  const submit = () => {
    const value = email.trim();
    if (!value) return;
    onAdd(value);
    setEmail("");
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white card-shadow">
      <div className="border-b border-[#EEF2F6] px-5 py-4" style={{ background: "linear-gradient(90deg,#FFF1F2,#FFF5F5)" }}>
        <div className="flex items-center gap-2">
          <Ban size={14} className="text-rose-600" />
          <h3 className="text-[14px] font-semibold text-slate-900">Blocked Clients</h3>
          <span className="ml-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            {blocked.length}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Mail from a blocked sender is skipped before parsing — no inquiry or reminder is created.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex gap-2 max-w-md">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="client@example.com"
            className="h-8 flex-1 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
          />
          <button
            onClick={submit}
            disabled={busy || !email.trim()}
            className="h-8 rounded-lg bg-rose-600 px-3 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            Block
          </button>
        </div>

        {blocked.length === 0 ? (
          <p className="text-[11px] italic text-slate-400">No clients blocked yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {blocked.map((b) => (
              <span
                key={b.id}
                title={b.client_name || ""}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700"
              >
                {b.client_name ? `${b.client_name} — ` : ""}{b.sender_email}
                <button
                  onClick={() => onRemove(b.id)}
                  disabled={busy}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-200 hover:text-rose-800 disabled:opacity-40"
                  title="Unblock"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccessControlPanel({ users, usersError, onUsersChanged, blockedClients, onBlockClient, onUnblockClient, blockBusy }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clientAssignments, setClientAssignments] = useState([]);
  const [clientNames,       setClientNames]       = useState([]);

  const activeUsers = users.filter((user) => user.is_active);
  const employees = activeUsers.filter((user) => user.role === "employee");
  const admins = activeUsers.filter((user) => user.role === "admin");

  const fetchClientAssignments = async () => {
    try {
      const res = await fetch("/api/client-assignments");
      const data = await res.json();
      if (res.ok) {
        setClientAssignments(data.assignments || []);
        setClientNames(data.clientNames || []);
      }
    } catch { /* silent */ }
  };

  useEffect(() => { fetchClientAssignments(); }, []);

  const updateEdit = (id, field, value) => {
    setEditing((current) => ({
      ...current,
      [id]: {
        name: current[id]?.name ?? users.find((user) => user.id === id)?.name ?? "",
        email: current[id]?.email ?? users.find((user) => user.id === id)?.email ?? "",
        phone: current[id]?.phone ?? users.find((user) => user.id === id)?.phone ?? "",
        password: current[id]?.password ?? "",
        ...current[id],
        [field]: value,
      },
    }));
  };

  const createEmployee = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "employee" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to add employee");
      setForm({ name: "", email: "", phone: "", password: "" });
      setMessage("Employee added.");
      await onUsersChanged();
    } catch (err) {
      setError(err.message || "Failed to add employee");
    } finally {
      setBusy(false);
    }
  };

  const saveUser = async (user) => {
    const next = editing[user.id] || {};
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          name: next.name ?? user.name,
          email: next.email ?? user.email,
          phone: next.phone ?? user.phone,
          password: next.password || undefined,
          role: user.role,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update user");
      setEditing((current) => ({ ...current, [user.id]: { name: data.user.name, email: data.user.email, phone: data.user.phone, password: "" } }));
      setMessage("Login updated.");
      await onUsersChanged();
    } catch (err) {
      setError(err.message || "Failed to update user");
    } finally {
      setBusy(false);
    }
  };

  const removeEmployee = async (user) => {
    if (!confirm(`Remove ${user.name}? Assigned queries will become New and unassigned.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to remove employee");
      setMessage("Employee removed.");
      await onUsersChanged();
    } catch (err) {
      setError(err.message || "Failed to remove employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-white p-5 card-shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Access Control</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Manage employee login IDs, passwords and access.</p>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">
            {employees.length} employees
          </span>
        </div>

        {(usersError || error) && (
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
            {usersError || error}
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-3 rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            placeholder="Employee name"
            className="h-9 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] outline-none focus:border-[#5BA7FF]"
          />
          <input
            value={form.email}
            onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
            placeholder="Login email"
            className="h-9 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] outline-none focus:border-[#5BA7FF]"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
            placeholder="Phone (for vendor/client emails)"
            className="h-9 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] outline-none focus:border-[#5BA7FF]"
          />
          <input
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
            placeholder="Password"
            type="password"
            className="h-9 rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] outline-none focus:border-[#5BA7FF]"
          />
          <button
            onClick={createEmployee}
            disabled={busy}
            className="h-9 rounded-lg bg-[#1D6FD8] px-4 text-[12px] font-semibold text-white transition hover:bg-[#1559B7] disabled:opacity-60"
          >
            Add Employee
          </button>
        </div>
      </div>

      <UserAccessTable
        title="Employees"
        users={employees}
        editing={editing}
        busy={busy}
        onEdit={updateEdit}
        onSave={saveUser}
        onRemove={removeEmployee}
      />

      <UserAccessTable
        title="Admin Login"
        users={admins}
        editing={editing}
        busy={busy}
        onEdit={updateEdit}
        onSave={saveUser}
      />

      <ClientMappingPanel
        employees={employees}
        assignments={clientAssignments}
        clientNames={clientNames}
        onChanged={fetchClientAssignments}
      />

      <BlockedClientsPanel
        blocked={blockedClients}
        onAdd={(senderEmail) => onBlockClient(senderEmail, null)}
        onRemove={onUnblockClient}
        busy={blockBusy}
      />
    </section>
  );
}

function ClientMappingPanel({ employees, assignments, clientNames = [], onChanged }) {
  const [inputs,       setInputs]       = useState({});
  const [busy,         setBusy]         = useState(false);
  const [focusedEmp,   setFocusedEmp]   = useState(null);
  const [dropOpen,     setDropOpen]     = useState(false);

  const byEmployee = employees.reduce((acc, emp) => {
    acc[emp.id] = assignments.filter((a) => Number(a.employee_id) === Number(emp.id));
    return acc;
  }, {});

  const getSuggestions = (empId) => {
    const val = (inputs[empId] || "").trim().toLowerCase();
    if (!val) return [];
    const already = new Set((byEmployee[empId] || []).map((a) => a.client_name.toLowerCase()));
    return clientNames
      .filter((n) => n.toLowerCase().includes(val) && !already.has(n.toLowerCase()))
      .slice(0, 8);
  };

  const addClient = async (employeeId) => {
    const name = (inputs[employeeId] || "").trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/client-assignments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ employee_id: employeeId, client_name: name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add");
      setInputs((prev) => ({ ...prev, [employeeId]: "" }));
      await onChanged();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const removeClient = async (id) => {
    setBusy(true);
    try {
      const res = await fetch("/api/client-assignments", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to remove");
      await onChanged();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white card-shadow">
      <div className="border-b border-[#EEF2F6] px-5 py-4" style={{ background: "linear-gradient(90deg,#FFFBEB,#FEF3C7)" }}>
        <h3 className="text-[14px] font-semibold text-slate-900">Client → Employee Routing</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Map client names to employees. The <strong>Auto Assign</strong> button on the dashboard will assign new inquiries automatically based on this list.
        </p>
      </div>

      {employees.length === 0 ? (
        <p className="px-5 py-8 text-center text-[12px] text-slate-400">No employees found. Add employees above first.</p>
      ) : (
        <div className="divide-y divide-[#EEF2F6]">
          {employees.map((emp) => {
            const clients = byEmployee[emp.id] || [];
            return (
              <div key={emp.id} className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" }}
                  >
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-semibold text-slate-800">{emp.name}</span>
                  <span className="ml-auto rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    {clients.length} client{clients.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5 min-h-[24px]">
                  {clients.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E8EE] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {a.client_name}
                      <button
                        onClick={() => removeClient(a.id)}
                        disabled={busy}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-300 transition hover:bg-rose-100 hover:text-rose-600 disabled:opacity-40"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {clients.length === 0 && (
                    <span className="text-[11px] italic text-slate-400">No clients mapped yet</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={inputs[emp.id] || ""}
                      onChange={(e) => { setInputs((prev) => ({ ...prev, [emp.id]: e.target.value })); setDropOpen(true); }}
                      onFocus={() => { setFocusedEmp(emp.id); setDropOpen(true); }}
                      onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                      onKeyDown={(e) => e.key === "Enter" && addClient(emp.id)}
                      placeholder="Type client name and press Enter…"
                      className="h-8 w-full rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] outline-none focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
                    />
                    {focusedEmp === emp.id && dropOpen && getSuggestions(emp.id).length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[#E4E8EE] bg-white" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                        {getSuggestions(emp.id).map((name) => (
                          <button
                            key={name}
                            onMouseDown={() => { setInputs((prev) => ({ ...prev, [emp.id]: name })); setDropOpen(false); }}
                            className="w-full px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-[#EFF6FF] hover:text-[#1D6FD8]"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addClient(emp.id)}
                    disabled={busy || !inputs[emp.id]?.trim()}
                    className="h-8 rounded-lg bg-[#1D6FD8] px-3 text-[11px] font-semibold text-white transition hover:bg-[#1559B7] disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserAccessTable({ title, users, editing, busy, onEdit, onSave, onRemove }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white card-shadow">
      <div className="border-b border-[#EEF2F6] px-5 py-4">
        <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#F8FAFC] text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">Name</th>
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">Login ID</th>
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">Phone</th>
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">New Password</th>
              <th className="border-b border-[#E6EBF2] px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const current = editing[user.id] || {};
              return (
                <tr key={user.id} className="border-b border-[#EEF2F6] transition hover:bg-[#F8FAFC]">
                  <td className="border-r border-[#EEF2F6] px-3 py-2">
                    <input
                      value={current.name ?? user.name}
                      onChange={(e) => onEdit(user.id, "name", e.target.value)}
                      className="h-8 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#5BA7FF]"
                    />
                  </td>
                  <td className="border-r border-[#EEF2F6] px-3 py-2">
                    <input
                      value={current.email ?? user.email}
                      onChange={(e) => onEdit(user.id, "email", e.target.value)}
                      className="h-8 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#5BA7FF]"
                    />
                  </td>
                  <td className="border-r border-[#EEF2F6] px-3 py-2">
                    <input
                      value={current.phone ?? user.phone ?? ""}
                      onChange={(e) => onEdit(user.id, "phone", e.target.value)}
                      placeholder="Used in vendor/client emails"
                      className="h-8 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#5BA7FF]"
                    />
                  </td>
                  <td className="border-r border-[#EEF2F6] px-3 py-2">
                    <input
                      value={current.password ?? ""}
                      onChange={(e) => onEdit(user.id, "password", e.target.value)}
                      placeholder="Leave blank to keep"
                      type="password"
                      className="h-8 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] outline-none focus:border-[#5BA7FF]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSave(user)}
                        disabled={busy}
                        className="h-8 rounded-lg bg-slate-900 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        Save
                      </button>
                      {onRemove && (
                        <button
                          onClick={() => onRemove(user)}
                          disabled={busy}
                          className="h-8 rounded-lg border border-rose-100 bg-rose-50 px-3 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-slate-400">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TEAM_COLORS = [
  { grad: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", glow: "rgba(91,167,255,0.25)"  },
  { grad: "linear-gradient(135deg,#7FD8BE,#34D399)", glow: "rgba(127,216,190,0.25)" },
  { grad: "linear-gradient(135deg,#8C9EFF,#A78BFA)", glow: "rgba(140,158,255,0.25)" },
];

function SalesOverview({ inquiries, users }) {
  const employees = users.filter((u) => u.role === "employee" && u.is_active);
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
      <div className="border-b border-[#D8E3F8] px-5 py-4" style={{ background: "linear-gradient(90deg,#F5F8FF 0%,#F0F6FF 100%)" }}>
        <h3 className="text-[15px] font-semibold text-slate-900">Sales Overview</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Team performance at a glance</p>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {employees.map((user, idx) => {
          const mine   = inquiries.filter((i) => i.assigned_to === user.id);
          const quoted = mine.filter((i) => i.status === "quoted").length;
          const active = mine.filter((i) => i.status === "in_progress").length;
          const fresh  = mine.filter((i) => i.status === "assigned").length;
          return (
            <TeamCard
              key={user.id}
              name={user.name}
              initial={user.name.charAt(0).toUpperCase()}
              quoted={quoted}
              active={active}
              fresh={fresh}
              colorIdx={idx}
            />
          );
        })}
        {!employees.length && (
          <p className="text-[12px] text-slate-400 text-center py-4">No employees found.</p>
        )}
      </div>
    </section>
  );
}

function TeamCard({ name, initial, quoted, active, fresh, colorIdx }) {
  const c = TEAM_COLORS[colorIdx % TEAM_COLORS.length];
  return (
    <div
      className="flex items-center gap-4 rounded-xl border px-4 py-3 cursor-default transition-all duration-200"
      style={{ background: "rgba(255,255,255,0.7)", borderColor: "#D8E3F8" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(90deg,#F0F6FF,#F5F8FF)"; e.currentTarget.style.transform = "translateX(4px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.7)"; e.currentTarget.style.transform = "translateX(0)"; }}
    >
      <div className="flex items-center gap-2.5 w-36 shrink-0">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: c.grad, boxShadow: `0 3px 10px ${c.glow}` }}>
          {initial}
        </span>
        <p className="text-[14px] font-semibold text-slate-800">{name}</p>
      </div>
      <div className="h-8 w-px bg-[#D8E3F8] shrink-0" />
      <div className="flex flex-1 gap-3">
        <TeamStat label="Quoted" value={quoted} grad="linear-gradient(135deg,#EFF6FF,#DBEAFE)" color="#1D6FD8" />
        <TeamStat label="Active" value={active} grad="linear-gradient(135deg,#EFFAF6,#A7F3D0)" color="#059669" />
        <TeamStat label="New"    value={fresh}  grad="linear-gradient(135deg,#F5F3FF,#DDD6FE)" color="#6D28D9" />
      </div>
    </div>
  );
}

function TeamStat({ label, value, grad, color }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-4 py-2 border border-transparent" style={{ background: grad }}>
      <p className="text-[20px] font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight text-slate-400">{label}</p>
    </div>
  );
}

function formatEmailDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
}

function EmailDateCell({ dateStr }) {
  const parts = formatEmailDate(dateStr);
  if (!parts) return <span className="text-[11px] text-slate-400">—</span>;
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-700 tabular-nums whitespace-nowrap">{parts.date}</p>
      <p className="text-[10px] text-slate-400 tabular-nums">{parts.time}</p>
    </div>
  );
}

function formatStatus(status) {
  if (!status) return "New";
  return status.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/* ──────────────────────────────────────────────
   REMINDERS PAGE
─────────────────────────────────────────────── */
function RemindersPage({ reminders, isLoading, onAddInquiry }) {
  const unread = reminders.filter((r) => r.status === "unread").length;

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  };

  const statusMap = {
    unread  : { label: "Unread",   cls: "text-[#1D6FD8] border-[#BFDBFE] bg-[#EFF6FF]" },
    seen    : { label: "Seen",     cls: "text-slate-500 border-[#E4E8EE] bg-[#F8FAFC]" },
    actioned: { label: "Actioned", cls: "text-[#059669] border-[#6EE7B7] bg-[#EFFAF6]" },
  };

  return (
    <section className="rounded-2xl overflow-hidden animate-fade-up" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
      <div className="flex items-center justify-between border-b border-[#D8E3F8] px-5 py-4" style={{ background: "linear-gradient(90deg,#F5F8FF 0%,#F0F6FF 100%)" }}>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Follow-up Reminders</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Client reply emails — convert to inquiry manually if needed</p>
        </div>
        <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#1D6FD8]">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[11px]">
          <thead>
            <tr style={{ background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}>
              {["S.No.", "Date", "FIAPL Code", "Client", "Summary", "Status", "Action"].map((h) => (
                <th key={h} className="border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-[12px] text-slate-400">Loading reminders…</td></tr>
            )}
            {!isLoading && reminders.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[12px] text-slate-400">No reminders yet</td></tr>
            )}
            {!isLoading && reminders.map((r, i) => {
              const s = statusMap[r.status] || statusMap.unread;
              return (
                <tr
                  key={r.id}
                  className="border-b border-[#DCE6F7] transition-all duration-150"
                  style={{ background: r.status === "unread" ? "rgba(239,246,255,0.6)" : "rgba(255,255,255,0.9)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(90deg,#EEF6FF 0%,#F5F9FF 100%)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = r.status === "unread" ? "rgba(239,246,255,0.6)" : "rgba(255,255,255,0.9)"; }}
                >
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(r.received_at)}</td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5">
                    {r.unique_code
                      ? <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#1D6FD8]">{r.unique_code}</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5 font-medium text-slate-800">{r.sender_name || r.sender_email || "—"}</td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5 max-w-[280px]">
                    <p className="truncate text-slate-600" title={r.llm_summary || r.subject}>{r.llm_summary || r.subject || "—"}</p>
                  </td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.status !== "actioned"
                      ? (
                        <button
                          onClick={() => onAddInquiry(r)}
                          className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-white transition hover:opacity-90"
                          style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
                        >
                          <Plus size={11} /> Add Inquiry
                        </button>
                      )
                      : <span className="text-[10px] font-semibold text-[#059669]">Done ✓</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   ADD INQUIRY MODAL
─────────────────────────────────────────────── */
function AddInquiryModal({ reminder, onClose, onSuccess }) {
  const extractedItems = (reminder?.line_items || [])
    .filter((i) => i && (i.brand || i.part_number))
    .map((i) => ({
      brand       : i.brand        || "",
      part_number : i.part_number  || "",
      quantity    : String(i.quantity ?? ""),
      notes       : i.notes        || "",
    }));

  const [form, setForm] = useState({
    client_name  : reminder?.client_name
                   || extractedItems[0]?.client_name
                   || reminder?.sender_name  || "",
    location     : extractedItems[0]?.location || "",
    sender_name  : reminder?.sender_name
                   || extractedItems[0]?.username || "",
    sender_email : reminder?.sender_email
                   || extractedItems[0]?.sender_email || "",
    subject      : reminder?.subject      || "",
    notes        : reminder?.llm_summary  || "",
  });
  const [items, setItems] = useState(
    extractedItems.length > 0
      ? extractedItems
      : [{ brand: "", part_number: "", quantity: "", notes: "" }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const updateField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const updateItem  = (idx, key, val) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  const addItem     = () => setItems((prev) => [...prev, { brand: "", part_number: "", quantity: "", notes: "" }]);
  const removeItem  = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/inquiries/manual", {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify({
          ...form,
          items      : items.filter((i) => i.brand || i.part_number),
          reminder_id: reminder?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create inquiry");
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldCls = "h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-3 text-[13px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl card-shadow-lg animate-modal overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EEF2F6] p-5" style={{ background: "linear-gradient(90deg,#F5F8FF,#F0F6FF)" }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Manual Inquiry</p>
            <h3 className="text-[16px] font-semibold text-slate-900 mt-0.5">Add from Reminder</h3>
            {reminder?.unique_code && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Linked to <span className="font-semibold text-[#1D6FD8]">{reminder.unique_code}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition">
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "client_name",  label: "Client Name",  placeholder: "Company" },
              { key: "location",     label: "Location",     placeholder: "City, State" },
              { key: "sender_name",  label: "Sender Name",  placeholder: "Contact person" },
              { key: "sender_email", label: "Sender Email", placeholder: "email@company.com" },
            ].map(({ key, label, placeholder }) => (
              <label key={key} className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-slate-500">{label}</span>
                <input value={form[key]} onChange={(e) => updateField(key, e.target.value)} placeholder={placeholder} className={fieldCls} />
              </label>
            ))}
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Subject</span>
              <input value={form.subject} onChange={(e) => updateField("subject", e.target.value)} className={fieldCls} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Notes</span>
              <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2}
                className="w-full resize-none rounded-lg border border-[#E4E8EE] bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10" />
            </label>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Line Items</p>
              <button onClick={addItem} className="flex items-center gap-1 text-[11px] font-semibold text-[#1D6FD8] hover:text-[#1559B7] transition">
                <Plus size={12} /> Add Row
              </button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_64px_1fr_28px] gap-1.5 mb-1.5 px-0.5">
              {["Brand", "Part No.", "Qty", "Notes", ""].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-slate-400">{h}</span>
              ))}
            </div>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_64px_1fr_28px] gap-1.5 items-center">
                  <input value={item.brand}       onChange={(e) => updateItem(i, "brand",       e.target.value)} placeholder="Brand"   className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.part_number} onChange={(e) => updateItem(i, "part_number", e.target.value)} placeholder="Part No." className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.quantity}    onChange={(e) => updateItem(i, "quantity",    e.target.value)} placeholder="Qty" type="number" min="0" className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.notes}       onChange={(e) => updateItem(i, "notes",       e.target.value)} placeholder="Notes"   className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[12px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <button onClick={() => removeItem(i)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-[#FFF1F2] hover:text-rose-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-[#EEF2F6] p-5">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-[#E4E8EE] bg-white text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#5BA7FF 0%,#6D7CFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            {submitting ? "Creating…" : "Create Inquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   VENDORS PANEL
─────────────────────────────────────────────── */
function VendorsPanel() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res  = await fetch("/api/vendors");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load vendors");
        setVendors(data.vendors || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = vendors.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [v.name, v.brand, v.part_number, v.email, v.domain, v.inquiry_unique_code]
      .join(" ").toLowerCase().includes(q);
  });

  const totalWithEmail  = vendors.filter((v) => v.email).length;
  const totalAuthorized = vendors.filter((v) => v.is_authorized_dealer).length;

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4EDFF] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" }}>
            <Store size={15} className="text-white" />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">Vendor Knowledge Base</h2>
            <p className="text-[10px] text-slate-400">Auto-discovered via SearchApi.io · stored permanently · reused across all future RFQs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 font-semibold text-[#1D6FD8]">{vendors.length} vendors</span>
          <span className="rounded-full border border-[#6EE7B7] bg-[#ECFDF5] px-2.5 py-0.5 font-semibold text-emerald-700">{totalWithEmail} with email</span>
          <span className="rounded-full border border-[#C4B5FD] bg-[#F5F3FF] px-2.5 py-0.5 font-semibold text-violet-700">{totalAuthorized} authorized</span>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-[#E4EDFF] px-4 py-2.5">
        <div className="flex items-center gap-2 h-8 px-3 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] max-w-xs transition focus-within:border-[#5BA7FF] focus-within:bg-white">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, brand, part number…"
            className="flex-1 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]" style={{ minWidth: 960 }}>
          <thead>
            <tr style={{ background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}>
              {["Brand", "Part Number", "Vendor Name", "Email", "Phone", "Website", "Location", "Authorized", "Inquiry"].map((h) => (
                <th key={h} className="border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: 9 }, (_, c) => (
                  <td key={c} className="border-b border-r border-[#DCE6F7] px-3 py-2.5 last:border-r-0">
                    <div className="skeleton h-3" style={{ width: c === 2 ? "70%" : "55%" }} />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && error && (
              <tr><td colSpan={9} className="px-4 py-8 text-[12px] text-rose-600">{error}</td></tr>
            )}
            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}>
                    <Store size={20} className="text-[#1D6FD8]" />
                  </div>
                  <p className="text-[13px] font-semibold text-slate-700">No vendors discovered yet</p>
                  <p className="mt-1 text-[11px] text-slate-400">Vendors are auto-discovered 10 seconds after each RFQ email is processed.</p>
                </td>
              </tr>
            )}
            {!loading && !error && filtered.map((v, i) => (
              <tr
                key={`${v.id}-${v.brand}-${v.part_number}-${i}`}
                className="border-b border-[#EEF2F6] transition"
                style={{ background: i % 2 === 0 ? "white" : "#FAFBFF" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F0F6FF")}
                onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#FAFBFF")}
              >
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#1D6FD8]">{v.brand || "—"}</span>
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  <p className="font-mono text-[10px] font-semibold text-slate-700">{v.part_number || "—"}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  <p className="font-medium text-slate-800 truncate max-w-[150px]" title={v.name}>{v.name || "—"}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  {v.email
                    ? <a href={`mailto:${v.email}`} className="text-[#1D6FD8] hover:underline truncate block max-w-[160px]" title={v.email}>{v.email}</a>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  <p className="text-slate-600 whitespace-nowrap">{v.phone || <span className="text-slate-300">—</span>}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  {v.website
                    ? <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-[#1D6FD8] hover:underline truncate block max-w-[140px]" title={v.website}>{v.domain || v.website}</a>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2">
                  <p className="text-slate-500 text-[10px] whitespace-nowrap">{[v.city, v.country].filter(Boolean).join(", ") || <span className="text-slate-300">—</span>}</p>
                </td>
                <td className="border-r border-[#DCE6F7] px-3 py-2 text-center">
                  {v.is_authorized_dealer
                    ? <span className="inline-flex items-center rounded-full border border-[#6EE7B7] bg-[#ECFDF5] px-2 py-0.5 text-[9px] font-bold text-emerald-700">✓ Auth</span>
                    : <span className="text-slate-300 text-[10px]">—</span>}
                </td>
                <td className="px-3 py-2">
                  {v.inquiry_unique_code
                    ? <span className="font-mono text-[10px] font-semibold text-[#4451E8]">{v.inquiry_unique_code}</span>
                    : <span className="text-slate-300 text-[10px]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   QUOTATION SUMMARY PANEL
─────────────────────────────────────────────── */
const QUOTATION_STATUS_OPTIONS = [
  { value: "",          label: "All Statuses" },
  { value: "draft",     label: "Draft" },
  { value: "sent",      label: "Sent" },
  { value: "revised",   label: "Revised" },
  { value: "accepted",  label: "Accepted" },
  { value: "lost",      label: "Lost" },
  { value: "cancelled", label: "Cancelled" },
];

const REVISION_FILTER_OPTIONS = [
  { value: "all",      label: "All" },
  { value: "original", label: "Original Quotes" },
  { value: "revised",  label: "Revised Quotes Only" },
];

const QUOTE_STATUS_BADGE = {
  draft:     { bg: "#F3F4F6", text: "#6B7280", label: "Draft" },
  sent:      { bg: "#EFF6FF", text: "#1D6FD8", label: "Sent" },
  revised:   { bg: "#F5F3FF", text: "#6D28D9", label: "Revised" },
  accepted:  { bg: "#ECFDF5", text: "#059669", label: "Accepted" },
  lost:      { bg: "#FFF1F2", text: "#BE123C", label: "Lost" },
  cancelled: { bg: "#FFF1F2", text: "#BE123C", label: "Cancelled" },
};

function fmtQuoteINR(v) {
  return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtQuoteDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function QuoteStatusBadge({ status }) {
  const s = QUOTE_STATUS_BADGE[status] || QUOTE_STATUS_BADGE.sent;
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
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

function QuotationSummaryPanel({ onOpenInquiry }) {
  const [summary,    setSummary]    = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [search,            setSearch]            = useState("");
  const [statusFilter,      setStatusFilter]      = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [dateFrom,          setDateFrom]          = useState("");
  const [dateTo,            setDateTo]            = useState("");
  const [revisionFilter,    setRevisionFilter]    = useState("all");

  const [viewId,      setViewId]      = useState(null);
  const [viewData,    setViewData]    = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    fetch("/api/quotations/summary")
      .then((r) => r.json())
      .then((d) => setSummary(d.error ? null : d))
      .catch(() => setSummary(null));
  }, []);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams();
      if (search.trim())           params.set("search", search.trim());
      if (statusFilter)            params.set("status", statusFilter);
      if (salespersonFilter)       params.set("salesperson", salespersonFilter);
      if (dateFrom)                params.set("date_from", dateFrom);
      if (dateTo)                  params.set("date_to", dateTo);
      if (revisionFilter !== "all") params.set("revision", revisionFilter);
      fetch(`/api/quotations?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          setQuotations(d.quotations || []);
        })
        .catch((e) => setError(e.message || "Failed to load quotations"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, salespersonFilter, dateFrom, dateTo, revisionFilter]);

  const openView = (id) => {
    setViewId(id); setViewLoading(true); setViewData(null);
    fetch(`/api/quotations?id=${id}`)
      .then((r) => r.json())
      .then((d) => setViewData(d.quotation || null))
      .catch(() => setViewData(null))
      .finally(() => setViewLoading(false));
  };

  const salespersonOptions = useMemo(
    () => [...new Set(quotations.map((q) => q.salesperson).filter(Boolean))],
    [quotations]
  );

  const hasFilters = search || statusFilter || salespersonFilter || dateFrom || dateTo || revisionFilter !== "all";
  const clearFilters = () => {
    setSearch(""); setStatusFilter(""); setSalespersonFilter("");
    setDateFrom(""); setDateTo(""); setRevisionFilter("all");
  };

  const s = summary || {};

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <section className="flex flex-wrap gap-3">
        <MetricCard icon={<FileText size={15} />}      label="Total Quotations"      value={summary ? s.total : "—"}                accent="blue"   delay="0ms" />
        <MetricCard icon={<Pencil size={15} />}         label="Draft"                 value={summary ? s.draft : "—"}                accent="indigo" delay="40ms" />
        <MetricCard icon={<CheckCircle2 size={15} />}   label="Sent"                  value={summary ? s.sent : "—"}                 accent="mint"   delay="80ms" />
        <MetricCard icon={<RefreshCw size={15} />}      label="Revised"               value={summary ? s.revised : "—"}              accent="violet" delay="120ms" />
        <MetricCard icon={<Award size={15} />}          label="Converted / Accepted"  value={summary ? s.converted : "—"}            accent="mint"   delay="160ms" />
        <MetricCard icon={<Ban size={15} />}            label="Lost / Cancelled"      value={summary ? s.lost : "—"}                 accent="rose"   delay="200ms" />
        <MetricCard icon={<Receipt size={15} />}        label="Total Quoted Value"    value={summary ? fmtQuoteINR(s.total_value) : "—"}   accent="amber" delay="240ms" />
        <MetricCard icon={<TrendingUp size={15} />}     label="This Month Value"      value={summary ? fmtQuoteINR(s.monthly_value) : "—"} accent="blue"  delay="280ms" />
      </section>

      {/* Stats */}
      {summary && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <StatList title="By Salesperson"       rows={s.by_salesperson} primary="salesperson" />
          <StatList title="Most Quoted Clients"  rows={s.by_client}      primary="client_name" />
          <StatList title="Most Quoted Brands"   rows={s.by_brand}       primary="brand" showValue={false} />
          <StatList title="By Month"             rows={s.by_month}       primary="month" />
        </section>
      )}

      {/* Filters + table */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4EDFF] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.30)" }}>
              <FileText size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-[13px] font-bold text-slate-800">Quotation Summary</h2>
              <p className="text-[10px] text-slate-400">All quotations sent by the system, including revisions</p>
            </div>
          </div>
          <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1D6FD8]">{quotations.length} shown</span>
        </div>

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
          <select value={salespersonFilter} onChange={(e) => setSalespersonFilter(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]">
            <option value="">All Salespersons</option>
            {salespersonOptions.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
          </select>
          <select value={revisionFilter} onChange={(e) => setRevisionFilter(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]">
            {REVISION_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
          <span className="text-[11px] text-slate-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-lg border border-[#E4E8EE] bg-[#F8FAFC] px-2 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
          {hasFilters && (
            <button onClick={clearFilters} className="text-[11px] font-semibold text-[#4451E8] hover:underline">
              Clear filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]" style={{ minWidth: 1100 }}>
            <thead>
              <tr style={{ background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}>
                {["Quotation No", "FIAPL Code", "Client", "Salesperson", "Quotation Date", "Amendment Code", "Amendment Date", "Status", "Taxable", "Tax", "Grand Total", "Actions"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 12 }, (_, c) => (
                    <td key={c} className="border-b border-r border-[#DCE6F7] px-3 py-2.5 last:border-r-0">
                      <div className="skeleton h-3" style={{ width: "60%" }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && error && (
                <tr><td colSpan={12} className="px-4 py-8 text-[12px] text-rose-600">{error}</td></tr>
              )}
              {!loading && !error && quotations.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-14 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}>
                      <FileText size={20} className="text-[#1D6FD8]" />
                    </div>
                    <p className="text-[13px] font-semibold text-slate-700">No quotations found</p>
                    <p className="mt-1 text-[11px] text-slate-400">Quotations sent to clients will show up here.</p>
                  </td>
                </tr>
              )}
              {!loading && !error && quotations.map((q, i) => (
                <tr
                  key={q.id}
                  className="border-b border-[#EEF2F6] transition"
                  style={{ background: i % 2 === 0 ? "white" : "#FAFBFF" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0F6FF")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#FAFBFF")}
                >
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 font-mono text-[10px] font-semibold text-slate-700">{q.quotation_number || "—"}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 font-mono text-[10px] font-semibold text-[#4451E8]">{q.inquiry_unique_code}</td>
                  <td className="max-w-[150px] truncate border-r border-[#DCE6F7] px-3 py-2" title={q.client_name}>{q.client_name || "—"}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.salesperson || "—"}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{fmtQuoteDate(q.quoted_at)}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.amendment_code || "—"}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2">{q.amendment_date ? fmtQuoteDate(q.amendment_date) : "—"}</td>
                  <td className="border-r border-[#DCE6F7] px-3 py-2"><QuoteStatusBadge status={q.display_status} /></td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right">{fmtQuoteINR(q.taxable_amount)}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right">{fmtQuoteINR(q.tax_amount)}</td>
                  <td className="whitespace-nowrap border-r border-[#DCE6F7] px-3 py-2 text-right font-semibold">{fmtQuoteINR(q.grand_total)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openView(q.id)} title="View" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                        <Eye size={13} />
                      </button>
                      <a href={`/api/quotations/pdf?id=${q.id}`} title="Download PDF" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                        <Download size={13} />
                      </a>
                      <button onClick={() => onOpenInquiry?.(q.inquiry_unique_code)} title="Open Inquiry" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#EEF2FF] hover:text-[#4451E8]">
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* View modal */}
      {viewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => { setViewId(null); setViewData(null); }} />
          <div className="relative z-10 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 card-shadow-lg animate-modal">
            <button
              onClick={() => { setViewId(null); setViewData(null); }}
              className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700"
            >
              <X size={15} />
            </button>
            {viewLoading && <p className="text-[12px] text-slate-400">Loading…</p>}
            {!viewLoading && !viewData && <p className="text-[12px] text-rose-500">Quotation not found</p>}
            {!viewLoading && viewData && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">{viewData.quotation_number}</h3>
                  <p className="text-[11px] text-slate-400">{viewData.inquiry_unique_code} · {fmtQuoteDate(viewData.quoted_at)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-slate-400">Client:</span> {viewData.client_name || "—"}</div>
                  <div><span className="text-slate-400">Salesperson:</span> {viewData.salesperson || "—"}</div>
                  <div><span className="text-slate-400">Amendment Code:</span> {viewData.amendment_code || "—"}</div>
                  <div><span className="text-slate-400">Amendment Date:</span> {viewData.amendment_date ? fmtQuoteDate(viewData.amendment_date) : "—"}</div>
                  <div><span className="text-slate-400">Taxable Amount:</span> {fmtQuoteINR(viewData.taxable_amount)}</div>
                  <div><span className="text-slate-400">Tax Amount:</span> {fmtQuoteINR(viewData.tax_amount)}</div>
                  <div className="col-span-2"><span className="text-slate-400">Grand Total:</span> <span className="font-bold">{fmtQuoteINR(viewData.grand_total)}</span></div>
                </div>
                <div className="border-t border-[#EEF2F6] pt-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Line Items</p>
                  <div className="space-y-1">
                    {(viewData.lines || []).map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span>{l.part_number} {l.brand ? `(${l.brand})` : ""}</span>
                        <span className="text-slate-500">{l.quantity} × {l.selling_price}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <a
                  href={`/api/quotations/pdf?id=${viewData.id}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-3 py-2 text-[11px] font-semibold text-[#4451E8] transition hover:bg-[#EEF0FF]"
                >
                  <Download size={12} />Download PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
