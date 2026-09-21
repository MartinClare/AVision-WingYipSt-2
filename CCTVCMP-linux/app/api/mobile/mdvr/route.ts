import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { fetchTowerCraneSnapshot } from "@/lib/tower-crane";

/**
 * Mobile-friendly MDVR snapshot (tower crane + mobile machine device tree).
 * Same payload as /api/tower-crane, under /api/mobile so browser CORS applies.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const snapshot = await fetchTowerCraneSnapshot();
  return NextResponse.json({ data: snapshot });
}
