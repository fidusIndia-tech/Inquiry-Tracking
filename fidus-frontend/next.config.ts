import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All pages, API routes, and _next/ assets are served under this prefix so
  // the FidusSource reverse proxy can forward them at the correct path without
  // needing to rewrite HTML/JS content. Direct Railway-URL visits are caught by
  // middleware.ts and redirected to fidussource.com before any page renders.
  basePath: "/dashboard/apps/inquiry-tracker/proxy",
};

export default nextConfig;
