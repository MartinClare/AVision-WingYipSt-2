import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ONLINE_THRESHOLD_MS, shouldDisplayEdgeCamera } from "@/lib/camera-status";

const CATEGORY_MAP: Record<string, { categoryKey: string; icon: string }> = {
  ppe_violation: { categoryKey: "PPE", icon: "🪖" },
  fall_risk: { categoryKey: "Height", icon: "🪜" },
  machinery_hazard: { categoryKey: "Machinery", icon: "⚙️" },
  restricted_zone_entry: { categoryKey: "Security", icon: "🔒" },
  fire_detected: { categoryKey: "Fire", icon: "🔥" },
  smoke_detected: { categoryKey: "Fire", icon: "🔥" },
  near_miss: { categoryKey: "Height", icon: "🪜" },
  smoking: { categoryKey: "Fire", icon: "🔥" },
};

function isKnownFireFalsePositiveCamera(cameraName: string): boolean {
  return /lan_cam_04/i.test(cameraName);
}


export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const [incidents, metrics, cameras, recentIncidents] = await Promise.all([
    prisma.incident.findMany({
      where: { OR: [{ notes: null }, { notes: { not: "__test__" } }] },
      include: { camera: { select: { name: true } } },
    }),
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
      take: 80,
      orderBy: { detectedAt: "desc" },
      include: { camera: { select: { name: true } } },
    }),
  ]);

  const now = Date.now();
  const edgeDevices = cameras
    .filter(shouldDisplayEdgeCamera)
    .map((cam) => ({
      id: cam.id,
      name: cam.name,
      edgeCameraId: cam.edgeCameraId,
      status: cam.status,
      lastReportAt: cam.lastReportAt?.toISOString() ?? null,
      isOnline:
        cam.status !== "maintenance" &&
        cam.lastReportAt != null &&
        now - cam.lastReportAt.getTime() < ONLINE_THRESHOLD_MS,
      latestRiskLevel: cam.edgeReports[0]?.overallRiskLevel ?? null,
      latestDescription: cam.edgeReports[0]?.overallDescription ?? null,
    }));

  const edgeOnline = edgeDevices.filter((d) => d.isOnline).length;
  const openIncidents = incidents.filter((i) => i.status === "open" || i.status === "acknowledged").length;
  const highCriticalRisk = incidents.filter(
    (i) => i.riskLevel === "high" || i.riskLevel === "critical"
  ).length;
  const avgResponseTime =
    metrics.length > 0
      ? metrics.reduce((acc, m) => acc + m.avgResponseTime, 0) / metrics.length
      : 0;

  const categoryMeta: Record<string, { icon: string }> = {};
  for (const [, { categoryKey, icon }] of Object.entries(CATEGORY_MAP)) {
    if (!categoryMeta[categoryKey]) categoryMeta[categoryKey] = { icon };
  }

  const riskCategories = Object.entries(categoryMeta).map(([categoryKey, { icon }]) => {
    const typesInCategory = Object.entries(CATEGORY_MAP)
      .filter(([, meta]) => meta.categoryKey === categoryKey)
      .map(([type]) => type);
    const categoryIncidents = incidents.filter((i) => {
      if (!typesInCategory.includes(i.type)) return false;
      // Keep known fire FP camera noise out of the Fire category card.
      if (
        categoryKey === "Fire" &&
        (i.type === "fire_detected" || i.type === "smoke_detected") &&
        isKnownFireFalsePositiveCamera(i.camera?.name ?? "")
      ) {
        return false;
      }
      return true;
    });
    const openCount = categoryIncidents.filter((i) => i.status === "open" || i.status === "acknowledged").length;
    const latest = [...categoryIncidents].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    )[0];
    return {
      categoryKey,
      icon,
      openCount,
      latestRisk: latest?.riskLevel ?? null,
      latestSummary: latest?.reasoning ?? null,
    };
  });

  return NextResponse.json({
    kpis: {
      edgeOnline,
      edgeTotal: edgeDevices.length,
      openIncidents,
      highCriticalRisk,
      avgResponseTime,
    },
    edgeDevices,
    riskCategories,
    recentAlerts: recentIncidents
      .filter(
        (i) =>
          !(
            (i.type === "fire_detected" || i.type === "smoke_detected") &&
            isKnownFireFalsePositiveCamera(i.camera.name)
          )
      )
      .slice(0, 20)
      .map((i) => ({
      id: i.id,
      type: i.type,
      riskLevel: i.riskLevel,
      status: i.status,
      cameraName: i.camera.name,
      detectedAt: i.detectedAt.toISOString(),
    })),
  });
}
