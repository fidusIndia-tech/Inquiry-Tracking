"use client";

import { useEffect, useRef, useState } from "react";
import InquiryDetailModal from "@/app/components/InquiryDetailModal";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  RefreshCw,
  Search,
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
  const [statusFilter,       setStatusFilter]       = useState("all");
  const [assignmentFilter,   setAssignmentFilter]   = useState("all");
  const [dateFilter,         setDateFilter]         = useState("all");
  const [now,                setNow]                = useState(0);
  const [sidebarCollapsed,   setSidebarCollapsed]   = useState(false);
  const [mobileSidebarOpen,  setMobileSidebarOpen]  = useState(false);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);
  const [editModal,          setEditModal]          = useState(null);
  const [subjectPreview,     setSubjectPreview]     = useState(null);
  const [detailModal,        setDetailModal]        = useState(null);
  const [assignToMeModal,    setAssignToMeModal]    = useState(null);
  const [notifBadge,         setNotifBadge]         = useState(0);
  const prevCountRef = useRef(0);

  async function loadInquiries() {
    try {
      setIsLoadingInquiries(true);
      setInquiriesError("");
      const response = await fetch("/api/inquiries");
      const data     = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load inquiries");
      setInquiries(data.inquiries || []);
    } catch (error) {
      setInquiriesError(error.message);
    } finally {
      setIsLoadingInquiries(false);
    }
  }

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
    async function loadInitial() {
      try {
        setIsLoadingInquiries(true);
        setInquiriesError("");
        const response = await fetch("/api/inquiries");
        const data     = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load inquiries");
        if (isMounted) setInquiries(data.inquiries || []);
      } catch (error) {
        if (isMounted) setInquiriesError(error.message);
      } finally {
        if (isMounted) setIsLoadingInquiries(false);
      }
    }
    async function pollInquiries() {
      if (!isMounted) return;
      try {
        const response = await fetch("/api/inquiries");
        const data     = await response.json();
        if (!response.ok || !isMounted) return;
        setInquiries(data.inquiries || []);
      } catch {
        /* silent — don't surface background poll errors */
      }
    }
    loadInitial();
    const usersTimer = window.setTimeout(() => loadUsers(), 0);

    // SSE: server pushes instantly on every DB change
    const es = new EventSource("/api/inquiries/stream");
    es.onmessage = () => { if (isMounted) pollInquiries(); };

    // 30 s fallback poll in case SSE reconnects after a network blip
    const pollTimer = window.setInterval(pollInquiries, 30000);

    return () => {
      isMounted = false;
      window.clearTimeout(usersTimer);
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

  const filteredInquiries = inquiries.filter((inquiry) => {
    const tokens = searchText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const text = [
      inquiry.unique_code,
      inquiry.client_name,
      inquiry.location,
      inquiry.sender_name,
      inquiry.sender_email,
      inquiry.subject,
      inquiry.status,
      inquiry.assigned_to_name,
      ...(inquiry.items || []).flatMap((item) => [
        item.brand,
        item.partNumber,
        item.quantity,
        item.uom,
        item.itemNotes,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const assignedAtMs = inquiry.assigned_at ? new Date(inquiry.assigned_at).getTime() : null;
    const ageHours = assignedAtMs ? (now - assignedAtMs) / 36e5 : null;
    const matchesAssignmentFilter =
      assignmentFilter === "all" ||
      (assignmentFilter === "over24h" && ageHours !== null && ageHours > 24) ||
      (assignmentFilter === "over48h" && ageHours !== null && ageHours > 48);

    const matchesDateFilter = (() => {
      if (dateFilter === "all") return true;
      if (!inquiry.email_date) return false;
      const d = new Date(inquiry.email_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (dateFilter === "today")     return d >= today;
      if (dateFilter === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); return d >= y && d < today; }
      if (dateFilter === "7d")        return d >= new Date(today.getTime() - 6 * 864e5);
      if (dateFilter === "30d")       return d >= new Date(today.getTime() - 29 * 864e5);
      return true;
    })();

    return (
      tokens.every((token) => text.includes(token)) &&
      (statusFilter === "all" || inquiry.status === statusFilter) &&
      matchesAssignmentFilter &&
      matchesDateFilter
    );
  });

  const counts = {
    total:    inquiries.length,
    new:      inquiries.filter((i) => i.status === "new").length,
    assigned: inquiries.filter((i) => i.status === "assigned").length,
    quoted:   inquiries.filter((i) => i.status === "quoted").length,
  };

  const employeeOptions = users
    .filter((user) => user.role === "employee" && user.is_active)
    .map((user) => ({ id: user.id, name: user.name, email: user.email }));

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    router.push("/login");
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
            ? { ...inq, assigned_to: data.inquiry.assigned_to, assigned_at: data.inquiry.assigned_at, assigned_to_name: data.inquiry.assigned_to_name, status: data.inquiry.status }
            : inq
        )
      );
      setAssignToMeModal(null);
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

  return (
    <div
      className="min-h-screen text-slate-900 dashboard-bg"
    >
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="relative flex h-screen overflow-hidden">
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          setMobileOpen={setMobileSidebarOpen}
          onLogout={handleLogout}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            activeMenu={activeMenu}
            searchText={searchText}
            setSearchText={setSearchText}
            onRefresh={loadInquiries}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            notifBadge={notifBadge}
            onClearNotif={() => setNotifBadge(0)}
          />

          <div className="flex-1 overflow-auto p-4 lg:p-5">
            {activeMenu === "dashboard" && (
              <div className="space-y-4">
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
                  dateFilter={dateFilter}
                  setDateFilter={setDateFilter}
                  totalCount={inquiries.length}
                  now={now}
                  onDeleteRequest={(inquiry)  => setDeleteConfirm(inquiry)}
                  onEditRequest={(inquiry)   => setEditModal(inquiry)}
                  onSubjectOpen={(inquiry)   => setSubjectPreview(inquiry)}
                  onDetailOpen={(inquiry)    => setDetailModal(inquiry)}
                  onAssignToMeRequest={(uc)  => setAssignToMeModal(uc)}
                />
              </div>
            )}

            {activeMenu === "sales" && <SalesOverview inquiries={inquiries} users={users} />}
            {activeMenu === "access" && (
              <AccessControlPanel
                users={users}
                usersError={usersError}
                onUsersChanged={loadUsers}
              />
            )}
          </div>
        </main>
      </div>

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
          onClose={() => setDetailModal(null)}
        />
      )}

      {assignToMeModal && (
        <AssignToMeModal
          uniqueCode={assignToMeModal}
          onClose={() => setAssignToMeModal(null)}
          onConfirm={() => handleAssignToMe(assignToMeModal)}
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
function TopBar({ activeMenu, searchText, setSearchText, onRefresh, onOpenSidebar, notifBadge, onClearNotif }) {
  const title = {
    dashboard: "Inquiry Dashboard",
    sales: "Sales Overview",
    access: "Access Control",
  }[activeMenu] || "Inquiry Dashboard";

  return (
    <header className="h-14 flex items-center justify-between border-b border-[#D8E3F8] px-4 shrink-0 lg:px-5 backdrop-blur-md" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.92) 0%, rgba(240,246,255,0.95) 100%)" }}>
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#E4E8EE] text-slate-500 transition hover:bg-[#F3F5F7] lg:hidden"
        >
          <Menu size={15} />
        </button>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 leading-tight">
            {title}
          </h2>
          <p className="text-[11px] text-slate-400">FIAPL workflow desk</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-xl border bg-[#F8FAFC] min-w-55 transition-all duration-150 focus-within:bg-white"
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
          className="refresh-spin flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold text-white transition-all duration-200 btn-glow"
          style={{ background: "linear-gradient(135deg,#5BA7FF 0%,#6D7CFF 100%)", boxShadow: "0 2px 12px rgba(91,167,255,0.30)" }}
        >
          <RefreshCw size={13} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          onClick={onClearNotif}
          className="relative h-9 w-9 grid place-items-center rounded-xl border border-[#D0D8F0] bg-white/80 text-slate-500 transition hover:bg-[#EEF2FF] hover:text-[#5BA7FF] hover:border-[#BFDBFE]"
          title="Notifications"
        >
          <Bell size={14} />
          {notifBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-fade-in" style={{ boxShadow: "0 2px 6px rgba(239,68,68,0.5)" }}>
              {notifBadge > 9 ? "9+" : notifBadge}
            </span>
          )}
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
  { label: "Sr. No.",       defaultW: 52  },
  { label: "Received",      defaultW: 115 },
  { label: "F Unique Code", defaultW: 110 },
  { label: "Client Name",   defaultW: 120 },
  { label: "Location",      defaultW: 100 },
  { label: "User Name",     defaultW: 110 },
  { label: "PR #",          defaultW: 80  },
  { label: "Brand",         defaultW: 90  },
  { label: "Part Number",   defaultW: 120 },
  { label: "UOM",           defaultW: 60  },
  { label: "Qty",           defaultW: 55  },
  { label: "Allocation",    defaultW: 100 },
  { label: "Assign Timer",  defaultW: 80  },
  { label: "Status Timer",  defaultW: 80  },
  { label: "Status",        defaultW: 90  },
  { label: "Actions",       defaultW: 72  },
];

function InquiryTable({
  inquiries, setInquiries,
  employees,
  isLoading, error,
  statusFilter, setStatusFilter,
  assignmentFilter, setAssignmentFilter,
  dateFilter, setDateFilter,
  totalCount,
  now,
  onDeleteRequest, onEditRequest, onSubjectOpen, onDetailOpen, onAssignToMeRequest,
}) {
  const [colWidths, setColWidths] = useState(() => ADMIN_COLS.map((c) => c.defaultW));
  const dragRef = useRef(null);

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
            ? { ...inq, assigned_to: data.inquiry.assigned_to, assigned_at: data.inquiry.assigned_at, assigned_to_name: data.inquiry.assigned_to_name, status: data.inquiry.status }
            : inq
        )
      );
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

  const rows = inquiries.flatMap((inquiry) => {
    const items = inquiry.items?.length ? inquiry.items : [{}];
    return items.map((item, idx) => ({
      inquiry,
      item,
      isFirstItem: idx === 0,
      groupSize:   items.length,
    }));
  });

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px #D0D8F0, 0 4px 24px rgba(91,167,255,0.08)" }}>
      <div className="flex flex-col gap-3 border-b border-[#D8E3F8] px-5 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ background: "linear-gradient(90deg,#F5F8FF 0%,#F0F6FF 100%)" }}>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Inquiries</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{inquiries.length} of {totalCount} groups</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterButton>
          {STATUS_OPTIONS.slice(0, 7).map((opt) => (
            <FilterButton key={opt.value} active={statusFilter === opt.value} onClick={() => setStatusFilter(opt.value)}>
              {opt.label}
            </FilterButton>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]" style={{ tableLayout: "fixed", width: "100%", minWidth: 900 }}>
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="text-left">
              {ADMIN_COLS.map((col, i) => (
                <th
                  key={col.label}
                  style={{ position: "relative", background: "linear-gradient(180deg,#EEF4FF 0%,#E6EDFC 100%)" }}
                  className="sticky top-0 align-top border-b-2 border-r border-b-[#BFCFEE] border-r-[#D0DCF4] px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-[#4461A8] last:border-r-0 select-none"
                >
                  {col.label === "Received" ? (
                    <div className="flex flex-col gap-1 pr-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">Received</span>
                      <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-5 w-full rounded border border-[#C8D6F0] bg-white/90 px-1 text-[9px] font-semibold text-slate-600 outline-none cursor-pointer normal-case tracking-normal"
                        style={{ letterSpacing: 0 }}
                      >
                        <option value="all">All Dates</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                      </select>
                    </div>
                  ) : col.label === "Assign Timer" ? (
                    <div className="flex flex-col gap-1 pr-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#4461A8]">Assign Timer</span>
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
                    </div>
                  ) : (
                    <span className="truncate block pr-2">{col.label}</span>
                  )}
                  <div
                    onMouseDown={(e) => startResize(i, e)}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 1 }}
                    className="hover:bg-[#5BA7FF]/30 transition-colors"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingRows />}
            {!isLoading && error && (
              <tr><td className="px-4 py-8 text-[13px] text-rose-600" colSpan={16}>{error}</td></tr>
            )}
            {!isLoading && !error && inquiries.length === 0 && (
              <tr><td className="px-4 py-10 text-[13px] text-slate-400 text-center" colSpan={16}>No inquiries found.</td></tr>
            )}
            {!isLoading && !error &&
              rows.map(({ inquiry, item, isFirstItem, groupSize }, index) => (
                <InquiryRow
                  key={`${inquiry.id}-${item.id || index}`}
                  srNo={index + 1}
                  inquiry={inquiry}
                  item={item}
                  isFirstItem={isFirstItem}
                  groupSize={groupSize}
                  now={now}
                  employees={employees}
                  onAssignChange={(v)  => handleAssignChange(inquiry.unique_code, v)}
                  onStatusChange={(v)  => handleStatusChange(inquiry.unique_code, v)}
                  onDelete={() => onDeleteRequest(inquiry)}
                  onEdit={()   => onEditRequest(inquiry)}
                  onSubjectOpen={() => onSubjectOpen(inquiry)}
                  onDetailOpen={() => onDetailOpen(inquiry)}
                  onAssignToMe={() => onAssignToMeRequest(inquiry.unique_code)}
                />
              ))}
          </tbody>
        </table>
      </div>

    </section>
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

function AssignToMeModal({ uniqueCode, onClose, onConfirm }) {
  const adminName = typeof window !== "undefined" ? localStorage.getItem("userName") || "Admin" : "Admin";
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-6 card-shadow-lg animate-modal">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition"
        >
          <X size={14} />
        </button>
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}
        >
          <Users size={18} className="text-[#1D6FD8]" />
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900">Assign to Yourself</h3>
        <p className="mt-1.5 text-[13px] text-slate-500">
          This will assign{" "}
          <span className="font-semibold text-slate-800">{uniqueCode}</span>{" "}
          to you.
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] px-4 py-3">
          <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[12px] font-bold" style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)" }}>
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-slate-900">{adminName}</p>
            <p className="text-[11px] text-slate-400">Admin</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-xl border border-[#E4E8EE] bg-white text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#5BA7FF,#6D7CFF)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            {busy ? "Assigning…" : "Assign to Me"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, rowIndex) => (
    <tr key={rowIndex}>
      {Array.from({ length: 16 }, (_, cellIndex) => (
        <td key={cellIndex} className="border-b border-r border-[#DCE6F7] px-2 py-2.5 last:border-r-0">
          <div className="skeleton h-3.5" style={{ width: cellIndex === 8 ? "75%" : cellIndex === 3 ? "65%" : "55%" }} />
        </td>
      ))}
    </tr>
  ));
}

