import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { fetchTowerCraneRecordings } from "@/lib/tower-crane";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const deviceId = sp.get("deviceId")?.trim() || "";
  const date = sp.get("date")?.trim() || "";
  const locRaw = Number(sp.get("loc") ?? "1");
  const loc: 1 | 2 = locRaw === 2 ? 2 : 1;
  const channelRaw = sp.get("channel");
  const channel = channelRaw == null || channelRaw === "" ? -1 : Number(channelRaw);

  if (!deviceId) {
    return NextResponse.json({ message: "deviceId is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ message: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!Number.isFinite(channel)) {
    return NextResponse.json({ message: "channel must be a number" }, { status: 400 });
  }

  const data = await fetchTowerCraneRecordings({ deviceId, date, loc, channel });
  return NextResponse.json({ data });
}
