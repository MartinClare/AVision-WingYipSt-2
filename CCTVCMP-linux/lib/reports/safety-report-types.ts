export type ReportPeriod = "daily" | "weekly";

export type DailySafetyStatus = "Normal" | "Attention Required" | "Priority Attention";

export type ReportConfidence = "Complete" | "Partial";

export type ComparisonTrend = "improved" | "stable" | "needs attention";

export type HighlightGroup =
  | "ppe"
  | "work_at_height"
  | "machinery"
  | "access_housekeeping"
  | "fire_smoke"
  | "restricted_area";

export type EvidenceStatus = "confirmed" | "unverified" | "dismissed_pattern";

export type SafetyCategoryBlock = {
  summary: string;
  issues: string[];
  recommendations: string[];
};

export type SafetyIncidentRow = {
  id: string;
  type: string;
  riskLevel: string;
  status: string;
  detectedAt: Date;
  cameraName: string;
  projectName: string;
  zoneName: string;
  notes: string | null;
  reasoning: string | null;
  description: string | null;
};

export type SafetyFindingRow = {
  id: string;
  cameraName: string;
  edgeCameraId: string;
  riskLevel: string;
  detectedAt: Date;
  description: string;
  peopleCount: number | null;
  missingHardhats: number | null;
  missingVests: number | null;
  constructionSafety: SafetyCategoryBlock;
  fireSafety: SafetyCategoryBlock;
  propertySecurity: SafetyCategoryBlock;
  issues: string[];
};

export type CameraActivityRow = {
  cameraName: string;
  edgeCameraId: string;
  reportCount: number;
  elevatedCount: number;
  lastReportAt: Date | null;
  latestRiskLevel: string | null;
};

export type PhotoValidationTrace = {
  edgeAgreed: boolean;
  cmpAgreed: boolean;
  confidence: number;
  temporalMatchCount: number;
  duplicateScore: number | null;
  eligible: boolean;
  reasons: string[];
};

/** Photo-backed highlight with text and image from the same EdgeReport. */
export type SafetyHighlight = {
  id: string;
  edgeReportId: string;
  group: HighlightGroup;
  heading: string;
  location: string;
  cameraName: string;
  observedAt: Date;
  observation: string;
  potentialConsideration: string;
  positiveResponse: string | null;
  suggestedImprovement: string;
  imagePath: string | null;
  imageBytes: Buffer | null;
  imageMimeType: string | null;
  evidenceStatus: EvidenceStatus;
  /** True only when edge + CMP vision agree and the case is not a dismissed pattern. */
  verified: boolean;
  validation: PhotoValidationTrace;
};

/** Aggregated theme profile for the reporting window. */
export type ThemeSummary = {
  group: HighlightGroup;
  label: string;
  observationCount: number;
  cameraCount: number;
  elevatedCount: number;
  cameras: string[];
  summary: string;
  recurringConclusions: string[];
  evidenceStatus: EvidenceStatus;
};

/** Dismissed / unconfirmed patterns kept separate from confirmed findings. */
export type UnverifiedObservation = {
  group: HighlightGroup;
  label: string;
  observationCount: number;
  cameras: string[];
  summary: string;
  reason: string;
};

export type PositivePractice = {
  title: string;
  description: string;
};

export type ImprovementSchemeItem = {
  horizon: "Immediate" | "Short-term" | "Ongoing";
  theme: string;
  scheme: string;
  intendedBenefit: string;
  suggestedTeam: string;
};

export type MonitoringCoverage = {
  camerasExpected: number;
  camerasReporting: number;
  aiReviewNormal: boolean;
  notes: string[];
  confidence: ReportConfidence;
};

export type DailyOverviewKpis = {
  reviewsCompleted: number;
  camerasReporting: number;
  noteworthyObservations: number;
  resolvedItems: number;
  itemsRequiringAttention: number;
};

/** Whether daily prose came from OpenRouter or deterministic templates. */
export type NarrativeSource = "llm" | "template";

export type SafetyReportData = {
  period: ReportPeriod;
  title: string;
  generatedAt: Date;
  rangeStart: Date;
  rangeEnd: Date;
  projectName: string;
  dailyStatus: DailySafetyStatus;
  overviewParagraph: string;
  kpis: DailyOverviewKpis;
  comparisonTrend: ComparisonTrend;
  comparisonNote: string;
  /** Aggregated text themes across the period. */
  themeSummaries: ThemeSummary[];
  /** Photo-supported highlights — each photo comes from the same EdgeReport as the text. */
  highlights: SafetyHighlight[];
  /** Separate unverified / dismissed AI patterns. */
  unverifiedObservations: UnverifiedObservation[];
  improvementSchemes: ImprovementSchemeItem[];
  positivePractices: PositivePractice[];
  monitoring: MonitoringCoverage;
  methodologyNotes: string[];
  /** Optional LLM-authored closing note; compose falls back if absent. */
  closingNote?: string;
  /** Provenance of prose narrative for methodology disclosure. */
  narrativeSource?: NarrativeSource;
  narrativeModel?: string | null;
  /** Legacy fields retained for weekly reports and internal diagnostics. */
  summary: {
    totalIncidents: number;
    openIncidents: number;
    highCriticalIncidents: number;
    analysisReports: number;
    elevatedReports: number;
    totalMissingHardhats: number;
    totalMissingVests: number;
    camerasReporting: number;
  };
  incidents: SafetyIncidentRow[];
  findings: SafetyFindingRow[];
  cameraActivity: CameraActivityRow[];
  riskBreakdown: Record<string, number>;
};

export type ProfessionalFinding = {
  priority: "Immediate" | "High" | "Medium" | "Monitor";
  location: string;
  observation: string;
  hazardAssessment: string;
  requiredAction: string;
};

export type ProfessionalSafetyNarrative = {
  reportReference: string;
  preparedBy: string;
  overallRiskRating: "Low" | "Medium" | "High" | "Critical";
  overallRiskStatement: string;
  executiveSummary: string[];
  scopeAndMethod: string[];
  keyObservations: string[];
  thematicAssessment: {
    ppe: string;
    construction: string;
    fire: string;
    security: string;
  };
  priorityFindings: ProfessionalFinding[];
  incidentReview: string[];
  correctiveActions: string[];
  managementRecommendations: string[];
  surveillanceSummary: string[];
  conclusion: string[];
};

/** Concise management narrative for the daily 19:00 report. */
export type DailyManagementNarrative = {
  reportReference: string;
  preparedBy: string;
  dailyStatus: DailySafetyStatus;
  overviewParagraph: string;
  kpis: DailyOverviewKpis;
  comparisonNote: string;
  themeSummaries: ThemeSummary[];
  highlights: SafetyHighlight[];
  unverifiedObservations: UnverifiedObservation[];
  improvementSchemes: ImprovementSchemeItem[];
  positivePractices: PositivePractice[];
  monitoringNotes: string[];
  methodologyNotes: string[];
  confidence: ReportConfidence;
  closingNote: string;
  narrativeSource: NarrativeSource;
  narrativeModel: string | null;
};
