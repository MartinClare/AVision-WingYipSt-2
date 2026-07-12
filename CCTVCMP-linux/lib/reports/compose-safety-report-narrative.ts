import type {
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
      ? "No systematic hard-hat or high-visibility vest non-compliance was quantified during the period. However, elevated vision alerts were recorded in active work zones, and supervisors should maintain spot checks where personnel enter scaffold and formwork areas."
      : "Personal protective equipment compliance appeared satisfactory across monitored zones. No missing hard-hat or vest detections were recorded.";
  }

  const parts: string[] = [];
  if (totalMissingHardhats > 0) {
    parts.push(`${totalMissingHardhats} instance${totalMissingHardhats === 1 ? "" : "s"} of missing or unconfirmed hard-hat use`);
  }
  if (totalMissingVests > 0) {
    parts.push(`${totalMissingVests} instance${totalMissingVests === 1 ? "" : "s"} of missing or unconfirmed high-visibility vest use`);
  }
  return `PPE non-compliance was detected by automated vision monitoring: ${parts.join("; ")}. These observations require immediate toolbox reinforcement and targeted supervision at the affected locations.`;
}

function buildConstructionAssessment(data: SafetyReportData): string {
  const constructionIssues = unique(
    data.findings.flatMap((f) => [...f.constructionSafety.issues, ...f.constructionSafety.recommendations.slice(0, 1)]),
  );
  const summaries = unique(data.findings.map((f) => f.constructionSafety.summary).filter(Boolean));

  if (!constructionIssues.length && !summaries.length) {
    return data.summary.elevatedReports > 0
      ? "Multiple active construction zones were under surveillance, including scaffold, formwork, and wet-trade areas. Elevated readings primarily reflect routine site complexity rather than confirmed imminent danger, but housekeeping, access routes, and edge protection must remain under daily supervision."
      : "Construction activities within camera coverage remained within normal operating conditions. No significant structural or procedural contraventions were identified.";
  }

  const issueText = constructionIssues.slice(0, 4).join("; ");
  return `Construction safety observations included: ${issueText}. Particular attention is required where simultaneous trades, temporary works, and material storage overlap in confined floor plates.`;
}

function buildFireAssessment(data: SafetyReportData): string {
  const fireIssues = unique(data.findings.flatMap((f) => f.fireSafety.issues));
  if (!fireIssues.length) {
    return "No fire or hot-work related anomalies were confirmed during the reporting period. Continue to enforce flammable material control and maintain access to firefighting equipment in work zones.";
  }
  return `Fire safety concerns were noted: ${fireIssues.slice(0, 4).join("; ")}. Verify housekeeping, extinguisher availability, and permit-to-work controls in the identified areas.`;
}

function buildSecurityAssessment(data: SafetyReportData): string {
  const securityIssues = unique(data.findings.flatMap((f) => f.propertySecurity.issues));
  if (!securityIssues.length) {
    return "Site perimeter and material security appeared stable. No unauthorised access or significant property security events were recorded through vision monitoring.";
  }
  return `Property security observations: ${securityIssues.slice(0, 4).join("; ")}. Review access control and overnight material storage in affected zones.`;
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
    recs.unshift("Stop-work authority to be exercised if personnel without hard hats continue work at height or in overhead-risk zones.");
  }
  if ((finding.missingVests ?? 0) > 0) {
    recs.unshift("Re-brief crews on mandatory high-visibility vest use before re-entry to active zones.");
  }
  if (recs.length) return recs[0];

  if (finding.riskLevel === "Medium" || finding.riskLevel === "High") {
    return "Assign a safety walk-down within 24 hours to validate conditions, confirm controls, and close out with photographic evidence.";
  }
  return "Continue routine monitoring and include this zone in the next scheduled safety patrol.";
}

function buildHazardAssessment(finding: SafetyFindingRow): string {
  if (finding.issues.length) {
    return finding.issues.slice(0, 3).join(" ");
  }
  if ((finding.missingHardhats ?? 0) > 0 || (finding.missingVests ?? 0) > 0) {
    return "Personnel exposure identified with incomplete PPE. This increases severity of injury in the event of falling objects, slips, or plant movement.";
  }
  return `Automated assessment classified this zone as ${finding.riskLevel} risk based on visual scene complexity, workforce presence, and temporary works configuration.`;
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
      `Close out ${data.summary.openIncidents} open incident${data.summary.openIncidents === 1 ? "" : "s"} with documented root cause and corrective measures.`,
    );
  }

  if (!actions.length && data.summary.elevatedReports > 0) {
    actions.push(
      "Conduct targeted safety walk-downs at hotspot cameras identified in this report within the next working shift.",
      "Brief trade foremen on housekeeping, PPE, and access-route discipline in active scaffold and wet-work areas.",
    );
  }

  if (!actions.length) {
    actions.push("Maintain current control measures and continue scheduled vision-based monitoring.");
  }

  return unique(actions).slice(0, 8);
}

function buildManagementRecommendations(data: SafetyReportData, overall: string): string[] {
  const recs = [
    "Ensure each elevated finding is assigned an owner, target date, and verification method (walk-down or photo confirmation).",
    "Integrate AI vision alerts into the daily coordination meeting so foremen can respond before conditions escalate.",
  ];

  if (data.summary.totalMissingHardhats > 0 || data.summary.totalMissingVests > 0) {
    recs.unshift(
      "Implement a zero-tolerance PPE checkpoint at zone entry points until compliance stabilises for three consecutive shifts.",
    );
  }

  if (overall === "High" || overall === "Critical") {
    recs.unshift(
      "Consider temporary increase in safety patrol frequency and restrict concurrent activities in the highest-risk zones until controls are verified.",
    );
  }

  if (data.summary.camerasReporting < 10) {
    recs.push("Review camera uptime and edge connectivity to ensure surveillance coverage meets the project safety plan.");
  }

  return recs.slice(0, 6);
}

