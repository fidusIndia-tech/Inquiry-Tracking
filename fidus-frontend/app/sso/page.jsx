"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

export default function SsoPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("Missing SSO token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Sign-in failed.");

        const user = data.user;
        // Match the existing login session shape so the dashboards work as-is.
        localStorage.setItem("role", user.role);
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userName", user.name);

        router.replace(user.role === "admin" ? "/admin-dashboard" : "/employee-dashboard");
      } catch (err) {
        setError(err.message || "Sign-in failed.");
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <ShieldAlert className="text-rose-500" size={32} />
          <p className="text-[15px] font-medium text-slate-800">{error}</p>
          <a
            href={(process.env.NEXT_PUBLIC_PORTAL_URL || "https://joyful-solace-production-f214.up.railway.app").replace(/\/$/, "") + "/login"}
            className="text-sm text-blue-600 underline"
          >
            Return to FidusSource sign-in
          </a>
        </>
      ) : (
        <>
          <Loader2 className="animate-spin text-blue-500" size={28} />
          <p className="text-[15px] text-slate-600">Signing you in…</p>
        </>
      )}
    </main>
  );
}
