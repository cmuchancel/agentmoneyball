import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, passwordIsValid, safeReturnTo } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!process.env.PITCHQUERY_PASSWORD || !process.env.PITCHQUERY_SESSION_TOKEN) {
    return NextResponse.json({ detail: "Password protection is not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnTo(String(form.get("next") ?? "/"));
  if (!passwordIsValid(password)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "1");
    login.searchParams.set("next", returnTo);
    return NextResponse.redirect(login, 303);
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, process.env.PITCHQUERY_SESSION_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    priority: "high",
  });
  return response;
}
