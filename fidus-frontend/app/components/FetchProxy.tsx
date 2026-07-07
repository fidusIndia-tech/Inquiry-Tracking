"use client";

import { useEffect } from "react";

const BASE_PATH = "/dashboard/apps/inquiry-tracker/proxy";

// Intercept window.fetch so all client-side calls to root-relative /api/...
// paths are transparently rewritten to go through the FidusSource proxy prefix
// rather than hitting fidussource.com's own /api/... endpoint.
export default function FetchProxy() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(BASE_PATH)) return;

    const original = window.fetch;
    window.fetch = function (input, init) {
      if (typeof input === "string" && input.startsWith("/api/")) {
        input = BASE_PATH + input;
      }
      return original.call(this, input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
