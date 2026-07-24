import type {
  DailyManagementNarrative,
  ProfessionalFinding,
  ProfessionalSafetyNarrative,
  SafetyFindingRow,
  SafetyReportData,
} from "./safety-report-types";

const RISK_ORDER = ["Low", "Medium", "High", "Critical"] as const;

function riskRank(risk: string): number {
  return RISK_ORDER.indexOf(risk as (typeof RISK_ORDER)[number]);
}

function maxRisk(data: SafetyReportData): "Low" | "Medium" | "High" | "Critical" {
  let max = 0;
  for (const incident of data.incidents) {
    max = Math.max(max, riskRank(incident.riskLevel));
  }
  for (const finding of data.findings) {
    max = Math.max(max, riskRank(finding.riskLevel));
  }
  return RISK_ORDER[max] ?? "Low";
}

function periodLabel(period: SafetyReportData["period"]): string {
  return period === "daily" ? "24-hour" : "7-day";
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function summarizeHotspots(data: SafetyReportData): string[] {
  return data.cameraActivity
    .filter((row) => row.elevatedCount > 0)
    .slice(0, 5)
    .map(
      (row) =>
        `${row.cameraName} (${row.elevatedCount} elevated reading${row.elevatedCount === 1 ? "" : "s"} from ${row.reportCount} inspections)`,
    );
}

function buildPpeAssessment(data: SafetyReportData): string {
  const { totalMissingHardhats, totalMissingVests, elevatedReports } = data.summary;
  if (totalMissingHardhats === 0 && totalMissingVests === 0) {
    return elevatedReports > 0
      ? "No systematic hard-hat or high-visibility vest gaps were quantified. Continued spot checks in active work zones remain useful."
      : "PPE compliance appeared satisfactory across monitored zones during the period.";
  }

  const parts: string[] = [];
  if (totalMissingHardhats > 0) {
    parts.push(`${totalMissingHardhats} hard-hat related observation${totalMissingHardhats === 1 ? "" : "s"}`);
  }
  if (totalMissingVests > 0) {
    parts.push(`${totalMissingVests} high-visibility vest related observation${totalMissingVests === 1 ? "" : "s"}`);
  }
  return `PPE reminders may help in active areas: ${parts.join("; ")}.`;
}

function buildConstructionAssessment(data: SafetyReportData): string {
  const constructionIssues = unique(
    data.findings.flatMap((f) => [...f.constructionSafety.issues, ...f.constructionSafety.recommendations.slice(0, 1)]),
  );
  const summaries = unique(data.findings.map((f) => f.constructionSafety.summary).filter(Boolean));

  if (!constructionIssues.length && !summaries.length) {
    return data.summary.elevatedReports > 0
      ? "Active construction zones remained under surveillance. Housekeeping and access routes continue to benefit from routine supervision."
      : "Construction activities within camera coverage remained within normal operating conditions.";
  }

  return `Construction-related observations included: ${constructionIssues.slice(0, 4).join("; ")}.`;
}

function buildFireAssessment(data: SafetyReportData): string {
  const fireIssues = unique(data.findings.flatMap((f) => f.fireSafety.issues));
  if (!fireIssues.length) {
    return "No confirmed fire or hot-work related anomalies were selected for the management highlights.";
  }
  return `Fire/smoke related observations for review: ${fireIssues.slice(0, 4).join("; ")}.`;
}

function buildSecurityAssessment(data: SafetyReportData): string {
  const securityIssues = unique(data.findings.flatMap((f) => f.propertySecurity.issues));
  if (!securityIssues.length) {
    return "Site access and material security appeared stable within monitored areas.";
  }
  return `Access and security observations: ${securityIssues.slice(0, 4).join("; ")}.`;
}

function findingPriority(finding: SafetyFindingRow): ProfessionalFinding["priority"] {
  if ((finding.missingHardhats ?? 0) > 0 || (finding.missingVests ?? 0) > 0) return "Immediate";
  if (finding.riskLevel === "Critical" || finding.riskLevel === "High") return "High";
  if (finding.issues.length > 0) return "Medium";
  return "Monitor";
}

function buildRequiredAction(finding: SafetyFindingRow): string {
  const recs = unique([
    ...finding.constructionSafety.recommendations,
    ...finding.fireSafety.recommendations,
    ...finding.propertySecurity.recommendations,
  ]);

  if ((finding.missingHardhats ?? 0) > 0) {
    recs.unshift("Reinforce hard-hat use at the nearest access point before re-entry to the work zone.");
  }
  if ((finding.missingVests ?? 0) > 0) {
    recs.unshift("Remind crews about high-visibility vest use before entering active areas.");
  }
  if (recs.length) return recs[0];

  if (finding.riskLevel === "Medium" || finding.riskLevel === "High") {
    return "Include this location in the next safety walk-down and note any improvement opportunities.";
  }
  return "Continue routine monitoring and include this zone in the next scheduled safety patrol.";
}

function buildHazardAssessment(finding: SafetyFindingRow): string {
  if (finding.issues.length) {
    return finding.issues.slice(0, 3).join(" ");
  }
  if ((finding.missingHardhats ?? 0) > 0 || (finding.missingVests ?? 0) > 0) {
    return "Incomplete PPE was visible and may increase injury severity if an unexpected event occurs.";
  }
  return `Automated assessment classified this zone as ${finding.riskLevel} risk based on visual conditions.`;
}

function buildObservation(finding: SafetyFindingRow): string {
  const desc = finding.description.trim();
  if (desc) {
    return desc.endsWith(".") ? desc : `${desc}.`;
  }
  return `Vision inspection at ${finding.cameraName} recorded conditions warranting ${finding.riskLevel.toLowerCase()} attention.`;
}

function buildPriorityFindings(data: SafetyReportData): ProfessionalFinding[] {
  const priorityOrder = { Immediate: 0, High: 1, Medium: 2, Monitor: 3 };
  return data.findings
    .map((finding) => ({
      priority: findingPriority(finding),
      location: finding.cameraName,
      observation: buildObservation(finding),
      hazardAssessment: buildHazardAssessment(finding),
      requiredAction: buildRequiredAction(finding),
    }))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 12);
}

