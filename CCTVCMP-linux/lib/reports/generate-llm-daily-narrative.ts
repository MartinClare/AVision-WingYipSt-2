import type { SafetyReportData } from "./safety-report-types";
import {
  parseLlmDailyNarrativePatch,
  type LlmDailyNarrativePatch,
  type ReportWriterEvidencePackage,
} from "./llm-daily-narrative-schema";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_REPORT_WRITER_MODEL = "meta-llama/llama-3.3-70b-instruct";

const REPORT_WRITER_TIMEOUT_MS = 75_000;
const REPORT_WRITER_MAX_TOKENS = 2_500;
const EVIDENCE_PAYLOAD_MAX_CHARS = 18_000;

export type GenerateLlmDailyNarrativeResult =
  | {
      ok: true;
      patch: LlmDailyNarrativePatch;
      model: string;
      source: "llm";
    }
  | {
      ok: false;
      reason: string;
      model: string | null;
      source: "template";
    };

function reportWriterModel(): string {
  return process.env.REPORT_WRITER_MODEL?.trim() || DEFAULT_REPORT_WRITER_MODEL;
}

function shouldSkipLlmNarrative(forceSkip = false): boolean {
  if (forceSkip) return true;
  const flag = process.env.SKIP_LLM_NARRATIVE?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function buildReportWriterEvidencePackage(
  data: SafetyReportData,
): ReportWriterEvidencePackage {
  return {
    projectName: data.projectName,
    title: data.title,
    reportingPeriod: {
      start: data.rangeStart.toISOString(),
      end: data.rangeEnd.toISOString(),
    },
    dailyStatus: data.dailyStatus,
    confidence: data.monitoring.confidence,
    kpis: {
      reviewsCompleted: data.kpis.reviewsCompleted,
      camerasReporting: data.kpis.camerasReporting,
      camerasExpected: data.monitoring.camerasExpected,
      elevatedReports: data.summary.elevatedReports,
      noteworthyObservations: data.kpis.noteworthyObservations,
      resolvedItems: data.kpis.resolvedItems,
      itemsRequiringAttention: data.kpis.itemsRequiringAttention,
    },
    comparisonTrend: data.comparisonTrend,
    themeSummaries: data.themeSummaries.map((theme) => ({
      group: theme.group,
      label: theme.label,
      observationCount: theme.observationCount,
      cameraCount: theme.cameraCount,
      elevatedCount: theme.elevatedCount,
      cameras: theme.cameras.slice(0, 12),
      evidenceStatus: theme.evidenceStatus,
      summary: theme.summary,
      recurringConclusions: theme.recurringConclusions.slice(0, 4),
    })),
    highlights: data.highlights.map((item) => ({
      edgeReportId: item.edgeReportId,
      group: item.group,
      heading: item.heading,
      cameraName: item.cameraName,
      observedAt: item.observedAt.toISOString(),
      evidenceStatus: item.evidenceStatus,
      observation: item.observation,
      potentialConsideration: item.potentialConsideration,
      suggestedImprovement: item.suggestedImprovement,
    })),
    unverifiedObservations: data.unverifiedObservations.map((item) => ({
      group: item.group,
      label: item.label,
      observationCount: item.observationCount,
      cameras: item.cameras.slice(0, 12),
      summary: item.summary,
      reason: item.reason,
    })),
    improvementSchemes: data.improvementSchemes.map((item) => ({
      horizon: item.horizon,
      theme: item.theme,
      scheme: item.scheme,
      intendedBenefit: item.intendedBenefit,
      suggestedTeam: item.suggestedTeam,
    })),
    positivePractices: data.positivePractices.map((item) => ({
      title: item.title,
      description: item.description,
    })),
    monitoringNotes: data.monitoring.notes,
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(fenced.slice(start, end + 1));
    }
    throw new Error(`Report writer returned invalid JSON: ${trimmed.slice(0, 200)}`);
  }
}

const SYSTEM_PROMPT = `You write concise English prose for a construction-site daily safety management report.

Return ONLY a JSON object matching this shape (all fields optional; omit unused ones):
{
  "overviewParagraph": string,
  "comparisonNote": string,
  "closingNote": string,
  "themeSummaries": [{ "group": string, "summary": string, "recurringConclusions": string[] }],
  "highlights": [{ "edgeReportId": string, "observation": string, "potentialConsideration": string, "suggestedImprovement": string }],
  "improvementSchemes": [{ "horizon": "Immediate"|"Short-term"|"Ongoing", "theme": string, "scheme": string, "intendedBenefit": string, "suggestedTeam": string }],
  "positivePractices": [{ "title": string, "description": string }]
}

Hard rules:
- Rewrite ONLY narrative prose. Do not invent facts, counts, camera IDs, dates, photos, confirmation status, or new evidence items.
- Use only groups / edgeReportId values present in the evidence package.
- Keep wording management-ready, neutral, and specific to the supplied evidence.
- Do not claim physical inspection occurred.
- Prefer clear site-coordination language over alarmist tone.
- No markdown fences. JSON only.`;

/**
 * One text-only OpenRouter call that produces a validated narrative patch.
 * Never throws for operational failures — returns ok:false so callers can fall back.
 */
export async function generateLlmDailyNarrative(
  data: SafetyReportData,
  options?: { skip?: boolean },
): Promise<GenerateLlmDailyNarrativeResult> {
  const model = reportWriterModel();

  if (data.period !== "daily") {
    return { ok: false, reason: "LLM narrative is only used for daily reports", model: null, source: "template" };
  }
  if (shouldSkipLlmNarrative(options?.skip)) {
    return { ok: false, reason: "SKIP_LLM_NARRATIVE or --skip-llm enabled", model: null, source: "template" };
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "OPENROUTER_API_KEY not set", model: null, source: "template" };
  }

  const evidence = buildReportWriterEvidencePackage(data);
  const evidenceJson = JSON.stringify(evidence);
  if (evidenceJson.length > EVIDENCE_PAYLOAD_MAX_CHARS) {
    return {
      ok: false,
      reason: `Evidence package too large (${evidenceJson.length} chars)`,
      model,
      source: "template",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_WRITER_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://avision.local/cmp",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "AXON Vision CMP Daily Report",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: REPORT_WRITER_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Rewrite the daily safety report narrative from this evidence package. Preserve all facts.\n\n${evidenceJson}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `OpenRouter failed (${res.status}): ${errText.slice(0, 240)}`,
        model,
        source: "template",
      };
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const message = payload.choices?.[0]?.message;
    let raw = "";
    if (typeof message?.content === "string") {
      raw = message.content.trim();
    } else if (Array.isArray(message?.content)) {
      raw = message.content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
    }
    if (!raw) {
      return { ok: false, reason: "Empty model response", model, source: "template" };
    }

    const parsed = extractJsonObject(raw);
    const patch = parseLlmDailyNarrativePatch(parsed);
    return { ok: true, patch, model, source: "llm" };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Timed out after ${REPORT_WRITER_TIMEOUT_MS}ms`
          : error.message
        : String(error);
    return { ok: false, reason, model, source: "template" };
  } finally {
    clearTimeout(timer);
  }
}