function InquiryRow({ srNo, inquiry, item, isFirstItem, groupSize, now, employees, onAssignChange, onStatusChange, onDelete, onEdit, onSubjectOpen, onDetailOpen, onAssignToMe }) {
  const status = inquiry.status || "new";
  const part   = item.partNumber || "—";
  const brand  = item.brand      || "-";
  const uom    = item.uom        || "-";
  const qty    = item.quantity   || "—";

  return (
    <tr
      className="border-b border-[#DCE6F7] transition-all duration-150 table-row-animate"
      style={{ background: isFirstItem ? "rgba(255,255,255,0.9)" : "rgba(245,248,255,0.7)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(90deg,#EEF6FF 0%,#F5F9FF 100%)"; e.currentTarget.style.boxShadow = "inset 3px 0 0 #5BA7FF"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isFirstItem ? "rgba(255,255,255,0.9)" : "rgba(245,248,255,0.7)"; e.currentTarget.style.boxShadow = "none"; }}
    >
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
        <p className="truncate font-semibold text-slate-900 text-[11px]">{inquiry.unique_code}</p>
        {isFirstItem && groupSize > 1 && (
          <p className="mt-0.5 text-[11px] text-[#5BA7FF] font-medium">{groupSize} items</p>
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
          <select
            value={inquiry.assigned_to || ""}
            onChange={(e) => {
              if (e.target.value === "__self__") { onAssignToMe(); }
              else { onAssignChange(e.target.value); }
            }}
            className="h-7 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none cursor-pointer transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
          >
            <option value="">Unassigned</option>
            <option value="__self__">— Assign to Me —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        ) : (
          <div className="flex h-7 items-center">
            <span className="text-[11px] font-medium text-slate-500">
              {inquiry.assigned_to_name || "—"}
            </span>
          </div>
        )}
      </td>

      {/* Assign Timer */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem && (
          <p className={`text-[11px] font-medium tabular-nums ${timerClass(inquiry.assigned_at, now)}`}>
            {formatAssignmentAge(inquiry.assigned_at, now)}
          </p>
        )}
      </td>

      {/* Status Timer */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem && (
          <>
            {inquiry.status === "in_progress" && inquiry.in_progress_at && (
              <p className="text-[11px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                {formatAssignmentAge(inquiry.in_progress_at, now)}
              </p>
            )}
            {inquiry.status === "quoted" && inquiry.quoted_at && (
              <p className="text-[11px] font-semibold text-violet-700 tabular-nums whitespace-nowrap">
                {formatAssignmentAge(inquiry.quoted_at, now)}
              </p>
            )}
            {(inquiry.status !== "in_progress" && inquiry.status !== "quoted") && (
              <p className="text-[11px] text-slate-400">—</p>
            )}
          </>
        )}
      </td>

      {/* Status */}
      <td className="border-r border-[#DCE6F7] px-2 py-2 align-middle">
        {isFirstItem ? (
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="h-7 w-full rounded-lg border border-[#E4E8EE] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none cursor-pointer transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <div className="flex h-7 items-center">
            <StatusBadge status={status} />
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
}

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

function AccessControlPanel({ users, usersError, onUsersChanged }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeUsers = users.filter((user) => user.is_active);
  const employees = activeUsers.filter((user) => user.role === "employee");
  const admins = activeUsers.filter((user) => user.role === "admin");

  const updateEdit = (id, field, value) => {
    setEditing((current) => ({
      ...current,
      [id]: {
        name: current[id]?.name ?? users.find((user) => user.id === id)?.name ?? "",
        email: current[id]?.email ?? users.find((user) => user.id === id)?.email ?? "",
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
      setForm({ name: "", email: "", password: "" });
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
          password: next.password || undefined,
          role: user.role,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update user");
      setEditing((current) => ({ ...current, [user.id]: { name: data.user.name, email: data.user.email, password: "" } }));
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

        <div className="mt-5 grid gap-3 rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
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
    </section>
  );
}

function UserAccessTable({ title, users, editing, busy, onEdit, onSave, onRemove }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white card-shadow">
      <div className="border-b border-[#EEF2F6] px-5 py-4">
        <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#F8FAFC] text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">Name</th>
              <th className="border-b border-r border-[#E6EBF2] px-3 py-2">Login ID</th>
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
                <td colSpan={4} className="px-4 py-8 text-center text-[12px] text-slate-400">
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
