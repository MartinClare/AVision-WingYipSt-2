import { z } from "zod";
import type { HighlightGroup } from "./safety-report-types";

const highlightGroupSchema = z.enum([
  "ppe",
  "work_at_height",
  "machinery",
  "access_housekeeping",
  "fire_smoke",
  "restricted_area",
]);

const prose = z.string().trim().min(12).max(1200);

export const llmDailyNarrativePatchSchema = z.object({
  overviewParagraph: prose.optional(),
  comparisonNote: prose.optional(),
  closingNote: prose.optional(),
  themeSummaries: z
    .array(
      z.object({
        group: highlightGroupSchema,
        summary: prose.optional(),
        recurringConclusions: z.array(prose).max(4).optional(),
      }),
    )
    .max(8)
    .optional(),
  highlights: z
    .array(
      z.object({
        edgeReportId: z.string().min(8).max(64),
        observation: prose.optional(),
        potentialConsideration: prose.optional(),
        suggestedImprovement: prose.optional(),
      }),
    )
    .max(8)
    .optional(),
  improvementSchemes: z
    .array(
      z.object({
        horizon: z.enum(["Immediate", "Short-term", "Ongoing"]),
        theme: z.string().trim().min(3).max(120),
        scheme: prose,
        intendedBenefit: prose,
        suggestedTeam: z.string().trim().min(3).max(120),
      }),
    )
    .max(6)
    .optional(),
  positivePractices: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(120),
        description: prose,
      }),
    )
    .max(5)
    .optional(),
});

export type LlmDailyNarrativePatch = z.infer<typeof llmDailyNarrativePatchSchema>;

/** Compact evidence package sent to the text-only report writer. No images. */
export type ReportWriterEvidencePackage = {
  projectName: string;
  title: string;
  reportingPeriod: {
    start: string;
    end: string;
  };
  dailyStatus: string;
  confidence: string;
  kpis: {
    reviewsCompleted: number;
    camerasReporting: number;
    camerasExpected: number;
    elevatedReports: number;
    noteworthyObservations: number;
    resolvedItems: number;
    itemsRequiringAttention: number;
  };
  comparisonTrend: string;
  themeSummaries: Array<{
    group: HighlightGroup;
    label: string;
    observationCount: number;
    cameraCount: number;
    elevatedCount: number;
    cameras: string[];
    evidenceStatus: string;
    summary: string;
    recurringConclusions: string[];
  }>;
  highlights: Array<{
    edgeReportId: string;
    group: HighlightGroup;
    heading: string;
    cameraName: string;
    observedAt: string;
    evidenceStatus: string;
    observation: string;
    potentialConsideration: string;
    suggestedImprovement: string;
  }>;
  unverifiedObservations: Array<{
    group: HighlightGroup;
    label: string;
    observationCount: number;
    cameras: string[];
    summary: string;
    reason: string;
  }>;
  improvementSchemes: Array<{
    horizon: string;
    theme: string;
    scheme: string;
    intendedBenefit: string;
    suggestedTeam: string;
  }>;
  positivePractices: Array<{
    title: string;
    description: string;
  }>;
  monitoringNotes: string[];
};

export function parseLlmDailyNarrativePatch(raw: unknown): LlmDailyNarrativePatch {
  return llmDailyNarrativePatchSchema.parse(raw);
}
