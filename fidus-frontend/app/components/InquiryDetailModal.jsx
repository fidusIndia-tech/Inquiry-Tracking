"use client";

import { X } from "lucide-react";

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
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-[12px] font-medium text-slate-800 break-all">{value || "—"}</p>
    </div>
  );
}

export default function InquiryDetailModal({ inquiry, onClose }) {
  const items  = inquiry.items?.length ? inquiry.items : [];
  const status = inquiry.status || "new";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white"
        style={{ maxHeight: "90vh", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-[#EEF2F6] p-5"
          style={{ background: "linear-gradient(90deg,#F5F8FF,#EEF4FF)" }}
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inquiry Details</p>
              <h3 className="mt-0.5 text-[17px] font-bold text-slate-900">{inquiry.unique_code}</h3>
            </div>
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[status] || STATUS_CLASSES.new}`}
            >
              {formatStatus(status)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Client Name"   value={inquiry.client_name} />
            <InfoField label="Location"      value={inquiry.location} />
            <InfoField label="Sender"        value={inquiry.sender_name} />
            <InfoField label="Email"         value={inquiry.sender_email} />
            <InfoField label="Received"      value={formatDate(inquiry.email_date)} />
            <InfoField label="Assigned To"   value={inquiry.assigned_to_name} />
            <InfoField label="Assigned At"   value={formatDate(inquiry.assigned_at)} />
            {inquiry.in_progress_at && (
              <InfoField label="In Progress Since" value={formatDate(inquiry.in_progress_at)} />
            )}
            {inquiry.quoted_at && (
              <InfoField label="Quoted Since" value={formatDate(inquiry.quoted_at)} />
            )}
          </div>

          {/* Subject */}
          {inquiry.subject && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Subject</p>
              <p className="rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 break-words">
                {inquiry.subject}
              </p>
            </div>
          )}

          {/* Notes */}
          {inquiry.notes && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
              <p className="rounded-xl border border-[#E4E8EE] bg-[#F8FAFC] px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 break-words">
                {inquiry.notes}
              </p>
            </div>
          )}

          {/* Line items */}
          {items.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Line Items ({items.length})
              </p>
              <div className="overflow-hidden rounded-xl border border-[#E4E8EE]">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr style={{ background: "linear-gradient(90deg,#EEF4FF,#E6EDFC)" }}>
                      {["Brand", "Part Number", "Qty", "UOM", "Notes"].map((h) => (
                        <th key={h} className="border-b border-[#D0DCF4] px-3 py-2 text-left font-bold text-[#4461A8]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-[#EEF2F6] last:border-b-0"
                        style={{ background: idx % 2 === 0 ? "white" : "#F8FAFC" }}
                      >
                        <td className="px-3 py-2 text-slate-600">{item.brand      || "—"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{item.partNumber || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{item.quantity   || "—"}</td>
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

        {/* Footer */}
        <div
          className="flex shrink-0 justify-end border-t border-[#EEF2F6] p-4"
          style={{ background: "#F8FAFC" }}
        >
          <button
            onClick={onClose}
            className="h-9 rounded-xl border border-[#E4E8EE] bg-white px-5 text-[13px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
