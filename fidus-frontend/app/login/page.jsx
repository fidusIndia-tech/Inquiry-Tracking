"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { users } from "@/data/users";

import {
  ShieldCheck,
  Users,
  Mail,
  LockKeyhole,
} from "lucide-react";

export default function LoginPage() {

  const router = useRouter();

  const [role, setRole] = useState("admin");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const handleLogin = () => {

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      alert("Please fill all fields");
      return;
    }

    const matchedUser = users.find(
      (user) =>
        user.email.toLowerCase() === normalizedEmail &&
        user.password === normalizedPassword &&
        user.role === role
    );

    if (matchedUser) {

      localStorage.setItem("role", matchedUser.role);
      localStorage.setItem("userId", matchedUser.id);
      localStorage.setItem("userName", matchedUser.name);

      router.push(
        matchedUser.role === "admin"
          ? "/admin-dashboard"
          : "/employee-dashboard"
      );

      return;
    }

    /* ================= INVALID ================= */

    alert("Invalid Credentials");
  };

  return (

    <div className="h-screen w-full overflow-hidden bg-[#f7f7f7] flex items-center justify-center relative text-neutral-950 px-6 py-6">

      {/* TOP LINE */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-orange-500/70 to-transparent" />

      {/* GRID */}
      <div
        className="
        absolute inset-0 opacity-[0.35]
        bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)]
        bg-[size:74px_74px]
      "
      />

      {/* LOGIN CARD */}
      <div
        className="
        relative z-10
        w-full max-w-[500px]
        rounded-[44px]
        border border-neutral-200
        bg-white
        backdrop-blur-2xl
        px-10
        py-8
        shadow-xl shadow-neutral-200/70
      "
      >

        {/* CARD SHINE */}
        <div className="absolute inset-0 rounded-[44px] bg-gradient-to-b from-orange-50/70 to-transparent pointer-events-none" />

        {/* LOGO */}
        <div className="text-center relative z-10">

          <h1 className="text-[42px] font-black tracking-[-2px] leading-none">
            FIAPL{" "}
            <span className="text-orange-500">
              Automation
            </span>
          </h1>

          <p className="text-neutral-500 mt-3 text-[13px]">
            Fidus India Automation Pvt. Ltd.
          </p>

        </div>

        {/* WELCOME */}
        <div className="text-center mt-8 mb-7 relative z-10">

          <h2 className="text-[38px] font-bold tracking-[-1px] leading-none">
            Welcome Back
          </h2>

          <p className="text-neutral-500 text-[15px] mt-3">
            Sign in to continue workflow monitoring
          </p>

        </div>

        {/* ROLE SWITCH */}
        <div className="relative z-10 flex items-center bg-[#fafafa] border border-neutral-200 rounded-[22px] p-[5px] mb-7">

          {/* ADMIN */}
          <button
            onClick={() => setRole("admin")}
            className={`flex-1 py-[14px] rounded-[18px] text-[15px] font-medium transition-all duration-300 ${
              role === "admin"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-950"
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
                ? "bg-orange-500 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-950"
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

          <label className="text-[13px] text-neutral-500">
            Email Address
          </label>

          <div className="mt-2 flex items-center gap-3 bg-[#fafafa] border border-neutral-200 rounded-[18px] px-5 py-3 focus-within:border-orange-500 transition-all duration-300">

            <Mail size={17} className="text-neutral-500" />

            <input
              type="email"
              placeholder="you@fidus.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-transparent outline-none w-full text-[14px] placeholder:text-neutral-400"
            />

          </div>

        </div>

        {/* PASSWORD */}
        <div className="relative z-10">

          <label className="text-[13px] text-neutral-500">
            Password
          </label>

          <div className="mt-2 flex items-center gap-3 bg-[#fafafa] border border-neutral-200 rounded-[18px] px-5 py-3 focus-within:border-orange-500 transition-all duration-300">

            <LockKeyhole size={17} className="text-neutral-500" />

            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-transparent outline-none w-full text-[14px] placeholder:text-neutral-400"
            />

          </div>

        </div>

        {/* FORGOT PASSWORD */}
        <div className="flex justify-end mt-4 mb-7 relative z-10">

          <button className="text-orange-400 text-[13px] hover:text-orange-300 transition-all duration-300">
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
          bg-orange-500
          hover:bg-orange-400
          text-[22px]
          font-bold
          transition-all duration-300
          shadow-sm
          hover:scale-[1.01]
        "
        >

          Sign In

        </button>

        {/* FOOTER */}
        <p className="text-center text-neutral-500 text-[12px] mt-7 leading-5 relative z-10">

          Secure enterprise workflow access for authorized employees

        </p>

      </div>

    </div>

  );
}
