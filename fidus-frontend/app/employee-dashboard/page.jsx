"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "quoted", label: "Quoted" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(null);
  const [employeeName, setEmployeeName] = useState("Employee");
  const [inquiries, setInquiries] = useState([]);
  const [statusDrafts, setStatusDrafts] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const knownAssignmentsRef = useRef(new Map());
  const firstLoadRef = useRef(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadInquiries = useCallback(async (userId, options = {}) => {
    const silent = Boolean(options.silent);
    if (!silent) setLoading(true);
    setError("");
    if (!silent) setNotice("");

    try {
      const res = await fetch("/api/inquiries", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load assigned inquiries");
      }

      const assigned = (data.inquiries || []).filter(
        (item) => Number(item.assigned_to) === Number(userId)
      );

      if (
        !firstLoadRef.current &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        assigned.forEach((item) => {
          const previousAssignedAt = knownAssignmentsRef.current.get(item.unique_code);
          const currentAssignedAt = item.assigned_at || "";
          if (!previousAssignedAt || previousAssignedAt !== currentAssignedAt) {
            new Notification("New inquiry assigned", {
              body: `${item.unique_code} ${item.client_name || item.sender_name || ""}`.trim(),
              tag: item.unique_code,
            });
          }
        });
      }

      knownAssignmentsRef.current = new Map(
        assigned.map((item) => [item.unique_code, item.assigned_at || ""])
      );
      firstLoadRef.current = false;
      setInquiries(assigned);
      setStatusDrafts(
        Object.fromEntries(assigned.map((item) => [item.unique_code, item.status || "assigned"]))
      );
    } catch (err) {
      setError(err.message || "Failed to load assigned inquiries");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employeeId) return undefined;

    const timer = window.setInterval(() => {
      loadInquiries(employeeId, { silent: true });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [employeeId, loadInquiries]);

  /* Auto-request notification permission on mount */
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          setNotificationsEnabled(perm === "granted");
        });
      } else {
        setNotificationsEnabled(Notification.permission === "granted");
      }
    }
  }, []);

  const enableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotice("Browser notifications are not supported here.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    setNotice(permission === "granted" ? "Notifications enabled." : "Notifications blocked by browser.");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const role = localStorage.getItem("role");
      const storedUserId = localStorage.getItem("userId");
      const storedUserName = localStorage.getItem("userName");

      if (role !== "employee" || !storedUserId) {
        router.push("/login");
        return;
      }

      const nextEmployeeId = Number(storedUserId);
      setEmployeeId(nextEmployeeId);
      setEmployeeName(storedUserName || "Employee");
      loadInquiries(nextEmployeeId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [router, loadInquiries]);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return inquiries
      .flatMap((inquiry) => {
        const items = inquiry.items?.length ? inquiry.items : [{}];
        return items.map((item, index) => ({
          rowKey: `${inquiry.unique_code}-${item.id || index}`,
          unique_code: inquiry.unique_code,
          email_date: inquiry.email_date,
          client_name: inquiry.client_name || "-",
          location: inquiry.location || "-",
          sender_name: inquiry.sender_name || "-",
          subject: inquiry.subject || "-",
          status: inquiry.status || "assigned",
          brand: item.brand || "-",
          part_number: item.partNumber || "-",
          quantity: item.quantity ?? "-",
          uom: item.uom || "-",
          item_notes: item.itemNotes || "-",
        }));
      })
      .filter((row) => {
        if (!text) return true;
        return [
          row.unique_code,
          row.client_name,
          row.location,
          row.sender_name,
          row.subject,
          row.brand,
          row.part_number,
        ]
          .join(" ")
          .toLowerCase()
          .includes(text);
      });
  }, [inquiries, search]);

  const changedStatuses = useMemo(() => {
    return inquiries.filter(
      (item) => statusDrafts[item.unique_code] && statusDrafts[item.unique_code] !== item.status
    );
  }, [inquiries, statusDrafts]);

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    router.push("/login");
  };

  const updateDraftStatus = (uniqueCode, value) => {
    setNotice("");
    setStatusDrafts((current) => ({ ...current, [uniqueCode]: value }));
  };

  const saveStatuses = async () => {
    if (!changedStatuses.length) {
      setNotice("No status changes to save.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await Promise.all(
        changedStatuses.map(async (item) => {
          const res = await fetch("/api/inquiries/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unique_code: item.unique_code,
              status: statusDrafts[item.unique_code],
              changed_by: employeeId,
            }),
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

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 lg:flex">
      <aside
        className={`flex border-b border-slate-200 bg-white/95 px-3 py-3 transition-all duration-200 lg:fixed lg:inset-y-0 lg:left-0 lg:flex-col lg:justify-between lg:border-b-0 lg:border-r ${
          sidebarCollapsed ? "lg:w-16" : "lg:w-52"
        }`}
      >
        <div>
          <div className="flex items-center gap-3 lg:h-14">
            <Image
              src="/logo-dark.png"
              alt="FIAPL"
              width={132}
              height={44}
              className={`h-9 w-auto object-contain ${sidebarCollapsed ? "lg:hidden" : ""}`}
              priority
            />
            <div className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <p className="text-sm font-semibold text-slate-900">Automation</p>
              <p className="text-xs text-slate-500">Fidus India</p>
            </div>
          </div>

          <nav className="mt-0 ml-auto flex items-center lg:mt-8 lg:ml-0 lg:block">
            <button className={`flex h-10 items-center gap-3 rounded-xl bg-blue-50 px-3 text-sm font-medium text-blue-700 lg:w-full ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-blue-600 shadow-sm">
                <LayoutDashboard size={16} />
              </span>
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>Dashboard</span>
            </button>
          </nav>

          <button
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={`mt-4 hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 lg:flex ${
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            }`}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!sidebarCollapsed && "Collapse"}
          </button>
        </div>

        <div className="hidden border-t border-slate-200 pt-4 lg:block">
          <div className={`mb-3 flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
              {employeeName.charAt(0).toUpperCase()}
            </div>
            <div className={sidebarCollapsed ? "hidden" : ""}>
              <p className="text-sm font-semibold text-slate-900">{employeeName}</p>
              <p className="text-xs text-slate-500">Employee</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={`flex h-10 w-full items-center gap-2 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 ${
              sidebarCollapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <LogOut size={15} />
            {!sidebarCollapsed && "Sign out"}
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 transition-all duration-200 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-52"}`}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                Employee Desk
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Assigned Inquiries
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                <Search size={16} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search code, client, part..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>

              <button
                onClick={() => employeeId && loadInquiries(employeeId)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>

              <button
                onClick={enableNotifications}
                className={`grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 ${
                  notificationsEnabled ? "text-emerald-600" : "text-slate-600"
                }`}
                title={notificationsEnabled ? "Notifications enabled" : "Enable notifications"}
              >
                <Bell size={16} />
              </button>

              <button
                onClick={handleLogout}
                className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 lg:hidden"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </div>
        </header>

        <section className="p-4 lg:p-8">
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <MetricCard label="Assigned" value={inquiries.length} />
            <MetricCard label="Line items" value={rows.length} />
            <MetricCard label="Pending save" value={changedStatuses.length} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Inquiry Information</h2>
                <p className="text-sm text-slate-500">
                  Update status for inquiries assigned to you.
                </p>
              </div>

              <button
                onClick={saveStatuses}
                disabled={saving}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                Save changes
              </button>
            </div>

            {error && (
              <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700">
                <CheckCircle2 size={16} />
                {notice}
              </div>
            )}

            <EmployeeTable
              rows={rows}
              loading={loading}
              statusDrafts={statusDrafts}
              onStatusChange={updateDraftStatus}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

const EMP_COLS = [
  { label: "Code",        defaultW: 110 },
  { label: "Client",      defaultW: 120 },
  { label: "Location",    defaultW: 100 },
  { label: "Brand",       defaultW: 90  },
  { label: "Part number", defaultW: 130 },
  { label: "Qty",         defaultW: 60  },
  { label: "UOM",         defaultW: 60  },
  { label: "Notes",       defaultW: 140 },
  { label: "Status",      defaultW: 120 },
];

function EmployeeTable({ rows, loading, statusDrafts, onStatusChange }) {
  const [colWidths, setColWidths] = useState(() => EMP_COLS.map((c) => c.defaultW));
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

  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-12 rounded-xl bg-slate-100 skeleton" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
          <LayoutDashboard size={20} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-900">No assigned inquiries</h3>
        <p className="mt-1 text-sm text-slate-500">
          When admin assigns inquiries to you, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left text-[11px]" style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0) }}>
        <colgroup>
          {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {EMP_COLS.map((col, i) => (
              <th
                key={col.label}
                style={{ width: colWidths[i], position: "relative" }}
                className="border-r border-slate-200 px-2 py-2 select-none last:border-r-0"
              >
                <span className="truncate block pr-2">{col.label}</span>
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
          {rows.map((row) => (
            <tr key={row.rowKey} className="border-b border-slate-100 transition hover:bg-blue-50/40">
              <td className="border-r border-slate-100 px-2 py-2 font-semibold text-slate-900 truncate">{row.unique_code}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-700 truncate">{row.client_name}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-600 truncate">{row.location}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-600 truncate">{row.brand}</td>
              <td className="border-r border-slate-100 px-2 py-2 font-medium text-slate-900 truncate">{row.part_number}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-600">{row.quantity}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-600">{row.uom}</td>
              <td className="border-r border-slate-100 px-2 py-2 text-slate-500 truncate" title={row.item_notes}>
                {row.item_notes}
              </td>
              <td className="px-2 py-2">
                <select
                  value={statusDrafts[row.unique_code] || row.status}
                  onChange={(e) => onStatusChange(row.unique_code, e.target.value)}
                  className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