function buildExecutiveSummary(data: SafetyReportData, overall: string): string[] {
  const period = periodLabel(data.period);
  const hotspots = summarizeHotspots(data);

  const paragraphs: string[] = [
    `This ${period} safety report covers ${data.projectName} for the period ${fmtDate(data.rangeStart)} to ${fmtDate(data.rangeEnd)}. The assessment is based on ${data.summary.analysisReports} automated vision inspections across ${data.summary.camerasReporting} active camera zones, supplemented by formal incident records within the AXON Vision Central Monitoring Platform.`,
    `Overall site risk for the period is assessed as ${overall}. ${data.summary.totalIncidents} formal safety incident${data.summary.totalIncidents === 1 ? "" : "s"} ${data.summary.totalIncidents === 1 ? "was" : "were"} logged, with ${data.summary.openIncidents} remaining open. Vision analytics flagged ${data.summary.elevatedReports} elevated assessment${data.summary.elevatedReports === 1 ? "" : "s"} requiring supervisory review.`,
  ];

  if (hotspots.length) {
    paragraphs.push(
      `Areas receiving the most frequent elevated readings were: ${hotspots.join("; ")}. These locations should be prioritised for walk-down inspections and foreman engagement.`,
    );
  } else if (data.summary.totalIncidents === 0 && data.summary.elevatedReports === 0) {
    paragraphs.push(
      "No elevated hazards or formal incidents were recorded during the period. Site conditions within monitored areas remained consistent with approved method statements and safety plans.",
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
      return "Critical risk rating is assigned due to confirmed high-severity incidents or conditions presenting immediate danger to personnel. Emergency controls and management notification are required.";
    case "High":
      return "High risk rating reflects significant unresolved hazards or repeat elevated readings. Management intervention and accelerated corrective action are required within 24 hours.";
    case "Medium":
      return `Medium risk rating reflects ${elevatedPct}% of inspections returning elevated results. While no immediate stop-work condition is confirmed across all zones, targeted supervision and corrective walk-downs are necessary.`;
    default:
      return "Low risk rating indicates that monitored areas operated within acceptable safety tolerances during the reporting period, with no critical unresolved conditions identified.";
  }
}

export function composeProfessionalSafetyNarrative(data: SafetyReportData): ProfessionalSafetyNarrative {
  const overall = maxRisk(data);
  const stamp = data.generatedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const priorityFindings = buildPriorityFindings(data);

  const incidentReview =
    data.incidents.length === 0
      ? [
          "No formal safety incidents were registered during this reporting period. This indicates either effective control measures or under-reporting; supervisors should continue to encourage near-miss reporting.",
        ]
      : data.incidents.map(
          (incident) =>
            `[${incident.riskLevel}] ${incident.type} at ${incident.cameraName} (${incident.zoneName}) on ${incident.detectedAt.toLocaleString("en-GB")}. Status: ${incident.status}. ${incident.description ?? incident.reasoning ?? "Investigation and corrective action documentation required."}`,
        );

  const surveillanceSummary = [
    `${data.summary.camerasReporting} camera zones transmitted analysis data during the period.`,
    `Risk distribution across all inspections: Low ${data.riskBreakdown.Low ?? 0}, Medium ${data.riskBreakdown.Medium ?? 0}, High ${data.riskBreakdown.High ?? 0}, Critical ${data.riskBreakdown.Critical ?? 0}.`,
    data.cameraActivity.length
      ? `Highest inspection volume was recorded at ${data.cameraActivity.slice(0, 3).map((c) => c.cameraName).join(", ")}.`
      : "No camera activity was recorded.",
  ];

  return {
    reportReference: `AXON/SAF/${stamp}/${data.period.toUpperCase()}`,
    preparedBy: "Site Safety Officer (AI-assisted CMP Report)",
    overallRiskRating: overall,
    overallRiskStatement: buildOverallRiskStatement(overall, data),
    executiveSummary: buildExecutiveSummary(data, overall),
    scopeAndMethod: [
      "This report is prepared in accordance with routine construction site safety monitoring practice, using continuous AI-assisted vision analytics from fixed CCTV / edge camera positions.",
      "Observations are generated from structured safety analysis (construction, fire, property security, and PPE categories) and reviewed for elevated risk classifications before inclusion in this report.",
      "This document is intended to support site management, safety officers, and contractors in prioritising walk-down inspections, toolbox talks, and corrective actions.",
    ],
    keyObservations: [
      data.summary.totalMissingHardhats + data.summary.totalMissingVests > 0
        ? "PPE compliance gaps were detected and must be addressed through immediate supervisory intervention."
        : "No quantified PPE non-compliance was detected, but visual monitoring of active zones should continue.",
      data.summary.elevatedReports > 0
        ? `${data.summary.elevatedReports} zone inspections returned medium or higher risk classifications and have been listed for follow-up.`
        : "No medium-or-above automated risk classifications were recorded during the period.",
      data.summary.openIncidents > 0
        ? `${data.summary.openIncidents} incident(s) remain open and require closure with root-cause analysis.`
        : "Incident register status is clear for the reporting period.",
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
        ? "Based on the evidence reviewed, the site may continue operations under existing controls, with continued vision monitoring and routine safety patrols."
        : "Based on the evidence reviewed, enhanced supervision is required in the zones identified above until corrective actions are verified and documented.",
      "This report should be read alongside the project Safety Plan, method statements, and permit-to-work records. It does not replace physical inspection or statutory reporting obligations.",
    ],
  };
}
