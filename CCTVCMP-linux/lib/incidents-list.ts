import type { IncidentRiskLevel, IncidentStatus, IncidentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEdgeReportImageUrl } from "@/lib/edge-report-images";

export type IncidentListItem = {
  id: string;
  type: string;
  riskLevel: IncidentRiskLevel;
  status: IncidentStatus;
  recordOnly: boolean;
  reasoning: string | null;
  detectedAt: string;
  project: { name: string };
  zone: { name: string };
  camera: { name: string };
  assignee: { name: string } | null;
  evidence: {
    reportId: string;
    imagePath: string;
    riskLevel: string;
    receivedAt: string;
  } | null;
};

export type IncidentsPageResult = {
  incidents: IncidentListItem[];
  total: number;
  nextCursor: string | null;
  statusCounts: Record<string, number>;
};

function encodeCursor(detectedAt: Date, id: string): string {
  return Buffer.from(`${detectedAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): { detectedAt: Date; id: string } | null {
  if (!raw?.trim()) return null;
  try {
    const text = Buffer.from(raw, "base64url").toString("utf8");
    const [iso, id] = text.split("|");
    if (!iso || !id) return null;
    const detectedAt = new Date(iso);
    if (Number.isNaN(detectedAt.getTime())) return null;
    return { detectedAt, id };
  } catch {
    return null;
  }
}

export async function listIncidentsPage(options?: {
  cursor?: string | null;
  /** When set (including 0), page by offset instead of cursor — enables numbered pages. */
  offset?: number | null;
  limit?: number;
  statusFilter?: IncidentStatus[];
  riskFilter?: IncidentRiskLevel[];
  categoryTypes?: string[] | null;
}): Promise<IncidentsPageResult> {
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const offset =
    options?.offset != null && Number.isFinite(options.offset)
      ? Math.max(0, options.offset)
      : null;
  const cursor = offset == null ? decodeCursor(options?.cursor) : null;
  const typeFilter = options?.categoryTypes?.length
    ? (options.categoryTypes as IncidentType[])
    : null;

  const where = {
    ...(options?.statusFilter?.length ? { status: { in: options.statusFilter } } : {}),
    ...(options?.riskFilter?.length ? { riskLevel: { in: options.riskFilter } } : {}),
    ...(typeFilter ? { type: { in: typeFilter } } : {}),
    ...(cursor
      ? {
          OR: [
            { detectedAt: { lt: cursor.detectedAt } },
            { detectedAt: cursor.detectedAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.incident.findMany({
      where,
      select: {
        id: true,
        type: true,
        riskLevel: true,
        status: true,
        recordOnly: true,
        reasoning: true,
        detectedAt: true,
        project: { select: { name: true } },
        zone: { select: { name: true } },
        camera: { select: { name: true } },
        assignee: { select: { name: true } },
        edgeReport: {
          select: {
            id: true,
            eventImagePath: true,
            overallRiskLevel: true,
            receivedAt: true,
          },
        },
      },
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
      // Offset mode: exact page. Cursor mode: limit+1 to detect a following page.
      skip: offset ?? undefined,
      take: offset != null ? limit : limit + 1,
    }),
    prisma.incident.count({
      where: {
        ...(options?.statusFilter?.length ? { status: { in: options.statusFilter } } : {}),
        ...(options?.riskFilter?.length ? { riskLevel: { in: options.riskFilter } } : {}),
        ...(typeFilter ? { type: { in: typeFilter } } : {}),
      },
    }),
    prisma.incident.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        ...(options?.riskFilter?.length ? { riskLevel: { in: options.riskFilter } } : {}),
        ...(typeFilter ? { type: { in: typeFilter } } : {}),
      },
    }),
  ]);

  const hasMore = offset != null ? offset + rows.length < total : rows.length > limit;
  const page = offset != null ? rows : hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = offset == null && hasMore && last ? encodeCursor(last.detectedAt, last.id) : null;

  const statusCounts: Record<string, number> = {};
  for (const row of grouped) {
    statusCounts[row.status] = row._count._all;
  }

  const incidents: IncidentListItem[] = page.map((incident) => {
    const r = incident.edgeReport;
    const imagePath = r ? resolveEdgeReportImageUrl(r.id, r.eventImagePath) : null;
    return {
      id: incident.id,
      type: incident.type,
      riskLevel: incident.riskLevel,
      status: incident.status,
      recordOnly: incident.recordOnly,
      reasoning: incident.reasoning,
      detectedAt: incident.detectedAt.toISOString(),
      project: incident.project,
      zone: incident.zone,
      camera: incident.camera,
      assignee: incident.assignee,
      evidence:
        r && imagePath
          ? {
              reportId: r.id,
              imagePath,
              riskLevel: r.overallRiskLevel,
              receivedAt: r.receivedAt.toISOString(),
            }
          : null,
    };
  });

  return { incidents, total, nextCursor, statusCounts };
}
