"use client";
import { useState } from "react";
import { Plus, RefreshCw, Trash2, X } from "lucide-react";

export default function AddInquiryModal({
  reminder        = null,
  employees       = [],
  onClose,
  onSuccess,
  hideAssignTo    = false,
  defaultAssignedTo = null,
}) {
  const extractedItems = (reminder?.line_items || [])
    .filter((i) => i && (i.brand || i.part_number))
    .map((i) => ({
      brand:       i.brand       || "",
      part_number: i.part_number || "",
      description: i.notes       || "",
      quantity:    String(i.quantity ?? ""),
      uom:         i.uom         || "PCS",
    }));

  const [form, setForm] = useState({
    client_name:  reminder?.client_name  || reminder?.sender_name  || "",
    company_name: "",
    location:     "",
    sender_name:  reminder?.sender_name  || "",
    sender_email: reminder?.sender_email || "",
    phone:        "",
    subject:      reminder?.subject      || "",
    pr_number:    "",
    notes:        reminder?.llm_summary  || "",
    assigned_to:  hideAssignTo ? String(defaultAssignedTo ?? "") : "",
  });
  const [items, setItems] = useState(
    extractedItems.length > 0
      ? extractedItems
      : [{ brand: "", part_number: "", description: "", quantity: "", uom: "PCS" }]
  );
  const [submitting,       setSubmitting]       = useState(false);
  const [validationError,  setValidationError]  = useState("");
  const [error,            setError]            = useState("");

  const updateField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const updateItem  = (idx, key, val) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const addItem     = () => setItems((prev) => [...prev, { brand: "", part_number: "", description: "", quantity: "", uom: "PCS" }]);
  const removeItem  = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setValidationError(""); setError("");
    const validItems = items.filter((i) => i.brand || i.part_number || i.description);
    if (!form.client_name.trim() && !form.company_name.trim()) {
      setValidationError("Client name or company name is required."); return;
    }
    if (!validItems.length) {
      setValidationError("Add at least one item with a brand, part number, or description."); return;
    }
    if (form.sender_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.sender_email.trim())) {
      setValidationError("Sender email is not a valid email address."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inquiries/manual", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
          items:       validItems,
          reminder_id: reminder?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create inquiry");
      onSuccess(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inp = "h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10";
  const lbl = "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
           style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EEF2F6] px-5 py-4"
             style={{ background: "linear-gradient(90deg,#F5F8FF,#F0F6FF)" }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {hideAssignTo ? "Employee · Manual Entry" : "Admin · Manual Entry"}
            </p>
            <h3 className="text-[15px] font-bold text-slate-900 mt-0.5">
              {reminder ? "Add Inquiry from Reminder" : "Add Manual Inquiry"}
            </h3>
            {reminder?.unique_code && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Linked to reminder <span className="font-semibold text-[#1D6FD8]">{reminder.unique_code}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-[#F3F5F7] hover:text-slate-700 transition">
            <X size={15} />
          </button>
        </div>

        {/* Form body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Client details */}
          <div>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Client Details</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={lbl}>Client Name <span className="text-rose-400">*</span></span>
                <input value={form.client_name} onChange={(e) => updateField("client_name", e.target.value)} placeholder="ABC Industries" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>Company Name</span>
                <input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} placeholder="ABC Industries Pvt Ltd" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>Sender Name</span>
                <input value={form.sender_name} onChange={(e) => updateField("sender_name", e.target.value)} placeholder="Contact person" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>Sender Email</span>
                <input value={form.sender_email} onChange={(e) => updateField("sender_email", e.target.value)} placeholder="email@company.com" type="email" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>Phone</span>
                <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="9876543210" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>Location</span>
                <input value={form.location} onChange={(e) => updateField("location", e.target.value)} placeholder="City, State" className={inp} />
              </label>
            </div>
          </div>

          {/* Inquiry details */}
          <div>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Inquiry Details</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className={lbl}>Subject / Inquiry Description</span>
                <input value={form.subject} onChange={(e) => updateField("subject", e.target.value)} placeholder="RFQ for sensors — June 2026" className={inp} />
              </label>
              <label className="block">
                <span className={lbl}>PR / Reference No.</span>
                <input value={form.pr_number} onChange={(e) => updateField("pr_number", e.target.value)} placeholder="PR-2026-001" className={inp} />
              </label>
              {!hideAssignTo && (
                <label className="block">
                  <span className={lbl}>Assign To</span>
                  <select value={form.assigned_to} onChange={(e) => updateField("assigned_to", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#E4E8EE] bg-white px-3 text-[12px] text-slate-700 outline-none transition focus:border-[#5BA7FF]">
                    <option value="">Unassigned</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className={`block ${!hideAssignTo ? "col-span-2" : "col-span-1"}`}>
                <span className={lbl}>Notes / Remarks</span>
                <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2}
                  placeholder="Any additional context or remarks…"
                  className="w-full resize-none rounded-lg border border-[#E4E8EE] bg-white px-3 py-2 text-[12px] text-slate-700 outline-none transition focus:border-[#5BA7FF] focus:ring-2 focus:ring-[#5BA7FF]/10" />
              </label>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Line Items <span className="text-rose-400">*</span>
                <span className="ml-1 normal-case font-normal text-slate-300">({items.length} row{items.length !== 1 ? "s" : ""})</span>
              </p>
              <button onClick={addItem} className="flex items-center gap-1 text-[11px] font-semibold text-[#1D6FD8] hover:text-[#1559B7] transition">
                <Plus size={12} /> Add Item
              </button>
            </div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1.8fr_60px_70px_28px] gap-1.5 mb-1.5 px-0.5">
              {["Brand", "Part No.", "Description", "Qty", "UOM", ""].map((h) => (
                <span key={h} className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{h}</span>
              ))}
            </div>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_1.2fr_1.8fr_60px_70px_28px] gap-1.5 items-center">
                  <input value={item.brand}       onChange={(e) => updateItem(i, "brand",       e.target.value)} placeholder="IFM"       className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.part_number} onChange={(e) => updateItem(i, "part_number", e.target.value)} placeholder="PN-12345"  className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Inductive proximity sensor" className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.quantity}    onChange={(e) => updateItem(i, "quantity",    e.target.value)} placeholder="10" type="number" min="0" className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <input value={item.uom}         onChange={(e) => updateItem(i, "uom",         e.target.value)} placeholder="PCS"       className="h-8 rounded-lg border border-[#E4E8EE] bg-white px-2.5 text-[11px] text-slate-700 outline-none focus:border-[#5BA7FF]" />
                  <button onClick={() => removeItem(i)} disabled={items.length === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-[#FFF1F2] hover:text-rose-500 disabled:opacity-30 disabled:pointer-events-none">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {(validationError || error) && (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
              {validationError || error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[#EEF2F6] px-5 py-4">
          <div className="flex-1 text-[10px] text-slate-400">
            FIAPL code will be generated automatically. Source: Manual.
          </div>
          <button onClick={onClose} className="h-9 rounded-xl border border-[#E4E8EE] bg-white px-4 text-[12px] font-medium text-slate-700 transition hover:bg-[#F3F5F7]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 h-9 rounded-xl px-5 text-[12px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#5BA7FF 0%,#6D7CFF 100%)", boxShadow: "0 2px 8px rgba(91,167,255,0.28)" }}
          >
            {submitting
              ? <><RefreshCw size={12} className="animate-spin" />Creating…</>
              : <><Plus size={12} />Create Inquiry</>}
          </button>
        </div>
      </div>
    </div>
  );
}
