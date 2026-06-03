"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  LayoutDashboard,
  LogOut,
  Bell,
  Search,
  Plus,
  Save,
} from "lucide-react";

export default function EmployeeDashboard() {
  const router = useRouter();

  const [activeMenu, setActiveMenu] = useState("dashboard");

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    router.push("/login");
  };

  return (
    <div className="h-screen flex bg-[#f7f7f7] text-neutral-950 overflow-hidden">
      {/* ================= SIDEBAR ================= */}
      <div className="w-[300px] bg-white border-r border-neutral-200 flex flex-col justify-between">
        <div>
          {/* LOGO */}
          <div className="px-8 py-10 border-b border-neutral-200">
            <h1 className="text-4xl font-bold tracking-tight">
              FIAPL{" "}
              <span className="text-orange-500">
                Automation
              </span>
            </h1>

            <p className="text-neutral-500 mt-2">
              Fidus India Automation
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
        <div className="p-5 border-t border-neutral-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 bg-neutral-950 hover:bg-neutral-800 transition-all px-5 py-4 rounded-2xl text-white"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* ================= MAIN ================= */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ================= TOPBAR ================= */}
        <div className="px-10 py-6 border-b border-neutral-200 flex items-center justify-between bg-white">
          <div>
            <h1 className="text-4xl font-bold">
              Employee Dashboard
            </h1>

            <p className="text-neutral-500 mt-1">
              Manage and update assigned inquiries
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* SEARCH */}
            <div className="flex items-center gap-3 bg-[#fafafa] px-5 py-3 rounded-2xl border border-neutral-200">
              <Search size={18} className="text-neutral-500" />

              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-neutral-950 placeholder:text-neutral-400"
              />
            </div>

            {/* NOTIFICATION */}
            <button className="w-12 h-12 rounded-2xl bg-[#fafafa] border border-neutral-200 flex items-center justify-center hover:bg-orange-50 hover:border-orange-200 transition-all">
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
          ? "bg-orange-500 text-white shadow-sm"
          : "text-neutral-700 hover:bg-orange-50 hover:text-orange-700"
      }`}
    >
      {icon}

      <span className="font-medium text-lg">
        {title}
      </span>
    </button>
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
    <div className="bg-white border border-neutral-200 rounded-[30px] overflow-hidden shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-neutral-200 bg-orange-50">
        <div>
          <h2 className="text-3xl font-bold">
            Inquiry Information
          </h2>

          <p className="text-neutral-500 mt-2">
            Edit and Update Inquiries
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={addRow}
            className="bg-orange-500 hover:bg-orange-600 transition-all px-5 py-3 rounded-2xl flex items-center gap-2 font-medium text-white shadow-sm"
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
          <thead className="bg-[#fafafa] text-neutral-600">
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
                className="border-t border-neutral-200 hover:bg-orange-50"
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
                        bg-white
                        border
                        border-neutral-200
                        rounded-xl
                        px-3
                        py-2
                        text-neutral-950
                        outline-none
                        focus:border-orange-500
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
