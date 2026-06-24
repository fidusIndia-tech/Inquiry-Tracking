import { NextRequest, NextResponse } from "next/server";

// The basePath in next.config.ts ('/dashboard/apps/inquiry-tracker/proxy')
// already prevents Next.js from serving any page at the Railway root URL —
// direct visits to inquiry.railway.app/ get a 404 rather than the app.
// No middleware redirect is needed; pass all requests through to routing.
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
