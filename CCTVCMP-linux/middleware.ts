import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/constants";
import { applyMobileCors, handleMobileCorsPreflight, shouldApplyMobileCors } from "@/lib/mobile-cors";
import { getRequiredRoles, hasRoleAccess } from "@/lib/rbac";

const authRoutes = ["/signin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const preflight = handleMobileCorsPreflight(request);
  if (preflight) return preflight;

  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/webhook")) {
    return NextResponse.next();
  }

  const required = getRequiredRoles(pathname);
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const token = cookieToken || bearerToken;

  if (!required && authRoutes.includes(pathname) && cookieToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!required) {
    const response = NextResponse.next();
    if (shouldApplyMobileCors(pathname)) return applyMobileCors(request, response);
    return response;
  }

  if (!token) {
    if (pathname.startsWith("/api")) {
      const response = NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      if (shouldApplyMobileCors(pathname)) return applyMobileCors(request, response);
      return response;
    }
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  try {
    const payload = await verifyToken(token);
    if (!hasRoleAccess(payload.role, required)) {
      if (pathname.startsWith("/api")) {
        const response = NextResponse.json({ message: "Forbidden" }, { status: 403 });
        if (shouldApplyMobileCors(pathname)) return applyMobileCors(request, response);
        return response;
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch {
    if (pathname.startsWith("/api")) {
      const response = NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      if (shouldApplyMobileCors(pathname)) return applyMobileCors(request, response);
      return response;
    }
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const response = NextResponse.next();
  const localeCookie = request.cookies.get("cmp-locale")?.value;
  if (localeCookie) {
    response.headers.set("x-cmp-locale", localeCookie);
  }
  if (shouldApplyMobileCors(pathname)) return applyMobileCors(request, response);
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/edge-devices/:path*",
    "/incidents/:path*",
    "/analytics/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/tower-crane/:path*",
    "/modules/:path*",
    "/signin",
    "/signup",
    "/api/:path*",
  ],
};
