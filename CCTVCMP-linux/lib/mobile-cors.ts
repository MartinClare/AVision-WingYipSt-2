import { NextRequest, NextResponse } from "next/server";

const MOBILE_API_PREFIX = "/api/mobile";
const IMAGE_PATH = /^\/api\/edge-reports\/[^/]+\/image$/;
const SNAPSHOT_PATH = /^\/api\/edge-devices\/[^/]+\/snapshot$/;
const RESTRICTED_ZONE_FRAME_PATH = /^\/api\/restricted-zone\/frame$/;

function isMobileCorsPath(pathname: string) {
  return (
    pathname.startsWith(MOBILE_API_PREFIX) ||
    IMAGE_PATH.test(pathname) ||
    SNAPSHOT_PATH.test(pathname) ||
    RESTRICTED_ZONE_FRAME_PATH.test(pathname)
  );
}

/** Expo web may use localhost or a LAN IP (e.g. http://192.168.x.x:8081). */
function isAllowedOrigin(origin: string) {
  const configured = process.env.MOBILE_WEB_ORIGINS?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  if (configured.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // RFC1918 private LAN — common when Expo prints the network URL
  if (
    /^https?:\/\/(192\.168(?:\.\d+){2}|10(?:\.\d+){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d+){2})(:\d+)?$/.test(
      origin
    )
  ) {
    return true;
  }
  return false;
}

function corsHeaders(origin: string | null) {
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    // Include Cache-Control / Accept — Expo web RZ frames send these and
    // browsers preflight-fail if they are omitted from Allow-Headers.
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-cmp-locale, Cache-Control, Accept, Pragma",
    "Access-Control-Max-Age": "86400",
  };
}

export function applyMobileCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function handleMobileCorsPreflight(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.method !== "OPTIONS" || !isMobileCorsPath(pathname)) return null;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  if (!Object.keys(headers).length) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export function shouldApplyMobileCors(pathname: string) {
  return isMobileCorsPath(pathname);
}
