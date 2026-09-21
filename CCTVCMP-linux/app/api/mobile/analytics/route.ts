import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { fetchAnalyticsSnapshot } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const snapshot = await fetchAnalyticsSnapshot({ projectId });

  const riskPie = {
    high: snapshot.trend.reduce((acc, d) => acc + d.highRisk, 0),
    medium: snapshot.trend.reduce((acc, d) => acc + d.mediumRisk, 0),
    low: snapshot.trend.reduce((acc, d) => acc + d.lowRisk, 0),
  };

  return NextResponse.json({
    data: {
      ...snapshot,
      riskPie,
    },
  });
}
