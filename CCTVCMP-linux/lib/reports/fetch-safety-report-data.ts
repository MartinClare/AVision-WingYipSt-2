import type { PrismaClient } from "@prisma/client";
import { selectSafetyHighlights } from "./select-safety-highlights";
import type {
  ComparisonTrend,
  DailyOverviewKpis,
  DailySafetyStatus,
  ImprovementSchemeItem,
  MonitoringCoverage,
  PositivePractice,
  ReportPeriod,
  SafetyCategoryBlock,
  SafetyFindingRow,
  SafetyIncidentRow,
  SafetyReportData,
  ThemeSummary,
} from "./safety-report-types";

const ELEVATED = new Set(["medium", "high", "critical"]);
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatDateHkt(date: Date): string {
  return new Date(date.getTime() + HKT_OFFSET_MS).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTimeHkt(date: Date): string {
  return new Date(date.getTime() + HKT_OFFSET_MS).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Daily reports use the preceding 24 hours ending at 19:00 HKT on the anchor day.
 * Weekly reports keep a 7-day calendar window ending on the anchor day (HKT).
 */
export function resolveReportRange(period: ReportPeriod, anchor = new Date()): {
  rangeStart: Date;
  rangeEnd: Date;
  title: string;
  previousRangeStart: Date;
  previousRangeEnd: Date;
} {
  if (period === "daily") {
    const anchorHkt = new Date(anchor.getTime() + HKT_OFFSET_MS);
    const endHkt = new Date(anchorHkt);
    endHkt.setUTCHours(19, 0, 0, 0);
    // If current HKT time is before 19:00, use previous day's 19:00 as the end.
    if (anchorHkt < endHkt) {
      endHkt.setUTCDate(endHkt.getUTCDate() - 1);
    }
    const startHkt = new Date(endHkt);
    startHkt.setUTCDate(startHkt.getUTCDate() - 1);

    const rangeEnd = new Date(endHkt.getTime() - HKT_OFFSET_MS);
    const rangeStart = new Date(startHkt.getTime() - HKT_OFFSET_MS);
    const previousRangeEnd = rangeStart;
    const previousRangeStart = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);

    return {
      rangeStart,
      rangeEnd,
      previousRangeStart,
      previousRangeEnd,
      title: `Daily Safety Review — ${formatDateHkt(rangeEnd)} (19:00 HKT)`,
    };
  }

  const anchorHkt = new Date(anchor.getTime() + HKT_OFFSET_MS);
  const endHkt = new Date(anchorHkt);
  endHkt.setUTCHours(23, 59, 59, 999);
  const startHkt = new Date(endHkt);
  startHkt.setUTCDate(startHkt.getUTCDate() - 6);
  startHkt.setUTCHours(0, 0, 0, 0);

  const rangeEnd = new Date(endHkt.getTime() - HKT_OFFSET_MS);
  const rangeStart = new Date(startHkt.getTime() - HKT_OFFSET_MS);
  const previousRangeEnd = rangeStart;
  const previousRangeStart = new Date(rangeStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    rangeStart,
    rangeEnd,
    previousRangeStart,
    previousRangeEnd,
    title: `Weekly Safety Report — ${formatDateHkt(rangeStart)} to ${formatDateHkt(rangeEnd)}`,
  };
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

function deriveDailyStatus(
  highlightCount: number,
  openAttention: number,
  highCritical: number,
): DailySafetyStatus {
  if (highCritical > 0 || highlightCount >= 4) return "Priority Attention";
  if (highlightCount > 0 || openAttention > 0) return "Attention Required";
  return "Normal";
}

function deriveComparison(
  currentHighlights: number,
  previousHighlights: number,
  currentOpen: number,
  previousOpen: number,
): { trend: ComparisonTrend; note: string } {
  if (currentHighlights < previousHighlights || currentOpen < previousOpen) {
    return {
      trend: "improved",
      note: "Compared with the previous 24 hours, fewer verified observations required attention.",
    };
  }
  if (currentHighlights > previousHighlights || currentOpen > previousOpen) {
    return {
      trend: "needs attention",
      note: "Compared with the previous 24 hours, more verified observations may benefit from follow-up.",
    };
  }
  return {
    trend: "stable",
    note: "Site conditions appear broadly stable compared with the previous 24 hours.",
  };
}

function buildOverviewParagraph(params: {
  projectName: string;
  rangeStart: Date;
  rangeEnd: Date;
  reviewsCompleted: number;
  camerasReporting: number;
  elevatedReports: number;
  themeSummaries: ThemeSummary[];
  highlightCount: number;
  unverifiedCount: number;
  status: DailySafetyStatus;
}): string {
  const period = `${formatDateTimeHkt(params.rangeStart)} to ${formatDateTimeHkt(params.rangeEnd)} HKT`;
  const confirmedThemes = params.themeSummaries.filter((t) => t.evidenceStatus === "confirmed");
  const themeNames = confirmedThemes
    .slice(0, 3)
    .map((t) => t.label.toLowerCase())
    .join(", ");

  const themeClause = themeNames
    ? ` Recurring confirmed themes included ${themeNames}.`
    : params.unverifiedCount > 0
      ? " Some AI observations remained unverified or were associated with known false-positive patterns and are summarised separately."
      : " No recurring confirmed safety themes required escalation.";

  const photoClause =
    params.highlightCount > 0
      ? ` ${params.highlightCount} photo-supported highlight${params.highlightCount === 1 ? "" : "s"} ${params.highlightCount === 1 ? "is" : "are"} included below, each using the image from the same analysis report as the summarised text.`
      : "";

  return `This daily safety review for ${params.projectName} covers ${period}. ${params.reviewsCompleted} vision reviews were completed across ${params.camerasReporting} cameras, with ${params.elevatedReports} elevated classifications.${themeClause}${photoClause} Overall status: ${params.status}.`;
}

function buildImprovementSchemes(
  highlights: SafetyReportData["highlights"],
): ImprovementSchemeItem[] {
  if (!highlights.length) {
    return [
      {
        horizon: "Ongoing",
        theme: "Routine monitoring",
        scheme: "Continue scheduled vision monitoring and daily supervisor walk-downs.",
        intendedBenefit: "Maintain current safety awareness and early detection of emerging issues.",
        suggestedTeam: "Site supervision / Safety team",
      },
    ];
  }

  const byGroup = new Map<string, typeof highlights>();
  for (const highlight of highlights) {
    const list = byGroup.get(highlight.group) ?? [];
    list.push(highlight);
    byGroup.set(highlight.group, list);
  }

  const schemes: ImprovementSchemeItem[] = [];
  for (const [, groupHighlights] of byGroup) {
    const sample = groupHighlights[0];
    schemes.push({
      horizon: schemes.length === 0 ? "Immediate" : schemes.length === 1 ? "Short-term" : "Ongoing",
      theme: sample.heading.replace(/ observation.*$/i, ""),
      scheme: sample.suggestedImprovement,
      intendedBenefit: sample.potentialConsideration,
      suggestedTeam:
        sample.group === "ppe" || sample.group === "work_at_height"
          ? "Trade foremen / Safety team"
          : sample.group === "machinery"
            ? "Plant coordinator / Safety team"
            : "Site supervision",
    });
  }

  if (schemes.length < 3) {
    schemes.push({
      horizon: "Ongoing",
      theme: "Positive reinforcement",
      scheme: "Share one good-practice example from the day's review during the next toolbox talk.",
      intendedBenefit: "Encourage continued safe behaviours across crews.",
      suggestedTeam: "Safety team",
    });
  }

  return schemes.slice(0, 5);
}

function buildPositivePractices(params: {
  highlightCount: number;
  resolvedItems: number;
  camerasReporting: number;
  camerasExpected: number;
}): PositivePractice[] {
  const practices: PositivePractice[] = [];
  if (params.resolvedItems > 0) {
    practices.push({
      title: "Prompt follow-up",
      description: `${params.resolvedItems} observation${params.resolvedItems === 1 ? "" : "s"} were reviewed and closed during the period.`,
    });
  }
  if (params.camerasReporting >= Math.max(1, params.camerasExpected * 0.8)) {
    practices.push({
      title: "Monitoring coverage maintained",
      description: `${params.camerasReporting} cameras provided review data, supporting continuous site awareness.`,
    });
  }
  if (params.highlightCount === 0) {
    practices.push({
      title: "Stable operating conditions",
      description: "No verified concerns required photo escalation in this reporting window.",
    });
  } else {
    practices.push({
      title: "Constructive review approach",
      description: "Selected observations focus on improvement opportunities rather than individual criticism.",
    });
  }
  return practices.slice(0, 3);
}

export async function fetchSafetyReportData(
  prisma: PrismaClient,
  period: ReportPeriod,
  anchor = new Date(),
): Promise<SafetyReportData> {
  const { rangeStart, rangeEnd, title, previousRangeStart, previousRangeEnd } = resolveReportRange(
    period,
    anchor,
  );

  const [project, camerasExpected, incidents, reports, previousIncidents, evidence] =
    await Promise.all([
      prisma.project.findFirst({ orderBy: { createdAt: "asc" } }),
      prisma.camera.count(),
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
      prisma.incident.count({
        where: {
          detectedAt: { gte: previousRangeStart, lte: previousRangeEnd },
          NOT: { notes: "__test__" },
          status: { in: ["open", "acknowledged", "resolved"] },
          recordOnly: false,
        },
      }),
      selectSafetyHighlights(prisma, rangeStart, rangeEnd),
    ]);

  const { themeSummaries, highlights, unverifiedObservations } = evidence;

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
    {
      cameraName: string;
      edgeCameraId: string;
      reportCount: number;
      elevatedCount: number;
      lastReportAt: Date | null;
      latestRiskLevel: string | null;
    }
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

  const openIncidents = incidentRows.filter((row) => row.status === "open").length;
  const resolvedItems = incidentRows.filter((row) => row.status === "resolved").length;
  const highCriticalIncidents = incidentRows.filter((row) =>
    ["High", "Critical"].includes(row.riskLevel),
  ).length;

  const confirmedHighlightCount = highlights.filter((h) => h.evidenceStatus === "confirmed").length;
  const kpis: DailyOverviewKpis = {
    reviewsCompleted: reports.length,
    camerasReporting: cameraStats.size,
    noteworthyObservations: confirmedHighlightCount || highlights.length,
    resolvedItems,
    itemsRequiringAttention:
      openIncidents +
      themeSummaries.filter((t) => t.evidenceStatus === "confirmed").length,
  };

  const dailyStatus = deriveDailyStatus(
    confirmedHighlightCount,
    openIncidents,
    highCriticalIncidents,
  );
  const comparison = deriveComparison(
    confirmedHighlightCount,
    previousIncidents,
    openIncidents,
    previousIncidents,
  );

  const coverageRatio =
    camerasExpected > 0 ? cameraStats.size / camerasExpected : cameraStats.size > 0 ? 1 : 0;
  const monitoring: MonitoringCoverage = {
    camerasExpected,
    camerasReporting: cameraStats.size,
    aiReviewNormal: reports.length > 0,
    notes: [
      reports.length > 0
        ? "AI vision review operated during the reporting window."
        : "Limited or no AI analysis reports were received in this window.",
      coverageRatio >= 0.8
        ? "Camera reporting coverage was broadly complete."
        : "Camera reporting coverage was partial; interpret findings with that context.",
    ],
    confidence: coverageRatio >= 0.8 && reports.length > 0 ? "Complete" : "Partial",
  };

  const methodologyNotes = [
    "Theme summaries are aggregated from structured EdgeReport text (overall description, construction / fire / security category blocks, and classifications).",
    "Each photo-supported highlight uses the image from the same EdgeReport as the summarised text.",
    "Confirmed findings require edge and CMP vision agreement; dismissed or known false-positive patterns are listed separately as unverified.",
    "Known background false-positive patterns (for example repeated lan_cam_04 fire readings) are excluded from confirmed highlights.",
  ];

  const projectName = project?.name ?? "AXON Vision Site";
  const overviewParagraph = buildOverviewParagraph({
    projectName,
    rangeStart,
    rangeEnd,
    reviewsCompleted: kpis.reviewsCompleted,
    camerasReporting: kpis.camerasReporting,
    elevatedReports,
    themeSummaries,
    highlightCount: highlights.length,
    unverifiedCount: unverifiedObservations.length,
    status: dailyStatus,
  });

  return {
    period,
    title,
    generatedAt: new Date(),
    rangeStart,
    rangeEnd,
    projectName,
    dailyStatus,
    overviewParagraph,
    kpis,
    comparisonTrend: comparison.trend,
    comparisonNote: comparison.note,
    themeSummaries,
    highlights,
    unverifiedObservations,
    improvementSchemes: buildImprovementSchemes(highlights),
    positivePractices: buildPositivePractices({
      highlightCount: confirmedHighlightCount,
      resolvedItems,
      camerasReporting: cameraStats.size,
      camerasExpected,
    }),
    monitoring,
    methodologyNotes,
    summary: {
      totalIncidents: incidentRows.length,
      openIncidents,
      highCriticalIncidents,
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
