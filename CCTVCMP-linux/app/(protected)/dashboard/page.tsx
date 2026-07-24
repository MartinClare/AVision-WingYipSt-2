import { prisma } from "@/lib/prisma";
import { KpiCards } from "@/components/kpi-cards";
import { EdgeStatusPanel } from "@/components/dashboard/edge-status-panel";
import { RiskBreakdown } from "@/components/dashboard/risk-breakdown";
import { AlertFeed } from "@/components/dashboard/alert-feed";
import { AutoRefresh } from "@/components/auto-refresh";
import { ONLINE_THRESHOLD_MS, shouldDisplayEdgeCamera, sortByFloor } from "@/lib/camera-status";
import {
  INCIDENT_CATEGORY_MAP,
  RISK_CATEGORY_ICONS,
  type RiskCategoryKey,
} from "@/lib/incident-categories";
import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const [incidents, metrics, cameras, recentIncidents] = await Promise.all([
    prisma.incident.findMany({ where: { OR: [{ notes: null }, { notes: { not: "__test__" } }] } }),
    prisma.dailyMetric.findMany({ orderBy: { date: "desc" }, take: 14 }),
    prisma.camera.findMany({
      include: {
        edgeReports: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: {
            messageType: true,
            keepalive: true,
            overallRiskLevel: true,
            overallDescription: true,
            receivedAt: true,
          },
        },
      },
    }),
    prisma.incident.findMany({
      where: { OR: [{ notes: null }, { notes: { not: "__test__" } }] },
      take: 20,
      orderBy: { detectedAt: "desc" },
      include: { camera: { select: { name: true } } },
    }),
  ]);

  const now = Date.now();
  type CameraWithLatestReport = (typeof cameras)[number];
  type IncidentRow = (typeof incidents)[number];
  type MetricRow = (typeof metrics)[number];
  type EdgeDevice = {
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
  const edgeDevices: EdgeDevice[] = sortByFloor(cameras
    .filter(shouldDisplayEdgeCamera)
    .map((cam: CameraWithLatestReport) => ({
      id: cam.id,
      name: cam.name,
      edgeCameraId: cam.edgeCameraId,
      streamUrl: cam.streamUrl,
      status: cam.status,
      lastReportAt: cam.lastReportAt?.toISOString() ?? null,
      isOnline:
        cam.status !== "maintenance" &&
        cam.lastReportAt != null &&
        now - cam.lastReportAt.getTime() < ONLINE_THRESHOLD_MS,
      latestRiskLevel: cam.edgeReports[0]?.overallRiskLevel ?? null,
      latestDescription: cam.edgeReports[0]?.overallDescription ?? null,
    })));

  const edgeOnline = edgeDevices.filter((d: EdgeDevice) => d.isOnline).length;
  const openIncidents = incidents.filter((i: IncidentRow) => i.status === "open").length;
  const highCriticalRisk = incidents.filter(
    (i: IncidentRow) => i.riskLevel === "high" || i.riskLevel === "critical"
  ).length;
  const avgResponseTime =
    metrics.length > 0
      ? metrics.reduce((acc: number, m: MetricRow) => acc + m.avgResponseTime, 0) / metrics.length
      : 0;

  const categoryMeta: Record<RiskCategoryKey, { icon: string }> = {
    PPE: { icon: RISK_CATEGORY_ICONS.PPE },
    Height: { icon: RISK_CATEGORY_ICONS.Height },
    Machinery: { icon: RISK_CATEGORY_ICONS.Machinery },
    Fire: { icon: RISK_CATEGORY_ICONS.Fire },
    Security: { icon: RISK_CATEGORY_ICONS.Security },
  };
  const riskCategories = (Object.keys(categoryMeta) as RiskCategoryKey[]).map((categoryKey) => {
    const typesInCategory = Object.entries(INCIDENT_CATEGORY_MAP)
      .filter(([, cat]) => cat === categoryKey)
      .map(([type]) => type);
    const categoryIncidents = incidents.filter((i: IncidentRow) => typesInCategory.includes(i.type));
    const openCount = categoryIncidents.filter((i: IncidentRow) => i.status === "open").length;
    const latest = categoryIncidents.sort(
      (a: IncidentRow, b: IncidentRow) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    )[0];
    return {
      categoryKey,
      category: t(`categories.${categoryKey}`),
      icon: categoryMeta[categoryKey].icon,
      openCount,
      latestRisk: latest?.riskLevel ?? null,
      latestSummary: latest?.reasoning ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <AutoRefresh intervalSec={10} />
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <KpiCards
        edgeOnline={edgeOnline}
        edgeTotal={edgeDevices.length}
        openIncidents={openIncidents}
        highCriticalRisk={highCriticalRisk}
        avgResponseTime={avgResponseTime}
      />
      <EdgeStatusPanel devices={edgeDevices} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RiskBreakdown categories={riskCategories} />
        <AlertFeed
          incidents={recentIncidents.map((i: (typeof recentIncidents)[number]) => ({
            id: i.id,
            type: i.type,
            riskLevel: i.riskLevel,
            status: i.status,
            cameraName: i.camera.name,
            detectedAt: i.detectedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
