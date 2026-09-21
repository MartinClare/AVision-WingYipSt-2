import { prisma } from "@/lib/prisma";
import {
  ONLINE_THRESHOLD_MS,
  shouldDisplayEdgeCamera,
  sortByFloor,
} from "@/lib/camera-status";

export type EdgeDeviceListItem = {
  id: string;
  name: string;
  edgeCameraId: string | null;
  streamUrl: string | null;
  status: string;
  lastReportAt: string | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  isOnline: boolean;
  latestReport: {
    id: string;
    overallRiskLevel: string;
    overallDescription: string;
    eventImagePath: string | null;
    receivedAt: string;
  } | null;
  latestAlertEvidence: {
    id: string;
    overallRiskLevel: string;
    eventImagePath: string;
    receivedAt: string;
  } | null;
  incidentCount: number;
  reportCount: number;
};

export type EdgeDevicesPageResult = {
  devices: EdgeDeviceListItem[];
  onlineCount: number;
  total: number;
  nextOffset: number | null;
};

type RecentReport = {
  id: string;
  messageType: string;
  keepalive: boolean;
  overallRiskLevel: string;
  overallDescription: string;
  eventImagePath: string | null;
  receivedAt: Date;
};

type RecentReportRow = {
  id: string;
  camera_id: string;
  message_type: string;
  keepalive: boolean;
  overall_risk_level: string;
  overall_description: string;
  event_image_path: string | null;
  received_at: Date;
};

function mapCamera(
  cam: {
    id: string;
    name: string;
    edgeCameraId: string | null;
    streamUrl: string | null;
    status: string;
    lastReportAt: Date | null;
    createdAt: Date;
    project: { id: string; name: string } | null;
    zone: { id: string; name: string } | null;
    _count: { incidents: number; edgeReports: number };
  },
  reports: RecentReport[],
  now: number
): EdgeDeviceListItem {
  const latestReport = reports[0] ?? null;
  const latestAlertEvidence =
    reports.find(
      (r) =>
        (r.overallRiskLevel === "Medium" ||
          r.overallRiskLevel === "High" ||
          r.overallRiskLevel === "Critical") &&
        !!r.eventImagePath
    ) ?? null;

  return {
    id: cam.id,
    name: cam.name,
    edgeCameraId: cam.edgeCameraId,
    streamUrl: cam.streamUrl,
    status: cam.status,
    lastReportAt: cam.lastReportAt?.toISOString() ?? null,
    createdAt: cam.createdAt.toISOString(),
    project: cam.project,
    zone: cam.zone,
    isOnline:
      cam.status !== "maintenance" &&
      cam.status !== "degraded" &&
      cam.lastReportAt != null &&
      now - cam.lastReportAt.getTime() < ONLINE_THRESHOLD_MS,
    latestReport: latestReport
      ? {
          id: latestReport.id,
          overallRiskLevel: latestReport.overallRiskLevel,
          overallDescription: latestReport.overallDescription,
          eventImagePath: latestReport.eventImagePath,
          receivedAt: latestReport.receivedAt.toISOString(),
        }
      : null,
    latestAlertEvidence: latestAlertEvidence
      ? {
          id: latestAlertEvidence.id,
          overallRiskLevel: latestAlertEvidence.overallRiskLevel,
          eventImagePath: latestAlertEvidence.eventImagePath!,
          receivedAt: latestAlertEvidence.receivedAt.toISOString(),
        }
      : null,
    incidentCount: cam._count.incidents,
    reportCount: cam._count.edgeReports,
  };
}

/**
 * Slim camera list for the Edge Devices gallery.
 * Loads a few recent reports per camera via a LATERAL join (one index lookup
 * per camera instead of a whole-table scan), filters/sorts in memory
 * (~60 cams), then slices by offset.
 */
export async function listEdgeDevicesPage(options?: {
  offset?: number;
  limit?: number;
}): Promise<EdgeDevicesPageResult> {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(48, Math.max(1, options?.limit ?? 12));

  const [cameras, reportRows] = await Promise.all([
    prisma.camera.findMany({
      include: {
        project: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
        _count: { select: { incidents: true, edgeReports: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Latest 3 reports per camera via LATERAL (~2ms vs ~1s table scan).
    prisma.$queryRaw<RecentReportRow[]>`
      SELECT l.id, l.camera_id, l.message_type, l.keepalive, l.overall_risk_level,
             l.overall_description, l.event_image_path, l.received_at
      FROM cameras c
      CROSS JOIN LATERAL (
        SELECT e.id, e.camera_id, e.message_type, e.keepalive, e.overall_risk_level,
               e.overall_description, e.event_image_path, e.received_at
        FROM edge_reports e
        WHERE e.camera_id = c.id
        ORDER BY e.received_at DESC
        LIMIT 3
      ) l
    `,
  ]);

  const reportsByCamera = new Map<string, RecentReport[]>();
  for (const row of reportRows) {
    const list = reportsByCamera.get(row.camera_id) ?? [];
    list.push({
      id: row.id,
      messageType: row.message_type,
      keepalive: row.keepalive,
      overallRiskLevel: row.overall_risk_level,
      overallDescription: row.overall_description,
      eventImagePath: row.event_image_path,
      receivedAt: row.received_at,
    });
    reportsByCamera.set(row.camera_id, list);
  }

  const now = Date.now();
  const devices = sortByFloor(
    cameras
      .map((cam) => ({ cam, reports: reportsByCamera.get(cam.id) ?? [] }))
      .filter(({ cam, reports }) =>
        shouldDisplayEdgeCamera({ ...cam, edgeReports: reports })
      )
      .map(({ cam, reports }) => mapCamera(cam, reports, now))
  );

  const onlineCount = devices.filter((d) => d.isOnline).length;
  const page = devices.slice(offset, offset + limit);
  const nextOffset = offset + limit < devices.length ? offset + limit : null;

  return {
    devices: page,
    onlineCount,
    total: devices.length,
    nextOffset,
  };
}