function buildCorrectiveActions(findings: ProfessionalFinding[], data: SafetyReportData): string[] {
  const actions = findings
    .filter((f) => f.priority === "Immediate" || f.priority === "High")
    .map((f) => `${f.location}: ${f.requiredAction}`);

  if (data.summary.openIncidents > 0) {
    actions.unshift(
      `Follow up ${data.summary.openIncidents} open item${data.summary.openIncidents === 1 ? "" : "s"} with documented improvement notes.`,
    );
  }

  if (!actions.length && data.summary.elevatedReports > 0) {
    actions.push(
      "Include hotspot cameras from this report in the next supervisory walk-down.",
      "Share one housekeeping or PPE reminder during the next toolbox talk.",
    );
  }

  if (!actions.length) {
    actions.push("Maintain current control measures and continue scheduled vision-based monitoring.");
  }

  return unique(actions).slice(0, 8);
}

function buildManagementRecommendations(data: SafetyReportData, overall: string): string[] {
  const recs = [
    "Assign an owner and simple verification method for each selected improvement scheme.",
    "Use the daily coordination meeting to share one highlight and one positive practice.",
  ];

  if (data.summary.totalMissingHardhats > 0 || data.summary.totalMissingVests > 0) {
    recs.unshift("Add a short PPE reminder at zone entry points for the next few shifts.");
  }

  if (overall === "High" || overall === "Critical") {
    recs.unshift("Increase supervisory presence in the highlighted zones until improvements are visible.");
  }

  if (data.summary.camerasReporting < 10) {
    recs.push("Review camera uptime so monitoring coverage remains aligned with the project safety plan.");
  }

  return recs.slice(0, 6);
}

function buildExecutiveSummary(data: SafetyReportData, overall: string): string[] {
  const period = periodLabel(data.period);
  const hotspots = summarizeHotspots(data);

  const paragraphs: string[] = [
    `This ${period} safety report covers ${data.projectName} for the period ${fmtDate(data.rangeStart)} to ${fmtDate(data.rangeEnd)}. The assessment is based on ${data.summary.analysisReports} automated vision inspections across ${data.summary.camerasReporting} active camera zones.`,
    `Overall site status for the period is assessed as ${overall}. ${data.summary.totalIncidents} formal item${data.summary.totalIncidents === 1 ? "" : "s"} ${data.summary.totalIncidents === 1 ? "was" : "were"} logged, with ${data.summary.openIncidents} remaining open. Vision analytics flagged ${data.summary.elevatedReports} elevated assessment${data.summary.elevatedReports === 1 ? "" : "s"} for review.`,
  ];

  if (hotspots.length) {
    paragraphs.push(`Areas receiving the most frequent elevated readings were: ${hotspots.join("; ")}.`);
  } else if (data.summary.totalIncidents === 0 && data.summary.elevatedReports === 0) {
    paragraphs.push(
      "No elevated hazards or formal incidents were recorded during the period. Monitored areas remained consistent with normal operating conditions.",
    );
  }

  return paragraphs;
}

function buildOverallRiskStatement(overall: string, data: SafetyReportData): string {
  const elevatedPct =
    data.summary.analysisReports > 0
      ? Math.round((data.summary.elevatedReports / data.summary.analysisReports) * 100)
      : 0;

  switch (overall) {
    case "Critical":
      return "Priority attention is recommended due to one or more high-severity verified observations.";
    case "High":
      return "Additional supervisory attention is recommended within the next working day for the highlighted areas.";
    case "Medium":
      return `Around ${elevatedPct}% of inspections returned elevated results. Targeted walk-downs and improvement schemes are suggested.`;
    default:
      return "Monitored areas operated within acceptable tolerances during the reporting period.";
  }
}

