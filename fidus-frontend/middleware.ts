import { NextRequest, NextResponse } from "next/server";

const BASE_PATH = "/dashboard/apps/inquiry-tracker/proxy";
const DIRECT_ACCESS_REDIRECT =
  process.env.DIRECT_ACCESS_REDIRECT_URL ||
  "https://fidussource.com/dashboard/apps/inquiry-tracker";

export function middleware(req: NextRequest) {
  // Allow requests that are already under the proxy basePath.
  if (req.nextUrl.pathname.startsWith(BASE_PATH)) {
    return NextResponse.next();
  }
  // Everything else is a direct Railway-URL visit — send to FidusSource.
  return NextResponse.redirect(DIRECT_ACCESS_REDIRECT, { status: 302 });
}

export const config = {
  // Run on all paths except Next.js internals and common static files.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt).*)"],
};
