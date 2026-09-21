import { prisma } from "@/lib/prisma";
import {
  INCIDENT_CATEGORY_MAP,
  RISK_CATEGORY_ICONS,
  type RiskCategoryKey,
} from "@/lib/incident-categories";
import { listEdgeDevicesPage, type EdgeDeviceListItem } from "@/lib/edge-devices-list";
import { listIncidentsPage, type IncidentListItem } from "@/lib/incidents-list";

const notTestNotes = {
  OR: [{ notes: null }, { notes: { not: "__test__" } }],
} as const;

export type DashboardEdgeTile = {
  id: string;
  name: string;
  edgeCameraId: string | null;
  streamUrl: string | null;
  status: string;
  lastReportAt: string | null;
  isOnline: boolean;
  latestRiskLevel: string | null;
  latestDescription: string | null;
};

export type DashboardRiskCategory = {
  categoryKey: RiskCategoryKey;
  icon: string;
  openCount: number;
  latestRisk: string | null;
  latestSummary: string | null;
};

export type DashboardIncidentSummary = {
  openIncidents: number;
  highCriticalRisk: number;
  avgResponseTime: number;
  riskCategories: DashboardRiskCategory[];
};

function toEdgeTile(d: EdgeDeviceListItem): DashboardEdgeTile {
  return {
    id: d.id,
    name: d.name,
    edgeCameraId: d.edgeCameraId,
    streamUrl: d.streamUrl,
    status: d.status,
    lastReportAt: d.lastReportAt,
    isOnline: d.isOnline,
    latestRiskLevel: d.latestReport?.overallRiskLevel ?? null,
    latestDescription: d.latestReport?.overallDescription ?? null,
  };
}

export function toAlertItem(i: IncidentListItem) {
  return {
    id: i.id,
    type: i.type,
    riskLevel: i.riskLevel,
    status: i.status,
    cameraName: i.camera.name,
    detectedAt: i.detectedAt,
  };
}

/** Incident KPIs + risk categories via counts — never loads the full incident table. */
export async function getDashboardIncidentSummary(): Promise<DashboardIncidentSummary> {
  const [openIncidents, highCriticalRisk, metrics, openByType, recentForLatest] =
    await Promise.all([
      prisma.incident.count({
        where: { ...notTestNotes, status: "open" },
      }),
      prisma.incident.count({
        where: {
          ...notTestNotes,
          riskLevel: { in: ["high", "critical"] },
        },
      }),
      prisma.dailyMetric.findMany({ orderBy: { date: "desc" }, take: 14 }),
      prisma.incident.groupBy({
        by: ["type"],
        where: { ...notTestNotes, status: "open" },
        _count: { _all: true },
      }),
      prisma.incident.findMany({
        where: notTestNotes,
        orderBy: { detectedAt: "desc" },
        take: 80,
        select: { type: true, riskLevel: true, reasoning: true, detectedAt: true },
      }),
    ]);

  const avgResponseTime =
    metrics.length > 0
      ? metrics.reduce((acc, m) => acc + m.avgResponseTime, 0) / metrics.length
      : 0;

  const openCountByType = new Map(
    openByType.map((r) => [String(r.type), r._count._all] as const)
  );

  const categoryKeys = Object.keys(RISK_CATEGORY_ICONS) as RiskCategoryKey[];
  const riskCategories: DashboardRiskCategory[] = categoryKeys.map((categoryKey) => {
    const typesInCategory = Object.entries(INCIDENT_CATEGORY_MAP)
      .filter(([, cat]) => cat === categoryKey)
      .map(([type]) => type);

    const openCount = typesInCategory.reduce(
      (sum, type) => sum + (openCountByType.get(type) ?? 0),
      0
    );

    const latest = recentForLatest.find((i) => typesInCategory.includes(i.type));

    return {
      categoryKey,
      icon: RISK_CATEGORY_ICONS[categoryKey],
      openCount,
      latestRisk: latest?.riskLevel ?? null,
      latestSummary: latest?.reasoning ?? null,
    };
  });

  return {
    openIncidents,
    highCriticalRisk,
    avgResponseTime,
    riskCategories,
  };
}

/** @deprecated use getDashboardIncidentSummary + getDashboardEdgePage */
export async function getDashboardSummary() {
  const [incidentSummary, edgePage] = await Promise.all([
    getDashboardIncidentSummary(),
    listEdgeDevicesPage({ offset: 0, limit: 1 }),
  ]);
  return {
    edgeOnline: edgePage.onlineCount,
    edgeTotal: edgePage.total,
    ...incidentSummary,
  };
}

export async function getDashboardEdgePage(offset = 0, limit = 12) {
  const page = await listEdgeDevicesPage({ offset, limit });
  return {
    devices: page.devices.map(toEdgeTile),
    nextOffset: page.nextOffset,
    onlineCount: page.onlineCount,
    total: page.total,
  };
}

export async function getDashboardAlertsPage(cursor?: string | null, limit = 20, offset?: number | null) {
  const page = await listIncidentsPage({ cursor, limit, offset });
  return {
    incidents: page.incidents.map(toAlertItem),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}
