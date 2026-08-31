import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ACCESS_COOKIE, sessionIsValid } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Local development is intentionally frictionless when no shared-password
  // secrets are configured. Production still fails closed because NODE_ENV is
  // set to "production" by the Vercel build.
  const protectionConfigured = Boolean(process.env.PITCHQUERY_PASSWORD && process.env.PITCHQUERY_SESSION_TOKEN);
  if (process.env.NODE_ENV !== "production" && !protectionConfigured) return NextResponse.next();

  const session = request.cookies.get(ACCESS_COOKIE)?.value;
  if (sessionIsValid(session)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ detail: "Password required." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
