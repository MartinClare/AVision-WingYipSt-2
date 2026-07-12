import type { PrismaClient } from "@prisma/client";
import type {
  ReportPeriod,
  SafetyCategoryBlock,
  SafetyFindingRow,
  SafetyIncidentRow,
  SafetyReportData,
} from "./safety-report-types";

const ELEVATED = new Set(["medium", "high", "critical"]);

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function resolveReportRange(period: ReportPeriod, anchor = new Date()): {
  rangeStart: Date;
  rangeEnd: Date;
  title: string;
} {
  if (period === "daily") {
    return {
      rangeStart: startOfDay(anchor),
      rangeEnd: endOfDay(anchor),
      title: `Daily Safety Report — ${formatDate(anchor)}`,
    };
  }

  const end = endOfDay(anchor);
  const start = startOfDay(new Date(anchor));
  start.setDate(start.getDate() - 6);
  return {
    rangeStart: start,
    rangeEnd: end,
    title: `Weekly Safety Report — ${formatDate(start)} to ${formatDate(end)}`,
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeRisk(value: string | null | undefined): string {
  if (!value) return "Low";
  const s = value.trim();
  if (!s) return "Low";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function effectiveRisk(overall: string, cmp: string | null | undefined): string {
  const cmpNorm = normalizeRisk(cmp);
  const overallNorm = normalizeRisk(overall);
  const order = ["Low", "Medium", "High", "Critical"];
  const cmpIdx = order.indexOf(cmpNorm);
  const overallIdx = order.indexOf(overallNorm);
  return cmpIdx >= overallIdx ? cmpNorm : overallNorm;
}

function isElevated(risk: string): boolean {
  return ELEVATED.has(risk.toLowerCase());
}

function coerceCategory(raw: unknown): SafetyCategoryBlock {
  if (!raw || typeof raw !== "object") {
    return { summary: "", issues: [], recommendations: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    summary: typeof o.summary === "string" ? o.summary : "",
    issues: Array.isArray(o.issues)
      ? o.issues.filter((x): x is string => typeof x === "string")
      : [],
    recommendations: Array.isArray(o.recommendations)
      ? o.recommendations.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function collectIssues(
  construction: SafetyCategoryBlock,
  fire: SafetyCategoryBlock,
  property: SafetyCategoryBlock,
): string[] {
  const issues = [...construction.issues, ...fire.issues, ...property.issues];
  return [...new Set(issues.filter(Boolean))];
}

function formatIncidentType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function fetchSafetyReportData(
  prisma: PrismaClient,
  period: ReportPeriod,
  anchor = new Date(),
): Promise<SafetyReportData> {
  const { rangeStart, rangeEnd, title } = resolveReportRange(period, anchor);

  const [project, incidents, reports] = await Promise.all([
    prisma.project.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.incident.findMany({
      where: {
        detectedAt: { gte: rangeStart, lte: rangeEnd },
        NOT: { notes: "__test__" },
      },
      include: {
        camera: { select: { name: true } },
        project: { select: { name: true } },
        zone: { select: { name: true } },
        edgeReport: { select: { overallDescription: true } },
      },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.edgeReport.findMany({
      where: {
        receivedAt: { gte: rangeStart, lte: rangeEnd },
        keepalive: false,
        messageType: { not: "keepalive" },
      },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        edgeCameraId: true,
        cameraName: true,
        overallRiskLevel: true,
        cmpRiskLevel: true,
        overallDescription: true,
        peopleCount: true,
        missingHardhats: true,
        missingVests: true,
        constructionSafety: true,
        fireSafety: true,
        propertySecurity: true,
        receivedAt: true,
      },
    }),
  ]);

  const incidentRows: SafetyIncidentRow[] = incidents.map((incident) => ({
    id: incident.id,
    type: formatIncidentType(incident.type),
    riskLevel: normalizeRisk(incident.riskLevel),
    status: incident.status.replaceAll("_", " "),
    detectedAt: incident.detectedAt,
    cameraName: incident.camera?.name ?? incident.cameraId,
    projectName: incident.project?.name ?? "Unknown",
    zoneName: incident.zone?.name ?? "Unknown",
    notes: incident.notes,
    reasoning: incident.reasoning,
    description: incident.edgeReport?.overallDescription ?? null,
  }));

  const riskBreakdown: Record<string, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };

  const latestByCamera = new Map<string, SafetyFindingRow>();
  const cameraStats = new Map<
    string,
    { cameraName: string; edgeCameraId: string; reportCount: number; elevatedCount: number; lastReportAt: Date | null; latestRiskLevel: string | null }
  >();

  let totalMissingHardhats = 0;
  let totalMissingVests = 0;

  for (const report of reports) {
    const riskLevel = effectiveRisk(report.overallRiskLevel, report.cmpRiskLevel);
    riskBreakdown[riskLevel] = (riskBreakdown[riskLevel] ?? 0) + 1;

    totalMissingHardhats += report.missingHardhats ?? 0;
    totalMissingVests += report.missingVests ?? 0;

    const stats =
      cameraStats.get(report.edgeCameraId) ??
      {
        cameraName: report.cameraName,
        edgeCameraId: report.edgeCameraId,
        reportCount: 0,
        elevatedCount: 0,
        lastReportAt: null,
        latestRiskLevel: null,
      };
    stats.reportCount += 1;
    if (isElevated(riskLevel)) stats.elevatedCount += 1;
    if (!stats.lastReportAt || report.receivedAt > stats.lastReportAt) {
      stats.lastReportAt = report.receivedAt;
      stats.latestRiskLevel = riskLevel;
    }
    cameraStats.set(report.edgeCameraId, stats);

    if (!isElevated(riskLevel)) continue;

    const constructionSafety = coerceCategory(report.constructionSafety);
    const fireSafety = coerceCategory(report.fireSafety);
    const propertySecurity = coerceCategory(report.propertySecurity);
    const issues = collectIssues(constructionSafety, fireSafety, propertySecurity);
    const hasPpeGap = (report.missingHardhats ?? 0) > 0 || (report.missingVests ?? 0) > 0;
    if (!issues.length && !hasPpeGap && !report.overallDescription.trim()) continue;

    const finding: SafetyFindingRow = {
      id: report.id,
      cameraName: report.cameraName,
      edgeCameraId: report.edgeCameraId,
      riskLevel,
      detectedAt: report.receivedAt,
      description: report.overallDescription,
      peopleCount: report.peopleCount,
      missingHardhats: report.missingHardhats,
      missingVests: report.missingVests,
      constructionSafety,
      fireSafety,
      propertySecurity,
      issues,
    };

    const existing = latestByCamera.get(report.edgeCameraId);
    if (!existing || report.receivedAt > existing.detectedAt) {
      latestByCamera.set(report.edgeCameraId, finding);
    }
  }

  const findings = [...latestByCamera.values()].sort(
    (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime(),
  );

  const elevatedReports = reports.filter((report) =>
    isElevated(effectiveRisk(report.overallRiskLevel, report.cmpRiskLevel)),
  ).length;

  return {
    period,
    title,
    generatedAt: new Date(),
    rangeStart,
    rangeEnd,
    projectName: project?.name ?? "AXON Vision Site",
    summary: {
      totalIncidents: incidentRows.length,
      openIncidents: incidentRows.filter((row) => row.status === "open").length,
      highCriticalIncidents: incidentRows.filter((row) =>
        ["High", "Critical"].includes(row.riskLevel),
      ).length,
      analysisReports: reports.length,
      elevatedReports,
      totalMissingHardhats,
      totalMissingVests,
      camerasReporting: cameraStats.size,
    },
    incidents: incidentRows,
    findings,
    cameraActivity: [...cameraStats.values()]
      .sort((a, b) => b.elevatedCount - a.elevatedCount || b.reportCount - a.reportCount)
      .map((row) => ({
        cameraName: row.cameraName,
        edgeCameraId: row.edgeCameraId,
        reportCount: row.reportCount,
        elevatedCount: row.elevatedCount,
        lastReportAt: row.lastReportAt,
        latestRiskLevel: row.latestRiskLevel,
      })),
    riskBreakdown,
  };
}
