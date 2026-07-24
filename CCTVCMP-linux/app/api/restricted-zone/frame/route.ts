import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Authenticated proxy for go2rtc JPEG frames (avoids rewrite/header issues). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const src = request.nextUrl.searchParams.get("src")?.trim();
  if (!src) return NextResponse.json({ message: "src required" }, { status: 400 });

  const origin = (process.env.GO2RTC_URL || "http://127.0.0.1:3184").replace(/\/+$/, "");
  const url = `${origin}/api/frame.jpeg?src=${encodeURIComponent(src)}`;

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ message: "Upstream error" }, { status: 502 });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ message: "Stream unavailable" }, { status: 502 });
  }
}
