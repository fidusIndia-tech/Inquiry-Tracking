"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ShieldCheck,
  Users,
  Mail,
  LockKeyhole,
} from "lucide-react";

export default function LoginPage() {

  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  const [role, setRole] = useState("admin");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleLogin = () => {

    if (!email || !password) {
      alert("Please fill all fields");
      return;
    }

    /* ================= ADMIN LOGIN ================= */

    if (
      email === "admin@fidusindia.com" &&
      password === "123456" &&
      role === "admin"
    ) {

      localStorage.setItem("role", "admin");

      router.push("/admin-dashboard");

      return;
    }

    /* ================= EMPLOYEE LOGIN ================= */

    if (
      email === "employee@fidusindia.com" &&
      password === "123456" &&
      role === "employee"
    ) {

      localStorage.setItem("role", "employee");

      router.push("/employee-dashboard");

      return;
    }

    /* ================= INVALID ================= */

    alert("Invalid Credentials");
  };

  return (

    <div className="h-screen w-full overflow-hidden bg-[#050B14] flex items-center justify-center relative text-white px-6 py-6">

      {/* TOP LINE */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

      {/* GLOW EFFECTS */}
      <div className="absolute top-[-120px] left-[-120px] w-[350px] h-[350px] bg-violet-500/20 blur-[140px] rounded-full" />

      <div className="absolute bottom-[-120px] right-[-120px] w-[350px] h-[350px] bg-cyan-500/10 blur-[140px] rounded-full" />

      {/* GRID */}
      <div
        className="
        absolute inset-0 opacity-[0.04]
        bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]
        bg-[size:74px_74px]
      "
      />

      {/* LOGIN CARD */}
      <div
        className="
        relative z-10
        w-full max-w-[500px]
        rounded-[44px]
        border border-white/10
        bg-[#08111D]/90
        backdrop-blur-2xl
        px-10
        py-8
        shadow-[0_0_80px_rgba(0,0,0,0.45)]
      "
      >

        {/* CARD SHINE */}
        <div className="absolute inset-0 rounded-[44px] bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />

        {/* LOGO */}
        <div className="text-center relative z-10">

          <h1 className="text-[42px] font-black tracking-[-2px] leading-none">
            Fidus{" "}
            <span className="text-violet-400">
              India
            </span>
          </h1>

          <p className="text-gray-500 mt-3 text-[13px]">
            AI Workflow Management Platform
          </p>

        </div>

        {/* WELCOME */}
        <div className="text-center mt-8 mb-7 relative z-10">

          <h2 className="text-[38px] font-bold tracking-[-1px] leading-none">
            Welcome Back
          </h2>

          <p className="text-gray-400 text-[15px] mt-3">
            Sign in to continue workflow monitoring
          </p>

        </div>

        {/* ROLE SWITCH */}
        <div className="relative z-10 flex items-center bg-white/[0.04] border border-white/10 rounded-[22px] p-[5px] mb-7">

          {/* ADMIN */}
          <button
            onClick={() => setRole("admin")}
            className={`flex-1 py-[14px] rounded-[18px] text-[15px] font-medium transition-all duration-300 ${
              role === "admin"
                ? "bg-violet-500 text-white shadow-[0_0_25px_rgba(139,92,246,0.45)]"
                : "text-gray-400 hover:text-white"
            }`}
          >

            <div className="flex items-center justify-center gap-2">

              <ShieldCheck size={17} />

              Admin

            </div>

          </button>

          {/* EMPLOYEE */}
          <button
            onClick={() => setRole("employee")}
            className={`flex-1 py-[14px] rounded-[18px] text-[15px] font-medium transition-all duration-300 ${
              role === "employee"
                ? "bg-violet-500 text-white shadow-[0_0_25px_rgba(139,92,246,0.45)]"
                : "text-gray-400 hover:text-white"
            }`}
          >

            <div className="flex items-center justify-center gap-2">

              <Users size={17} />

              Employee

            </div>

          </button>

        </div>

        {/* EMAIL */}
        <div className="mb-4 relative z-10">

          <label className="text-[13px] text-gray-400">
            Email Address
          </label>

          <div className="mt-2 flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-[18px] px-5 py-3 focus-within:border-violet-500 transition-all duration-300">

            <Mail size={17} className="text-gray-400" />

            <input
              type="email"
              placeholder="you@fidusindia.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-transparent outline-none w-full text-[14px] placeholder:text-gray-500"
            />

          </div>

        </div>

        {/* PASSWORD */}
        <div className="relative z-10">

          <label className="text-[13px] text-gray-400">
            Password
          </label>

          <div className="mt-2 flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-[18px] px-5 py-3 focus-within:border-violet-500 transition-all duration-300">

            <LockKeyhole size={17} className="text-gray-400" />

            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-transparent outline-none w-full text-[14px] placeholder:text-gray-500"
            />

          </div>

        </div>

        {/* FORGOT PASSWORD */}
        <div className="flex justify-end mt-4 mb-7 relative z-10">

          <button className="text-violet-400 text-[13px] hover:text-violet-300 transition-all duration-300">
            Forgot Password?
          </button>

        </div>

        {/* LOGIN BUTTON */}
        <button
          onClick={handleLogin}
          className="
          relative z-10
          w-full
          py-3.5
          rounded-[22px]
          bg-violet-500
          hover:bg-violet-400
          text-[22px]
          font-bold
          transition-all duration-300
          shadow-[0_0_35px_rgba(139,92,246,0.35)]
          hover:scale-[1.01]
        "
        >

          Sign In

        </button>

        {/* FOOTER */}
        <p className="text-center text-gray-500 text-[12px] mt-7 leading-5 relative z-10">

          Secure enterprise workflow access for authorized employees

        </p>

      </div>

    </div>

  );
}