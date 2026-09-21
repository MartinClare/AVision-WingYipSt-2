import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { applyMobileCors } from "@/lib/mobile-cors";
import { RESTRICTED_ZONE_CAMERAS } from "@/lib/restricted-zone";

/** Mobile camera list — same config as CMP restricted-zone page. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return applyMobileCors(
      request,
      NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    );
  }

  return applyMobileCors(
    request,
    NextResponse.json({ data: RESTRICTED_ZONE_CAMERAS })
  );
}
