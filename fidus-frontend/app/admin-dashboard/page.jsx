"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  LayoutDashboard,
  Inbox,
  Bell,
  Search,
  Package,
  LogOut,
  Plus,
  X,
  Trash2,
} from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();

  const [activeMenu, setActiveMenu]               = useState("dashboard");
  const [inquiries, setInquiries]                 = useState([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [inquiriesError, setInquiriesError]       = useState("");

  const [reminders, setReminders]                 = useState([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);

  const [showAddModal, setShowAddModal]           = useState(false);
  const [selectedReminder, setSelectedReminder]   = useState(null);

  // ── Load inquiries ──────────────────────────────────────────────────────────
  const fetchInquiries = useCallback(async () => {
    setIsLoadingInquiries(true);
    setInquiriesError("");
    try {
      const res  = await fetch("/api/inquiries");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load inquiries");
      setInquiries(data.inquiries || []);
    } catch (err) {
      setInquiriesError(err.message);
    } finally {
      setIsLoadingInquiries(false);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // ── Load reminders ──────────────────────────────────────────────────────────
  const fetchReminders = useCallback(async () => {
    setIsLoadingReminders(true);
    try {
      const res  = await fetch("/api/reminders");
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch (_) {}
    finally { setIsLoadingReminders(false); }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const unreadCount     = reminders.filter((r) => r.status === "unread").length;
  const totalInquiries  = inquiries.length;
  const inProgressCount = inquiries.filter((i) => i.status === "in_progress").length;
  const newCount        = inquiries.filter((i) => i.status === "new").length;

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    router.push("/login");
  };

  const handleOpenAddModal = (reminder) => {
    setSelectedReminder(reminder);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setSelectedReminder(null);
  };

  const handleInquiryCreated = () => {
    handleCloseModal();
    fetchInquiries();
    fetchReminders();
  };

  const pageTitles = {
    dashboard : "Dashboard",
    sales     : "Sales Inquiries",
    reminders : "Reminders",
  };

  return (
    <div className="h-screen bg-[#f7f7f7] text-neutral-950 flex overflow-hidden">

      {/* ================= SIDEBAR ================= */}
      <div className="w-[260px] bg-white border-r border-neutral-200 flex flex-col justify-between">
        <div>

          {/* LOGO */}
          <div className="px-7 py-7 border-b border-neutral-200">
            <h1 className="text-3xl font-bold tracking-tight">
              FIAPL{" "}
              <span className="text-orange-500">Automation</span>
            </h1>
            <p className="text-neutral-500 mt-1 text-sm">Fidus India Automation</p>
          </div>

          {/* MENU */}
          <div className="px-4 py-6 space-y-3">
            <SidebarItem
              icon={<LayoutDashboard size={18} />}
              title="Dashboard"
              active={activeMenu === "dashboard"}
              onClick={() => setActiveMenu("dashboard")}
            />
            <SidebarItem
              icon={<Inbox size={18} />}
              title="Sales Inquiries"
              active={activeMenu === "sales"}
              onClick={() => setActiveMenu("sales")}
            />
            <SidebarItem
              icon={<Bell size={18} />}
              title="Reminders"
              badge={unreadCount > 0 ? unreadCount : null}
              active={activeMenu === "reminders"}
              onClick={() => setActiveMenu("reminders")}
            />
          </div>

        </div>

        {/* PROFILE */}
        <div className="p-4 border-t border-neutral-200">
          <div className="bg-[#fafafa] rounded-3xl p-4 flex items-center gap-3 border border-neutral-200">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-lg font-bold shadow-sm">
              A
            </div>
            <div>
              <h3 className="font-semibold text-sm">Admin</h3>
              <p className="text-neutral-500 text-xs">Super Admin</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-4 w-full flex items-center justify-center gap-3 bg-neutral-950 hover:bg-neutral-800 transition-all px-5 py-3.5 rounded-2xl text-white font-medium"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ================= TOPBAR ================= */}
        <div className="px-8 py-5 border-b border-neutral-200 flex items-center justify-between bg-white/95 backdrop-blur-xl">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {pageTitles[activeMenu] || "Dashboard"}
            </h1>
            <p className="text-neutral-500 mt-1 text-sm">
              Monitor inquiries and employee workflow
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* SEARCH */}
            <div className="flex items-center gap-3 bg-[#fafafa] border border-neutral-200 px-4 py-3 rounded-2xl min-w-[280px]">
              <Search size={16} className="text-neutral-500" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-neutral-950 placeholder:text-neutral-400 w-full"
              />
            </div>

            {/* BELL — navigates to Reminders page */}
            <button
              onClick={() => setActiveMenu("reminders")}
              className="relative w-11 h-11 rounded-2xl bg-[#fafafa] border border-neutral-200 flex items-center justify-center hover:bg-orange-50 hover:border-orange-200 transition-all duration-300"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ================= CONTENT ================= */}
        <div className="flex-1 overflow-auto p-7 space-y-7">

          {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
          {activeMenu === "dashboard" && (
            <>
              <div className="grid grid-cols-3 gap-6">
                <DashboardCard title="Total Inquiries" value={isLoadingInquiries ? "..." : totalInquiries} />
                <DashboardCard title="In Progress"     value={isLoadingInquiries ? "..." : inProgressCount} />
                <DashboardCard title="New"             value={isLoadingInquiries ? "..." : newCount} />
              </div>
              <RecentSalesTable
                inquiries={inquiries}
                isLoading={isLoadingInquiries}
                error={inquiriesError}
              />
            </>
          )}

          {/* ── SALES ─────────────────────────────────────────────────────── */}
          {activeMenu === "sales" && (
            <div className="bg-white border border-neutral-200 rounded-[28px] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-8 py-7 border-b border-white/5">
                <div>
                  <h2 className="text-3xl font-bold">Sales Inquiries Dashboard</h2>
                  <p className="text-neutral-500 mt-2 text-sm">Team inquiry performance overview</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-400/25 flex items-center justify-center">
                  <Package size={24} className="text-orange-400" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-orange-50 text-neutral-500 text-sm border-b border-orange-100">
                    <tr>
                      <th className="text-left px-7 py-5 font-medium">Sr. No.</th>
                      <th className="text-left px-7 py-5 font-medium">Team</th>
                      <th className="text-left px-7 py-5 font-medium">Quoted</th>
                      <th className="text-left px-7 py-5 font-medium">In Progress</th>
                      <th className="text-left px-7 py-5 font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SalesRow sr="1" team="TM" quoted="5" progress="12" newData="4" />
                    <SalesRow sr="2" team="BS" quoted="3" progress="14" newData="3" />
                    <SalesRow sr="3" team="SY" quoted="7" progress="11" newData="7" />
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── REMINDERS ─────────────────────────────────────────────────── */}
          {activeMenu === "reminders" && (
            <RemindersPage
              reminders={reminders}
              isLoading={isLoadingReminders}
              onAddInquiry={handleOpenAddModal}
            />
          )}

        </div>
      </div>

      {/* ================= ADD INQUIRY MODAL ================= */}
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

/* ================= REMINDERS PAGE ================= */
function RemindersPage({ reminders, isLoading, onAddInquiry }) {
  const unread = reminders.filter((r) => r.status === "unread").length;

  return (
    <div className="bg-white border border-neutral-200 rounded-[28px] overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-7 py-6 border-b border-neutral-100 flex items-center justify-between bg-orange-50">
        <div>
          <h2 className="text-2xl font-bold">Follow-up Reminders</h2>
          <p className="text-neutral-500 text-sm mt-1">
            Client follow-up emails — add them as inquiries manually
          </p>
        </div>
        <span className="text-sm font-semibold text-orange-600">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="bg-orange-50 text-neutral-500 text-sm border-b border-orange-100">
            <tr>
              <th className="text-left px-6 py-5 font-medium">S.No.</th>
              <th className="text-left px-6 py-5 font-medium">Date</th>
              <th className="text-left px-6 py-5 font-medium">FIAPL Code</th>
              <th className="text-left px-6 py-5 font-medium">Client</th>
              <th className="text-left px-6 py-5 font-medium">Summary</th>
              <th className="text-left px-6 py-5 font-medium">Status</th>
              <th className="text-left px-6 py-5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-sm text-neutral-400">
                  Loading reminders...
                </td>
              </tr>
            )}
            {!isLoading && reminders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-sm text-neutral-400">
                  No reminders yet
                </td>
              </tr>
            )}
            {!isLoading &&
              reminders.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-t border-neutral-200 transition-all duration-200 ${
                    r.status === "unread"
                      ? "bg-orange-50/50 hover:bg-orange-50"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  <td className="px-6 py-5 text-sm">{i + 1}</td>
                  <td className="px-6 py-5 text-sm text-neutral-500">
                    {formatDate(r.received_at)}
                  </td>
                  <td className="px-6 py-5">
                    {r.unique_code ? (
                      <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-lg">
                        {r.unique_code}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-sm">
                    {r.sender_name || r.sender_email || "—"}
                  </td>
                  <td className="px-6 py-5 text-sm max-w-[300px]">
                    <p className="truncate text-neutral-700" title={r.llm_summary || r.subject}>
                      {r.llm_summary || r.subject || "—"}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <ReminderStatusBadge status={r.status} />
                  </td>
                  <td className="px-6 py-5">
                    {r.status !== "actioned" ? (
                      <button
                        onClick={() => onAddInquiry(r)}
                        className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <Plus size={13} />
                        Add Inquiry
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                        Done
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= ADD INQUIRY MODAL ================= */
function AddInquiryModal({ reminder, onClose, onSuccess }) {
  const [form, setForm] = useState({
    client_name  : reminder?.client_name  || reminder?.sender_name  || "",
    location     : "",
    sender_name  : reminder?.sender_name  || "",
    sender_email : reminder?.sender_email || "",
    subject      : reminder?.subject      || "",
    notes        : reminder?.llm_summary  || "",
  });
  const [items, setItems]       = useState([{ brand: "", part_number: "", quantity: "", notes: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  const updateField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const updateItem = (idx, key, val) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: val } : item)));

  const addItem    = () => setItems((prev) => [...prev, { brand: "", part_number: "", quantity: "", notes: "" }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[28px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-neutral-200 bg-orange-50 rounded-t-[28px]">
          <div>
            <h2 className="text-xl font-bold">Add Manual Inquiry</h2>
            {reminder?.unique_code && (
              <p className="text-xs text-neutral-500 mt-1">
                Linked to{" "}
                <span className="text-orange-600 font-semibold">{reminder.unique_code}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="px-8 py-6 space-y-5">

          {/* Client + Location */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Client Name">
              <input
                value={form.client_name}
                onChange={(e) => updateField("client_name", e.target.value)}
                placeholder="e.g. Swan Industries"
                className="form-input"
              />
            </FormField>
            <FormField label="Location">
              <input
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="City, State"
                className="form-input"
              />
            </FormField>
          </div>

          {/* Sender */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Sender Name">
              <input
                value={form.sender_name}
                onChange={(e) => updateField("sender_name", e.target.value)}
                placeholder="Contact person"
                className="form-input"
              />
            </FormField>
            <FormField label="Sender Email">
              <input
                value={form.sender_email}
                onChange={(e) => updateField("sender_email", e.target.value)}
                placeholder="email@company.com"
                className="form-input"
              />
            </FormField>
          </div>

          {/* Subject */}
          <FormField label="Subject">
            <input
              value={form.subject}
              onChange={(e) => updateField("subject", e.target.value)}
              className="form-input"
            />
          </FormField>

          {/* Notes */}
          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={2}
              className="form-input resize-none"
            />
          </FormField>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-500">Line Items</span>
              <button
                onClick={addItem}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                <Plus size={13} /> Add Row
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_72px_1fr_32px] gap-2 mb-1 px-1">
              {["Brand", "Part No.", "Qty", "Notes", ""].map((h) => (
                <span key={h} className="text-[11px] font-semibold text-neutral-400">{h}</span>
              ))}
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_72px_1fr_32px] gap-2 items-center"
                >
                  <input
                    value={item.brand}
                    onChange={(e) => updateItem(i, "brand", e.target.value)}
                    placeholder="Brand"
                    className="form-input"
                  />
                  <input
                    value={item.part_number}
                    onChange={(e) => updateItem(i, "part_number", e.target.value)}
                    placeholder="Part No."
                    className="form-input"
                  />
                  <input
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)}
                    placeholder="Qty"
                    type="number"
                    min="0"
                    className="form-input"
                  />
                  <input
                    value={item.notes}
                    onChange={(e) => updateItem(i, "notes", e.target.value)}
                    placeholder="Notes"
                    className="form-input"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    className="text-neutral-300 hover:text-red-400 transition-colors flex items-center justify-center"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 pb-7">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl border border-neutral-200 text-sm font-medium hover:bg-neutral-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Inquiry"}
          </button>
        </div>

      </div>
    </div>
  );
}

/* ================= SHARED FORM FIELD ================= */
function FormField({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-neutral-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

/* ================= REMINDER STATUS BADGE ================= */
function ReminderStatusBadge({ status }) {
  const map = {
    unread  : "bg-cyan-50 text-cyan-600 border-cyan-200",
    seen    : "bg-neutral-100 text-neutral-500 border-neutral-200",
    actioned: "bg-green-50 text-green-600 border-green-200",
  };
  const labels = { unread: "Unread", seen: "Seen", actioned: "Actioned" };
  return (
    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${map[status] || map.unread}`}>
      {labels[status] || "Unread"}
    </span>
  );
}

/* ================= SIDEBAR ITEM ================= */
function SidebarItem({ icon, title, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300 ${
        active
          ? "bg-orange-500 text-white shadow-sm"
          : "text-neutral-700 hover:bg-orange-50 hover:text-orange-700"
      }`}
    >
      {icon}
      <span className="text-sm font-medium flex-1 text-left">{title}</span>
      {badge && (
        <span
          className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
            active ? "bg-white text-orange-500" : "bg-orange-500 text-white"
          }`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

/* ================= DASHBOARD CARD ================= */
function DashboardCard({ title, value }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-[28px] p-7 shadow-sm hover:translate-y-[-2px] hover:border-orange-200 transition-all duration-300">
      <p className="text-neutral-500 text-sm">{title}</p>
      <h2 className="text-5xl font-bold mt-4">{value}</h2>
    </div>
  );
}

/* ================= SALES ROW ================= */
function SalesRow({ sr, team, quoted, progress, newData }) {
  return (
    <tr className="border-t border-neutral-200 hover:bg-orange-50 transition-all duration-300">
      <td className="px-7 py-6 text-sm">{sr}</td>
      <td className="px-7 py-6 text-orange-400 font-semibold text-sm">{team}</td>
      <td className="px-7 py-6 text-sm">{quoted}</td>
      <td className="px-7 py-6 text-sm">{progress}</td>
      <td className="px-7 py-6 text-sm">{newData}</td>
    </tr>
  );
}

/* ================= RECENT SALES TABLE ================= */
function RecentSalesTable({ inquiries, isLoading, error }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-[28px] overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-7 py-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Recent Sales Inquiries</h2>
          <p className="text-neutral-500 text-sm mt-1">Latest inquiry activity overview</p>
        </div>
        <button className="bg-orange-500 hover:bg-orange-600 transition-all duration-300 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-sm">
          + Add Inquiry
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="bg-orange-50 text-neutral-500 text-sm border-b border-orange-100">
            <tr>
              <th className="text-left px-6 py-5 font-medium">S.No.</th>
              <th className="text-left px-6 py-5 font-medium">Date</th>
              <th className="text-left px-6 py-5 font-medium">F Unique Code</th>
              <th className="text-left px-6 py-5 font-medium">Client Name</th>
              <th className="text-left px-6 py-5 font-medium">Location</th>
              <th className="text-left px-6 py-5 font-medium">User Name</th>
              <th className="text-left px-6 py-5 font-medium">PR#</th>
              <th className="text-left px-6 py-5 font-medium">Brand</th>
              <th className="text-left px-6 py-5 font-medium">Part No.</th>
              <th className="text-left px-6 py-5 font-medium">UOM</th>
              <th className="text-left px-6 py-5 font-medium">Qty</th>
              <th className="text-left px-6 py-5 font-medium">Assigned</th>
              <th className="text-left px-6 py-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-6 py-8 text-sm text-gray-400" colSpan={13}>
                  Loading inquiries...
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td className="px-6 py-8 text-sm text-red-400" colSpan={13}>
                  {error}
                </td>
              </tr>
            )}
            {!isLoading && !error && inquiries.length === 0 && (
              <tr>
                <td className="px-6 py-8 text-sm text-gray-400" colSpan={13}>
                  No inquiries found.
                </td>
              </tr>
            )}
            {!isLoading &&
              !error &&
              inquiries.map((inquiry, index) => {
                const firstItem = inquiry.items?.[0] || {};
                return (
                  <TableRow
                    key={inquiry.id}
                    sr={index + 1}
                    date={formatDate(inquiry.email_date || inquiry.created_at)}
                    code={inquiry.unique_code}
                    client={inquiry.client_name || "-"}
                    location={inquiry.location || "-"}
                    user={inquiry.sender_name || "-"}
                    pr="-"
                    brand={firstItem.brand || "-"}
                    part={firstItem.partNumber || "-"}
                    uom={firstItem.uom || "-"}
                    qty={firstItem.quantity || "-"}
                    assigned="Deepak"
                    status={formatStatus(inquiry.status)}
                  />
                );
              })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
  }).format(new Date(value));
}

function formatStatus(status) {
  if (!status) return "New";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ================= TABLE ROW ================= */
function TableRow({
  sr, date, code, client, location, user,
  pr, brand, part, uom, qty, assigned, status,
}) {
  return (
    <tr className="border-t border-neutral-200 hover:bg-orange-50 transition-all duration-300">
      <td className="px-6 py-6 text-sm">{sr}</td>
      <td className="px-6 py-6 text-sm">{date}</td>
      <td className="px-6 py-6 text-sm font-medium">{code}</td>
      <td className="px-6 py-6 text-sm">{client}</td>
      <td className="px-6 py-6 text-sm">{location}</td>
      <td className="px-6 py-6 text-sm">{user}</td>
      <td className="px-6 py-6 text-sm">{pr}</td>
      <td className="px-6 py-6 text-sm">{brand}</td>
      <td className="px-6 py-6 text-sm">{part}</td>
      <td className="px-6 py-6 text-sm">{uom}</td>
      <td className="px-6 py-6 text-sm font-medium">{qty}</td>
      <td className="px-6 py-6">
        <select
          defaultValue={assigned}
          className="bg-white border border-neutral-200 text-neutral-950 px-4 py-2.5 rounded-2xl outline-none text-sm focus:border-orange-500 transition-all"
        >
          <option>Deepak</option>
          <option>Rahul</option>
          <option>Aman</option>
        </select>
      </td>
      <td className="px-6 py-6">
        <span
          className={`px-4 py-2 rounded-full text-xs font-semibold border ${
            status === "Completed" || status === "Converted"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : status === "New"
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          }`}
        >
          {status}
        </span>
      </td>
    </tr>
  );
}
