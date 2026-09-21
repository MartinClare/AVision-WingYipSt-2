import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { applyMobileCors } from "@/lib/mobile-cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Mobile / Expo-web proxy for go2rtc JPEG frames.
 *
 * Default: binary JPEG
 * ?format=json → { data: { contentType, base64 } } for reliable browser fetch
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return applyMobileCors(
      request,
      NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    );
  }

  const src = request.nextUrl.searchParams.get("src")?.trim();
  if (!src) {
    return applyMobileCors(
      request,
      NextResponse.json({ message: "src required" }, { status: 400 })
    );
  }

  const asJson = request.nextUrl.searchParams.get("format") === "json";
  const go2rtc = (process.env.GO2RTC_URL || "http://127.0.0.1:3184").replace(/\/+$/, "");
  const url = `${go2rtc}/api/frame.jpeg?src=${encodeURIComponent(src)}`;

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) {
      return applyMobileCors(
        request,
        NextResponse.json({ message: "Upstream error" }, { status: 502 })
      );
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    // go2rtc often returns HTTP 200 with an empty body when the RTSP camera is unreachable.
    if (buf.length < 500 || !contentType.includes("image")) {
      return applyMobileCors(
        request,
        NextResponse.json(
          {
            message:
              "Camera stream unavailable (empty frame). Check RTSP camera power/network from CMP host.",
          },
          { status: 502 }
        )
      );
    }

    if (asJson) {
      return applyMobileCors(
        request,
        NextResponse.json({
          data: {
            contentType,
            base64: buf.toString("base64"),
            bytes: buf.length,
          },
        })
      );
    }

    return applyMobileCors(
      request,
      new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      })
    );
  } catch {
    return applyMobileCors(
      request,
      NextResponse.json({ message: "Stream unavailable" }, { status: 502 })
    );
  }
}
