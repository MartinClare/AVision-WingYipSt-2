export type ReportPeriod = "daily" | "weekly";

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

export type SafetyReportData = {
  period: ReportPeriod;
  title: string;
  generatedAt: Date;
  rangeStart: Date;
  rangeEnd: Date;
  projectName: string;
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
