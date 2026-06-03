"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  LayoutDashboard,
  Inbox,
  Bell,
  Search,
  Package,
  LogOut,
} from "lucide-react";

export default function AdminDashboard() {

  const router = useRouter();

  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [inquiries, setInquiries] = useState([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [inquiriesError, setInquiriesError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadInquiries() {
      try {
        setIsLoadingInquiries(true);
        setInquiriesError("");

        const response = await fetch("/api/inquiries");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load inquiries");
        }

        if (isMounted) {
          setInquiries(data.inquiries || []);
        }
      } catch (error) {
        if (isMounted) {
          setInquiriesError(error.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingInquiries(false);
        }
      }
    }

    loadInquiries();

    return () => {
      isMounted = false;
    };
  }, []);

  const totalInquiries = inquiries.length;
  const inProgressCount = inquiries.filter(
    (inquiry) => inquiry.status === "in_progress"
  ).length;
  const newCount = inquiries.filter((inquiry) => inquiry.status === "new").length;

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    router.push("/login");
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

              <span className="text-orange-500">
                Automation
              </span>

            </h1>

            <p className="text-neutral-500 mt-1 text-sm">
              Fidus India Automation
            </p>

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

          </div>

        </div>

        {/* PROFILE */}
        <div className="p-4 border-t border-neutral-200">

          <div className="bg-[#fafafa] rounded-3xl p-4 flex items-center gap-3 border border-neutral-200">

            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-lg font-bold shadow-sm">

              A

            </div>

            <div>

              <h3 className="font-semibold text-sm">
                Admin
              </h3>

              <p className="text-neutral-500 text-xs">
                Super Admin
              </p>

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

              {activeMenu === "dashboard"
                ? "Dashboard"
                : "Sales Inquiries"}

            </h1>

            <p className="text-neutral-500 mt-1 text-sm">
              Monitor inquiries and employee workflow
            </p>

          </div>

          <div className="flex items-center gap-4">

            {/* SEARCH */}
            <div className="flex items-center gap-3 bg-[#fafafa] border border-neutral-200 px-4 py-3 rounded-2xl min-w-[280px]">

              <Search
                size={16}
                className="text-neutral-500"
              />

              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-neutral-950 placeholder:text-neutral-400 w-full"
              />

            </div>

            {/* NOTIFICATION */}
            <button className="w-11 h-11 rounded-2xl bg-[#fafafa] border border-neutral-200 flex items-center justify-center hover:bg-orange-50 hover:border-orange-200 transition-all duration-300">

              <Bell size={18} />

            </button>

          </div>

        </div>

        {/* ================= CONTENT ================= */}
        <div className="flex-1 overflow-auto p-7 space-y-7">

          {/* ================= DASHBOARD SCREEN ================= */}
          {activeMenu === "dashboard" && (

            <>

              {/* CARDS */}
              <div className="grid grid-cols-3 gap-6">

                <DashboardCard
                  title="Total Inquiries"
                  value={isLoadingInquiries ? "..." : totalInquiries}
                />

                <DashboardCard
                  title="In Progress"
                  value={isLoadingInquiries ? "..." : inProgressCount}
                />

                <DashboardCard
                  title="New"
                  value={isLoadingInquiries ? "..." : newCount}
                />

              </div>

              {/* RECENT SALES TABLE */}
              <RecentSalesTable
                inquiries={inquiries}
                isLoading={isLoadingInquiries}
                error={inquiriesError}
              />

            </>
          )}

          {/* ================= SALES SCREEN ================= */}
          {activeMenu === "sales" && (

            <div className="bg-white border border-neutral-200 rounded-[28px] overflow-hidden shadow-sm">

              {/* HEADER */}
              <div className="flex items-center justify-between px-8 py-7 border-b border-white/5">

                <div>

                  <h2 className="text-3xl font-bold">
                    Sales Inquiries Dashboard
                  </h2>

                  <p className="text-neutral-500 mt-2 text-sm">
                    Team inquiry performance overview
                  </p>

                </div>

                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-400/25 flex items-center justify-center">

                  <Package
                    size={24}
                    className="text-orange-400"
                  />

                </div>

              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">

                <table className="w-full">

                  <thead className="bg-orange-50 text-neutral-500 text-sm border-b border-orange-100">

                    <tr>

                      <th className="text-left px-7 py-5 font-medium">
                        Sr. No.
                      </th>

                      <th className="text-left px-7 py-5 font-medium">
                        Team
                      </th>

                      <th className="text-left px-7 py-5 font-medium">
                        Quoted
                      </th>

                      <th className="text-left px-7 py-5 font-medium">
                        In Progress
                      </th>

                      <th className="text-left px-7 py-5 font-medium">
                        New
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    <SalesRow
                      sr="1"
                      team="TM"
                      quoted="5"
                      progress="12"
                      newData="4"
                    />

                    <SalesRow
                      sr="2"
                      team="BS"
                      quoted="3"
                      progress="14"
                      newData="3"
                    />

                    <SalesRow
                      sr="3"
                      team="SY"
                      quoted="7"
                      progress="11"
                      newData="7"
                    />

                  </tbody>

                </table>

              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

/* ================= SIDEBAR ITEM ================= */
function SidebarItem({
  icon,
  title,
  active,
  onClick,
}) {

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

      <span className="text-sm font-medium">
        {title}
      </span>

    </button>
  );
}

/* ================= DASHBOARD CARD ================= */
function DashboardCard({
  title,
  value,
}) {

  return (

    <div className="bg-white border border-neutral-200 rounded-[28px] p-7 shadow-sm hover:translate-y-[-2px] hover:border-orange-200 transition-all duration-300">

      <p className="text-neutral-500 text-sm">
        {title}
      </p>

      <h2 className="text-5xl font-bold mt-4">
        {value}
      </h2>

    </div>
  );
}

/* ================= SALES ROW ================= */
function SalesRow({
  sr,
  team,
  quoted,
  progress,
  newData,
}) {

  return (

    <tr className="border-t border-neutral-200 hover:bg-orange-50 transition-all duration-300">

      <td className="px-7 py-6 text-sm">
        {sr}
      </td>

      <td className="px-7 py-6 text-orange-400 font-semibold text-sm">
        {team}
      </td>

      <td className="px-7 py-6 text-sm">
        {quoted}
      </td>

      <td className="px-7 py-6 text-sm">
        {progress}
      </td>

      <td className="px-7 py-6 text-sm">
        {newData}
      </td>

    </tr>
  );
}

/* ================= RECENT SALES TABLE ================= */
function RecentSalesTable({
  inquiries,
  isLoading,
  error,
}) {

  return (

    <div className="bg-white border border-neutral-200 rounded-[28px] overflow-hidden shadow-sm">

      {/* HEADER */}
      <div className="px-7 py-6 border-b border-white/5 flex items-center justify-between">

        <div>

          <h2 className="text-2xl font-bold">
            Recent Sales Inquiries
          </h2>

          <p className="text-neutral-500 text-sm mt-1">
            Latest inquiry activity overview
          </p>

        </div>

        <button className="bg-orange-500 hover:bg-orange-600 transition-all duration-300 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-sm">

          + Add Inquiry

        </button>

      </div>

      {/* TABLE */}
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

            {!isLoading && !error && inquiries.map((inquiry, index) => {
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
    day: "2-digit",
    month: "short",
    year: "2-digit",
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
  sr,
  date,
  code,
  client,
  location,
  user,
  pr,
  brand,
  part,
  uom,
  qty,
  assigned,
  status,
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
