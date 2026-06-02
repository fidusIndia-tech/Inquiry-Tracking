"use client";

import { useState } from "react";

import {
  LayoutDashboard,
  ClipboardList,
  CheckCircle,
  User,
  LogOut,
  Bell,
  Search,
  Plus,
  Save,
} from "lucide-react";

export default function EmployeeDashboard() {
  const [activeMenu, setActiveMenu] = useState("dashboard");

  return (
    <div className="h-screen flex bg-[#060B1A] text-white overflow-hidden">
      {/* ================= SIDEBAR ================= */}
      <div className="w-[300px] bg-[#081225] border-r border-white/10 flex flex-col justify-between">
        <div>
          {/* LOGO */}
          <div className="px-8 py-10 border-b border-white/10">
            <h1 className="text-4xl font-bold tracking-tight">
              Fidus{" "}
              <span className="text-violet-400">
                India
              </span>
            </h1>

            <p className="text-gray-400 mt-2">
              Employee Workflow Panel
            </p>
          </div>

          {/* MENU */}
          <div className="p-5 space-y-4">
            <SidebarItem
              icon={<LayoutDashboard size={20} />}
              title="Dashboard"
              active={activeMenu === "dashboard"}
              onClick={() => setActiveMenu("dashboard")}
            />

          </div>
        </div>

        {/* LOGOUT */}
        <div className="p-5 border-t border-white/10">
          <button className="w-full flex items-center gap-4 bg-red-500/20 hover:bg-red-500/30 transition-all px-5 py-4 rounded-2xl text-red-400">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* ================= MAIN ================= */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ================= TOPBAR ================= */}
        <div className="px-10 py-6 border-b border-white/10 flex items-center justify-between bg-[#081225]">
          <div>
            <h1 className="text-4xl font-bold">
              Employee Dashboard
            </h1>

            <p className="text-gray-400 mt-1">
              Manage and update assigned inquiries
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* SEARCH */}
            <div className="flex items-center gap-3 bg-[#111C34] px-5 py-3 rounded-2xl border border-white/10">
              <Search size={18} className="text-gray-400" />

              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
              />
            </div>

            {/* NOTIFICATION */}
            <button className="w-12 h-12 rounded-2xl bg-[#111C34] border border-white/10 flex items-center justify-center hover:bg-violet-500/20 transition-all">
              <Bell size={20} />
            </button>
          </div>
        </div>

        {/* ================= CONTENT ================= */}
        <div className="flex-1 overflow-auto p-10 space-y-8">
          {/* ================= TABLE ================= */}
          <EditableInquiryTable />
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
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 ${
        active
          ? "bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg"
          : "hover:bg-[#111C34]"
      }`}
    >
      {icon}

      <span className="font-medium text-lg">
        {title}
      </span>
    </button>
  );
}

/* ================= CARD ================= */
function Card({
  title,
  value,
}) {
  return (
    <div className="bg-[#08142C] border border-[#1b2b52] rounded-[30px] p-8 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
      <p className="text-gray-400 text-lg">
        {title}
      </p>

      <h2 className="text-5xl font-bold mt-4">
        {value}
      </h2>
    </div>
  );
}

/* ================= EDITABLE TABLE ================= */
function EditableInquiryTable() {
  const [rows, setRows] = useState([
    {
      sr: 1,
      code: "FIAPL0000001",
      client: "Ceat",
      location: "Halol",
      user: "Deepak",
      pr: "123456789",
      brand: "Shinhen",
      part: "BP20",
      uom: "Ltr",
      qty: "100",
      vendor: "HRD",
      system: "XYS",
      status: "Sent",
    },
  ]);

  const handleChange = (index, field, value) => {
    const updatedRows = [...rows];

    updatedRows[index][field] = value;

    setRows(updatedRows);
  };

  const addRow = () => {
    setRows([
      ...rows,
      {
        sr: rows.length + 1,
        code: "",
        client: "",
        location: "",
        user: "",
        pr: "",
        brand: "",
        part: "",
        uom: "",
        qty: "",
        vendor: "",
        system: "",
        status: "",
      },
    ]);
  };

  return (
    <div className="bg-[#08142C] border border-[#1b2b52] rounded-[30px] overflow-hidden shadow-[0_0_40px_rgba(139,92,246,0.08)]">
      {/* HEADER */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-[#1b2b52] bg-gradient-to-r from-[#2b2255] to-[#08142C]">
        <div>
          <h2 className="text-3xl font-bold">
            Inquiry Information
          </h2>

          <p className="text-gray-400 mt-2">
            Edit and Update Inquiries
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={addRow}
            className="bg-violet-500 hover:bg-violet-400 transition-all px-5 py-3 rounded-2xl flex items-center gap-2 font-medium"
          >
            <Plus size={18} />

            Add Row
          </button>

          <button className="bg-green-500 hover:bg-green-400 transition-all px-5 py-3 rounded-2xl flex items-center gap-2 font-medium">
            <Save size={18} />

            Save
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#141F3B] text-gray-300">
            <tr>
              <th className="px-6 py-5 text-left">
                Sr No.
              </th>

              <th className="px-6 py-5 text-left">
                F Unique Code
              </th>

              <th className="px-6 py-5 text-left">
                Client Name
              </th>

              <th className="px-6 py-5 text-left">
                Location
              </th>

              <th className="px-6 py-5 text-left">
                User Name
              </th>

              <th className="px-6 py-5 text-left">
                PR #
              </th>

              <th className="px-6 py-5 text-left">
                Brand
              </th>

              <th className="px-6 py-5 text-left">
                Part Number
              </th>

              <th className="px-6 py-5 text-left">
                UOM
              </th>

              <th className="px-6 py-5 text-left">
                Qty
              </th>

              <th className="px-6 py-5 text-left">
                Vendor
              </th>

              <th className="px-6 py-5 text-left">
                System Minute
              </th>

              <th className="px-6 py-5 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-t border-[#1b2b52] hover:bg-white/[0.03]"
              >
                <td className="px-4 py-4 text-center">
                  {row.sr}
                </td>

                {[
                  "code",
                  "client",
                  "location",
                  "user",
                  "pr",
                  "brand",
                  "part",
                  "uom",
                  "qty",
                  "vendor",
                  "system",
                  "status",
                ].map((field) => (
                  <td key={field} className="px-3 py-3">
                    <input
                      type="text"
                      value={row[field]}
                      onChange={(e) =>
                        handleChange(
                          index,
                          field,
                          e.target.value
                        )
                      }
                      className="
                        w-full
                        bg-[#111C34]
                        border
                        border-[#1b2b52]
                        rounded-xl
                        px-3
                        py-2
                        text-white
                        outline-none
                        focus:border-violet-500
                      "
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}