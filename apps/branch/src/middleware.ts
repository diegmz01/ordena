import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_BRANCH,
  AUTH_PRESENCE_COOKIE,
} from "@ordena/shared";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token =
    request.cookies.get(AUTH_COOKIE_BRANCH)?.value?.trim() ||
    request.cookies.get(AUTH_PRESENCE_COOKIE)?.value?.trim();
  const isLogin = pathname === "/login";

  if (!token && !isLogin) {
    const next =
      pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(new URL(`/login${next}`, request.url));
  }

  if (token && isLogin) {
    const next = request.nextUrl.searchParams.get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|logos|manifest.webmanifest|sw.js|push-dev-sw.js|~partytown).*)",
  ],
};
