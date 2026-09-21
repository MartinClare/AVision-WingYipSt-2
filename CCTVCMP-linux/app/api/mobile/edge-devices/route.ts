import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSyntheticEdgeCamera, ONLINE_THRESHOLD_MS } from "@/lib/camera-status";
import { resolveMobilePublicBaseUrl } from "@/lib/runtime-config";

type LatestReportRow = {
  camera_id: string;
  overall_risk_level: string | null;
  received_at: Date | null;
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const publicBaseUrl = await resolveMobilePublicBaseUrl(request.url);

  const [cameras, latestReports] = await Promise.all([
    prisma.camera.findMany({
      select: {
        id: true,
        name: true,
        edgeCameraId: true,
        status: true,
        lastReportAt: true,
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Latest report per camera via LATERAL: one index lookup per camera
    // instead of a whole-table DISTINCT ON scan (~930ms -> ~2ms).
    prisma.$queryRaw<LatestReportRow[]>`
      SELECT l.camera_id, l.overall_risk_level, l.received_at
      FROM cameras c
      CROSS JOIN LATERAL (
        SELECT e.camera_id, e.overall_risk_level, e.received_at
        FROM edge_reports e
        WHERE e.camera_id = c.id
        ORDER BY e.received_at DESC
        LIMIT 1
      ) l
    `,
  ]);

  const latestByCamera = new Map(latestReports.map((r) => [r.camera_id, r]));

  const now = Date.now();
  const devices = cameras
    .filter((camera) => !isSyntheticEdgeCamera(camera))
    .map((camera) => ({
      id: camera.id,
      name: camera.name,
      isOnline:
        camera.status !== "maintenance" &&
        camera.lastReportAt != null &&
        now - camera.lastReportAt.getTime() < ONLINE_THRESHOLD_MS,
      status: camera.status,
      lastReportAt: camera.lastReportAt,
      latestRiskLevel: latestByCamera.get(camera.id)?.overall_risk_level ?? null,
      snapshotUrl: `${publicBaseUrl}/api/edge-devices/${camera.id}/snapshot`,
      project: camera.project,
    }));

  return NextResponse.json({ devices });
}
