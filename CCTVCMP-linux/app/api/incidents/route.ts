import { NextRequest, NextResponse } from "next/server";
import type { IncidentRiskLevel, IncidentStatus } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { dispatchMobilePush } from "@/lib/mobile-push/dispatch";
import { dispatchNotifications } from "@/lib/notifications/dispatcher";
import { prisma } from "@/lib/prisma";
import { listIncidentsPage } from "@/lib/incidents-list";
import { isRiskCategoryKey, typesForCategory } from "@/lib/incident-categories";
import { createIncidentSchema } from "@/lib/validations/incidents";

const VALID_STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved", "dismissed", "record_only"];
const VALID_RISKS: IncidentRiskLevel[] = ["low", "medium", "high", "critical"];

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const cursor = sp.get("cursor");
  const offsetRaw = sp.get("offset");
  const limitRaw = sp.get("limit");
  const statusParam = sp.get("status") ?? undefined;
  const riskParam = sp.get("riskLevel") ?? undefined;
  const categoryParam = sp.get("category") ?? undefined;

  const categoryFilter = isRiskCategoryKey(categoryParam) ? categoryParam : null;
  const categoryTypes = categoryFilter ? typesForCategory(categoryFilter) : null;

  const statusFilter = statusParam
    ?.split(",")
    .filter((s): s is IncidentStatus => VALID_STATUSES.includes(s as IncidentStatus));

  const riskFilter = riskParam
    ?.split(",")
    .filter((r): r is IncidentRiskLevel => VALID_RISKS.includes(r as IncidentRiskLevel));

  const page = await listIncidentsPage({
    cursor,
    offset: offsetRaw != null && Number.isFinite(Number(offsetRaw)) ? Number(offsetRaw) : null,
    limit: limitRaw != null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 20,
    statusFilter,
    riskFilter,
    categoryTypes,
  });

  return NextResponse.json({ data: page });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.flatten() }, { status: 400 });

  const incident = await prisma.incident.create({
    data: {
      ...parsed.data,
      status: "open",
      logs: { create: { userId: user.id, action: "created" } },
    },
    include: {
      project: { select: { id: true, name: true } },
      camera: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      logs: true,
    },
  });

  dispatchNotifications(incident).catch((err) =>
    console.error("[Incidents] Notification dispatch error:", err)
  );
  dispatchMobilePush(incident).catch((err) =>
    console.error("[Incidents] Mobile push dispatch error:", err)
  );

  return NextResponse.json({ data: incident }, { status: 201 });
}
