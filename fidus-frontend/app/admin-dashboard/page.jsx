"use client";

import { useState } from "react";

import {
  LayoutDashboard,
  Inbox,
  Bell,
  Search,
  Package,
} from "lucide-react";

export default function AdminDashboard() {

  const [activeMenu, setActiveMenu] = useState("dashboard");

  return (

    <div className="h-screen bg-[#060B1A] text-white flex overflow-hidden">

      {/* ================= SIDEBAR ================= */}
      <div className="w-[260px] bg-[#081225] border-r border-white/10 flex flex-col justify-between">

        <div>

          {/* LOGO */}
          <div className="px-7 py-7 border-b border-white/10">

            <h1 className="text-3xl font-bold tracking-tight">

              Fidus{" "}

              <span className="text-violet-400">
                India
              </span>

            </h1>

            <p className="text-gray-400 mt-1 text-sm">
              Workflow Platform
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
        <div className="p-4 border-t border-white/10">

          <div className="bg-[#111C34] rounded-3xl p-4 flex items-center gap-3 border border-white/5">

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-lg font-bold shadow-lg">

              A

            </div>

            <div>

              <h3 className="font-semibold text-sm">
                Admin
              </h3>

              <p className="text-gray-400 text-xs">
                Super Admin
              </p>

            </div>

          </div>

        </div>

      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ================= TOPBAR ================= */}
        <div className="px-8 py-5 border-b border-white/10 flex items-center justify-between bg-[#081225]/95 backdrop-blur-xl">

          <div>

            <h1 className="text-3xl font-bold tracking-tight">

              {activeMenu === "dashboard"
                ? "Dashboard"
                : "Sales Inquiries"}

            </h1>

            <p className="text-gray-400 mt-1 text-sm">
              Monitor inquiries and employee workflow
            </p>

          </div>

          <div className="flex items-center gap-4">

            {/* SEARCH */}
            <div className="flex items-center gap-3 bg-[#111C34] border border-white/10 px-4 py-3 rounded-2xl min-w-[280px]">

              <Search
                size={16}
                className="text-gray-400"
              />

              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-white placeholder:text-gray-500 w-full"
              />

            </div>

            {/* NOTIFICATION */}
            <button className="w-11 h-11 rounded-2xl bg-[#111C34] border border-white/10 flex items-center justify-center hover:bg-violet-500/20 hover:border-violet-500/30 transition-all duration-300">

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
                  value="128"
                />

                <DashboardCard
                  title="In Progress"
                  value="37"
                />

                <DashboardCard
                  title="New"
                  value="21"
                />

              </div>

              {/* RECENT SALES TABLE */}
              <RecentSalesTable />

            </>
          )}

          {/* ================= SALES SCREEN ================= */}
          {activeMenu === "sales" && (

            <div className="bg-gradient-to-b from-[#0B1736] to-[#08142C] border border-[#1b2b52] rounded-[28px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.45)]">

              {/* HEADER */}
              <div className="flex items-center justify-between px-8 py-7 border-b border-white/5">

                <div>

                  <h2 className="text-3xl font-bold">
                    Sales Inquiries Dashboard
                  </h2>

                  <p className="text-gray-400 mt-2 text-sm">
                    Team inquiry performance overview
                  </p>

                </div>

                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 flex items-center justify-center">

                  <Package
                    size={24}
                    className="text-violet-400"
                  />

                </div>

              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">

                <table className="w-full">

                  <thead className="bg-[#141F3B] text-gray-400 text-sm border-b border-white/5">

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
          ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20"
          : "text-gray-300 hover:bg-[#111C34]"
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

    <div className="bg-gradient-to-b from-[#0B1736] to-[#08142C] border border-[#1b2b52] rounded-[28px] p-7 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:translate-y-[-2px] transition-all duration-300">

      <p className="text-gray-400 text-sm">
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

    <tr className="border-t border-[#1b2b52] hover:bg-white/[0.03] transition-all duration-300">

      <td className="px-7 py-6 text-sm">
        {sr}
      </td>

      <td className="px-7 py-6 text-cyan-400 font-semibold text-sm">
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
function RecentSalesTable() {

  return (

    <div className="bg-gradient-to-b from-[#0B1736] to-[#08142C] border border-[#1b2b52] rounded-[28px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.45)]">

      {/* HEADER */}
      <div className="px-7 py-6 border-b border-white/5 flex items-center justify-between">

        <div>

          <h2 className="text-2xl font-bold">
            Recent Sales Inquiries
          </h2>

          <p className="text-gray-400 text-sm mt-1">
            Latest inquiry activity overview
          </p>

        </div>

        <button className="bg-gradient-to-r from-violet-500 to-purple-600 hover:scale-105 transition-all duration-300 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg shadow-violet-500/20">

          + Add Inquiry

        </button>

      </div>

      {/* TABLE */}
      <div className="overflow-x-auto">

        <table className="w-full table-auto">

          <thead className="bg-[#141F3B] text-gray-400 text-sm border-b border-white/5">

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

            <TableRow
              sr="1"
              date="15-06-26"
              code="FIAPL0000001"
              client="Ceat"
              location="Halol"
              user="Deepak"
              pr="123456789"
              brand="Shinhen"
              part="BP20"
              uom="Ltr"
              qty="100"
              assigned="Deepak"
              status="Pending"
            />

            <TableRow
              sr="2"
              date="14-06-26"
              code="FIAPL0000002"
              client="Toyota UAE"
              location="Dubai"
              user="Rahul"
              pr="876543210"
              brand="Toyota"
              part="Filter-X"
              uom="PCS"
              qty="50"
              assigned="Rahul"
              status="Completed"
            />

          </tbody>

        </table>

      </div>

    </div>
  );
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

    <tr className="border-t border-[#1b2b52] hover:bg-white/[0.03] transition-all duration-300">

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
          className="bg-[#111C34] border border-[#24345c] text-white px-4 py-2.5 rounded-2xl outline-none text-sm focus:border-violet-500 transition-all"
        >

          <option>Deepak</option>
          <option>Rahul</option>
          <option>Aman</option>

        </select>

      </td>

      <td className="px-6 py-6">

        <span
          className={`px-4 py-2 rounded-full text-xs font-semibold border ${
            status === "Completed"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          }`}
        >

          {status}

        </span>

      </td>

    </tr>
  );
}