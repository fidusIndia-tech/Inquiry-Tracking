"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Users,
  X,
  Zap,
} from "lucide-react";

export default function LoginPage() {
  const router                    = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [role,      setRole]      = useState("admin");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  /* Close modal on Escape */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setShowModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openModal = () => {
    setError(""); setEmail(""); setPassword(""); setRole("admin");
    setShowModal(true);
  };

  const handleLogin = async () => {
    setError("");
    const normalizedEmail    = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
          role,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid email or password.");
      }

      const matchedUser = data.user;
      localStorage.setItem("role", matchedUser.role);
      localStorage.setItem("userId", matchedUser.id);
      localStorage.setItem("userName", matchedUser.name);
      setShowModal(false);
      setLoading(false);
      router.push(
        matchedUser.role === "admin" ? "/admin-dashboard" : "/employee-dashboard"
      );
      return;
    } catch (err) {
      setLoading(false);
      setError(err.message || "Invalid email or password.");
    }
  };

  return (
    <>
      {/* ─── Hero / Landing ─── */}
      <main className="login-animated-bg min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">

        {/* Floating colour blobs */}
        <div
          className="login-blob h-72 w-72 bg-[#93C5FD]"
          style={{ top: "8%", left: "10%", animation: "blob-float 10s ease-in-out infinite" }}
        />
        <div
          className="login-blob h-80 w-80 bg-[#C4B5FD]"
          style={{ top: "55%", right: "8%", animation: "blob-float 13s ease-in-out infinite reverse" }}
        />
        <div
          className="login-blob h-56 w-56 bg-[#6EE7B7]"
          style={{ bottom: "12%", left: "20%", animation: "blob-float 9s ease-in-out infinite 2s" }}
        />
        <div
          className="login-blob h-48 w-48 bg-[#FCA5A5]"
          style={{ top: "25%", right: "18%", animation: "blob-float 11s ease-in-out infinite 1s" }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center animate-fade-up max-w-xl w-full">

          {/* Logo */}
          <Image
            src="/logo-dark.png"
            alt="FIAPL"
            width={230}
            height={78}
            className="h-20 w-auto mb-8 drop-shadow-sm"
            priority
          />

          {/* Headline */}
          <h1 className="text-[38px] sm:text-[44px] font-bold text-slate-900 tracking-tight leading-tight">
            Industrial Inquiry
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #5BA7FF, #6D7CFF, #7FD8BE)" }}
            >
              Management Platform
            </span>
          </h1>

          <p className="mt-4 text-[15px] text-slate-600 max-w-md leading-relaxed">
            Track RFQs, assign ownership, and keep your inquiry pipeline
            clear from one intelligent operations desk.
          </p>

          {/* Status pills */}
          <div className="mt-7 flex gap-2.5 flex-wrap justify-center">
            <StatusPill icon={<Zap size={11} />}         label="RFQ Intake"  value="Live"   color="#5BA7FF" />
            <StatusPill icon={<Users size={11} />}        label="Team Desk"   value="Active" color="#6D7CFF" />
            <StatusPill icon={<CheckCircle size={11} />}  label="Pipeline"    value="Clear"  color="#7FD8BE" />
          </div>

          {/* CTA button */}
          <button
            onClick={openModal}
            className="mt-10 flex items-center gap-2.5 px-8 py-4 rounded-2xl text-white text-[15px] font-semibold transition-all duration-150 active:scale-[0.98]"
            style={{
              background:  "linear-gradient(135deg, #5BA7FF 0%, #6D7CFF 100%)",
              boxShadow:   "0 8px 32px rgba(91,167,255,0.42), 0 2px 8px rgba(91,167,255,0.20)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 12px 40px rgba(91,167,255,0.50), 0 4px 12px rgba(91,167,255,0.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 8px 32px rgba(91,167,255,0.42), 0 2px 8px rgba(91,167,255,0.20)")}
          >
            Sign In to Dashboard
            <ArrowRight size={16} />
          </button>

          {/* Footer note */}
          <p className="mt-8 text-[12px] text-slate-400">
            Authorized access only · FIAPL internal platform
          </p>
        </div>
      </main>

      {/* ─── Login Modal ─── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-md" onClick={() => setShowModal(false)} />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md animate-modal">
            <div className="bg-white rounded-2xl p-8 card-shadow-lg">

              {/* Close button */}
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#F3F5F7] hover:text-slate-700"
              >
                <X size={15} />
              </button>

              {/* Logo + brand */}
              <div className="flex items-center gap-3 mb-6">
                <Image
                  src="/logo-dark.png"
                  alt="FIAPL"
                  width={150}
                  height={40}
                  className="h-10 w-auto object-contain"
                />
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 leading-tight">FIAPL Automation</p>
                  <p className="text-[11px] text-slate-400">Fidus India</p>
                </div>
              </div>

              <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Sign in</h2>
              <p className="text-[13px] text-slate-400 mt-1">Access your inquiry dashboard</p>

              {/* Role toggle */}
              <div className="mt-5 flex rounded-xl p-1 gap-1" style={{ background: "#F3F5F7" }}>
                <RoleTab
                  active={role === "admin"}
                  icon={<ShieldCheck size={13} />}
                  label="Admin"
                  onClick={() => { setRole("admin"); setError(""); }}
                />
                <RoleTab
                  active={role === "employee"}
                  icon={<Users size={13} />}
                  label="Employee"
                  onClick={() => { setRole("employee"); setError(""); }}
                />
              </div>

              {/* Fields */}
              <div className="mt-4 space-y-3">
                <Field label="Email address" icon={<Mail size={14} className="text-slate-400 shrink-0" />}>
                  <input
                    type="email"
                    placeholder="you@fidus.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </Field>

                <Field label="Password" icon={<LockKeyhole size={14} className="text-slate-400 shrink-0" />}>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </Field>
              </div>

              {/* Error */}
              {error && (
                <p className="mt-2.5 text-[12px] font-medium text-rose-600 animate-fade-in">{error}</p>
              )}

              {/* Submit */}
              <button
                onClick={handleLogin}
                disabled={loading}
                className="mt-5 w-full h-11 flex items-center justify-center gap-2 rounded-xl text-white text-[13px] font-semibold transition-all duration-150 disabled:opacity-60"
                style={{
                  background:  "linear-gradient(135deg, #5BA7FF 0%, #4D9AFF 100%)",
                  boxShadow:   "0 2px 12px rgba(91,167,255,0.32)",
                }}
              >
                {loading
                  ? <Loader2 size={15} className="animate-spin" />
                  : <><span>Sign In</span><ArrowRight size={14} /></>}
              </button>

              <p className="mt-5 text-center text-[11px] text-slate-400">
                Secure access · Authorized users only
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Sub-components ── */
function StatusPill({ icon, label, value, color }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium border"
      style={{ background: `${color}12`, borderColor: `${color}30`, color: color }}
    >
      <span className="flex items-center">{icon}</span>
      <span className="text-slate-600 font-normal">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function RoleTab({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        active ? "bg-white text-slate-900" : "text-slate-500 hover:text-slate-800"
      }`}
      style={active ? { boxShadow: "0 1px 3px rgba(15,23,42,0.09)" } : {}}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, icon, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-slate-600 mb-1.5">{label}</span>
      <div
        className="h-11 flex items-center gap-2.5 px-3.5 rounded-xl border bg-[#FAFBFC] transition-all duration-150 focus-within:bg-white"
        style={{ borderColor: "#E4E8EE" }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "#5BA7FF";
          e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(91,167,255,0.12)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "#E4E8EE";
          e.currentTarget.style.boxShadow   = "none";
        }}
      >
        {icon}
        {children}
      </div>
    </label>
  );
}
