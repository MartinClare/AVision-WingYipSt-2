import type {
  HighlightGroup,
  ImprovementSchemeItem,
  NarrativeSource,
  PositivePractice,
  SafetyHighlight,
  SafetyReportData,
  ThemeSummary,
} from "./safety-report-types";
import type { LlmDailyNarrativePatch } from "./llm-daily-narrative-schema";

const ALLOWED_GROUPS = new Set<HighlightGroup>([
  "ppe",
  "work_at_height",
  "machinery",
  "access_housekeeping",
  "fire_smoke",
  "restricted_area",
]);

function clipProse(value: string | undefined, max = 1200): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 12) return undefined;
  return trimmed.slice(0, max);
}

function mergeThemeSummaries(
  existing: ThemeSummary[],
  patch: LlmDailyNarrativePatch["themeSummaries"],
): ThemeSummary[] {
  if (!patch?.length) return existing;
  const byGroup = new Map(patch.map((item) => [item.group, item]));
  return existing.map((theme) => {
    const next = byGroup.get(theme.group);
    if (!next || !ALLOWED_GROUPS.has(theme.group)) return theme;
    const summary = clipProse(next.summary) ?? theme.summary;
    const recurringConclusions = next.recurringConclusions?.length
      ? next.recurringConclusions
          .map((line) => clipProse(line, 400))
          .filter((line): line is string => Boolean(line))
          .slice(0, 4)
      : theme.recurringConclusions;
    return {
      ...theme,
      summary,
      recurringConclusions: recurringConclusions.length ? recurringConclusions : theme.recurringConclusions,
    };
  });
}

function mergeHighlights(
  existing: SafetyHighlight[],
  patch: LlmDailyNarrativePatch["highlights"],
): SafetyHighlight[] {
  if (!patch?.length) return existing;
  const byId = new Map(patch.map((item) => [item.edgeReportId, item]));
  return existing.map((item) => {
    const next = byId.get(item.edgeReportId);
    if (!next) return item;
    return {
      ...item,
      observation: clipProse(next.observation) ?? item.observation,
      potentialConsideration:
        clipProse(next.potentialConsideration) ?? item.potentialConsideration,
      suggestedImprovement: clipProse(next.suggestedImprovement) ?? item.suggestedImprovement,
    };
  });
}

function mergeImprovementSchemes(
  existing: ImprovementSchemeItem[],
  patch: LlmDailyNarrativePatch["improvementSchemes"],
): ImprovementSchemeItem[] {
  if (!patch?.length) return existing;
  const merged: ImprovementSchemeItem[] = [];
  for (const item of patch.slice(0, 6)) {
    const scheme = clipProse(item.scheme);
    const intendedBenefit = clipProse(item.intendedBenefit);
    const theme = item.theme?.trim();
    const suggestedTeam = item.suggestedTeam?.trim();
    if (!scheme || !intendedBenefit || !theme || !suggestedTeam) continue;
    merged.push({
      horizon: item.horizon,
      theme: theme.slice(0, 120),
      scheme,
      intendedBenefit,
      suggestedTeam: suggestedTeam.slice(0, 120),
    });
  }
  return merged.length ? merged : existing;
}

function mergePositivePractices(
  existing: PositivePractice[],
  patch: LlmDailyNarrativePatch["positivePractices"],
): PositivePractice[] {
  if (!patch?.length) return existing;
  const merged: PositivePractice[] = [];
  for (const item of patch.slice(0, 5)) {
    const title = item.title?.trim();
    const description = clipProse(item.description);
    if (!title || !description) continue;
    merged.push({ title: title.slice(0, 120), description });
  }
  return merged.length ? merged : existing;
}

function narrativeSourceNote(source: NarrativeSource, model: string | null): string {
  if (source === "llm") {
    return `Narrative prose was rewritten by the CMP report writer (${model ?? "OpenRouter"}) from the deterministic evidence package; KPIs, camera IDs, dates, photo selection, and confirmation status remain rule-based.`;
  }
  return "Narrative prose used deterministic templates because the LLM writer was skipped or unavailable; KPIs, camera IDs, dates, photo selection, and confirmation status remain rule-based.";
}

/**
 * Apply a validated prose-only patch. Never mutates KPIs, IDs, dates, images, or statuses.
 */
export function applyLlmDailyNarrative(
  data: SafetyReportData,
  patch: LlmDailyNarrativePatch | null,
  meta: { source: NarrativeSource; model: string | null },
): SafetyReportData {
  const methodologyNotes = [
    ...data.methodologyNotes.filter((note) => !note.includes("Narrative prose")),
    narrativeSourceNote(meta.source, meta.model),
  ];

  if (!patch || meta.source !== "llm") {
    return {
      ...data,
      methodologyNotes,
      narrativeSource: "template",
      narrativeModel: null,
    };
  }

  return {
    ...data,
    overviewParagraph: clipProse(patch.overviewParagraph, 1600) ?? data.overviewParagraph,
    comparisonNote: clipProse(patch.comparisonNote) ?? data.comparisonNote,
    closingNote: clipProse(patch.closingNote) ?? data.closingNote,
    themeSummaries: mergeThemeSummaries(data.themeSummaries, patch.themeSummaries),
    highlights: mergeHighlights(data.highlights, patch.highlights),
    improvementSchemes: mergeImprovementSchemes(data.improvementSchemes, patch.improvementSchemes),
    positivePractices: mergePositivePractices(data.positivePractices, patch.positivePractices),
    methodologyNotes,
    narrativeSource: "llm",
    narrativeModel: meta.model,
  };
}