/** Legacy weekly / detailed narrative retained for compatibility. */
export function composeProfessionalSafetyNarrative(data: SafetyReportData): ProfessionalSafetyNarrative {
  const overall = maxRisk(data);
  const stamp = data.generatedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const priorityFindings = buildPriorityFindings(data);

  const incidentReview =
    data.incidents.length === 0
      ? ["No formal safety incidents were registered during this reporting period."]
      : data.incidents.slice(0, 12).map(
          (incident) =>
            `[${incident.riskLevel}] ${incident.type} at ${incident.cameraName} (${incident.zoneName}) on ${incident.detectedAt.toLocaleString("en-GB")}. Status: ${incident.status}.`,
        );

  const surveillanceSummary = [
    `${data.summary.camerasReporting} camera zones transmitted analysis data during the period.`,
    `Risk distribution across all inspections: Low ${data.riskBreakdown.Low ?? 0}, Medium ${data.riskBreakdown.Medium ?? 0}, High ${data.riskBreakdown.High ?? 0}, Critical ${data.riskBreakdown.Critical ?? 0}.`,
    data.cameraActivity.length
      ? `Highest inspection volume was recorded at ${data.cameraActivity
          .slice(0, 3)
          .map((c) => c.cameraName)
          .join(", ")}.`
      : "No camera activity was recorded.",
  ];

  return {
    reportReference: `AXON/SAF/${stamp}/${data.period.toUpperCase()}`,
    preparedBy: "Site Safety Officer (AI-assisted CMP Report)",
    overallRiskRating: overall,
    overallRiskStatement: buildOverallRiskStatement(overall, data),
    executiveSummary: buildExecutiveSummary(data, overall),
    scopeAndMethod: [
      "This report uses continuous AI-assisted vision analytics from fixed CCTV / edge camera positions.",
      "Only verified observations are recommended for management photo highlights.",
      "The document is intended to support constructive improvement planning.",
    ],
    keyObservations: [
      data.highlights.length > 0
        ? `${data.highlights.length} photo-supported highlight${data.highlights.length === 1 ? "" : "s"} ${data.highlights.length === 1 ? "was" : "were"} selected.`
        : "No verified photo highlights required escalation.",
      data.summary.elevatedReports > 0
        ? `${data.summary.elevatedReports} zone inspections returned medium or higher classifications.`
        : "No medium-or-above automated classifications were recorded.",
      data.summary.openIncidents > 0
        ? `${data.summary.openIncidents} item(s) remain open for follow-up.`
        : "Open-item register is clear for the reporting period.",
    ],
    thematicAssessment: {
      ppe: buildPpeAssessment(data),
      construction: buildConstructionAssessment(data),
      fire: buildFireAssessment(data),
      security: buildSecurityAssessment(data),
    },
    priorityFindings,
    incidentReview,
    correctiveActions: buildCorrectiveActions(priorityFindings, data),
    managementRecommendations: buildManagementRecommendations(data, overall),
    surveillanceSummary,
    conclusion: [
      overall === "Low"
        ? "Based on the evidence reviewed, continue operations under existing controls with routine monitoring."
        : "Based on the evidence reviewed, focus improvement effort on the highlighted zones until progress is visible.",
      "This report supports site coordination and does not replace physical inspection or statutory reporting obligations.",
    ],
  };
}

/** Concise neutral daily management narrative used by the 19:00 report. */
export function composeDailyManagementNarrative(data: SafetyReportData): DailyManagementNarrative {
  const stamp = data.rangeEnd.toISOString().slice(0, 10).replaceAll("-", "");
  const confirmed = data.highlights.filter((h) => h.evidenceStatus === "confirmed").length;
  const defaultClosing =
    confirmed > 0
      ? "Please review the photo-supported highlights with trade supervisors and agree one practical improvement for the next shift."
      : data.unverifiedObservations.length > 0
        ? "No confirmed photo highlights required escalation. Review the unverified AI observations separately and continue routine monitoring."
        : "No confirmed photo highlights required escalation. Continue routine monitoring and share one positive practice at the next toolbox talk.";
  return {
    reportReference: `AXON/DAILY/${stamp}`,
    preparedBy: "AXON Vision CMP — Daily Safety Review",
    dailyStatus: data.dailyStatus,
    overviewParagraph: data.overviewParagraph,
    kpis: data.kpis,
    comparisonNote: data.comparisonNote,
    themeSummaries: data.themeSummaries,
    highlights: data.highlights,
    unverifiedObservations: data.unverifiedObservations,
    improvementSchemes: data.improvementSchemes,
    positivePractices: data.positivePractices,
    monitoringNotes: data.monitoring.notes,
    methodologyNotes: data.methodologyNotes,
    confidence: data.monitoring.confidence,
    closingNote: data.closingNote?.trim() || defaultClosing,
    narrativeSource: data.narrativeSource ?? "template",
    narrativeModel: data.narrativeModel ?? null,
  };
}
