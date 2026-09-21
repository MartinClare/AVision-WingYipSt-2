import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  getDashboardAlertsPage,
  getDashboardEdgePage,
  getDashboardIncidentSummary,
  getDashboardSummary,
} from "@/lib/dashboard-data";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const section = sp.get("section") ?? "summary";

  if (section === "summary") {
    const summary = await getDashboardSummary();
    return NextResponse.json({ data: summary });
  }

  if (section === "devices") {
    const offset = Number(sp.get("offset") ?? "0");
    const limit = Number(sp.get("limit") ?? "12");
    const page = await getDashboardEdgePage(
      Number.isFinite(offset) ? offset : 0,
      Number.isFinite(limit) ? limit : 12
    );
    return NextResponse.json({ data: page });
  }

  if (section === "alerts") {
    const cursor = sp.get("cursor");
    const limit = Number(sp.get("limit") ?? "20");
    const offsetRaw = sp.get("offset");
    const offset = offsetRaw != null ? Number(offsetRaw) : null;
    const page = await getDashboardAlertsPage(
      cursor,
      Number.isFinite(limit) ? limit : 20,
      offset != null && Number.isFinite(offset) ? offset : null
    );
    return NextResponse.json({ data: page });
  }

  if (section === "incidents-summary") {
    const summary = await getDashboardIncidentSummary();
    return NextResponse.json({ data: summary });
  }

  return NextResponse.json({ message: "Unknown section" }, { status: 400 });
}
