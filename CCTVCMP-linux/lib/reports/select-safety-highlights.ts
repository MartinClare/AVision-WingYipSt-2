import { readFile } from "fs/promises";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import type {
  EvidenceStatus,
  HighlightGroup,
  PhotoValidationTrace,
  SafetyHighlight,
  ThemeSummary,
  UnverifiedObservation,
} from "./safety-report-types";

const IMAGE_DIR = process.env.IMAGE_STORAGE_PATH ?? join(process.cwd(), "..", "data", "images");
const MAX_HIGHLIGHTS = 5;
const MIN_CONFIDENCE = 0.55;
const DUPLICATE_HAMMING_THRESHOLD = 6;
const FALSE_POSITIVE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const FALL_KEYWORDS = ["fall", "height", "scaffold", "ladder", "tripping", "slip", "edge"];
const FIRE_KEYWORDS = ["fire", "flame", "burning"];
const SMOKE_KEYWORDS = ["smoke", "smoking", "haze"];
const INTRUSION_KEYWORDS = ["intrusion", "unauthorized", "restricted", "trespass"];
const MACHINERY_KEYWORDS = ["machinery", "equipment", "vehicle", "heavy equipment", "plant"];
const HOUSEKEEPING_KEYWORDS = ["housekeeping", "cable", "walkway", "clutter", "trip", "wet floor", "material"];

type CategoryBlock = {
  summary: string;
  issues: string[];
  recommendations: string[];
};

type ClassificationHit = {
  type: string;
  detected: boolean;
  confidence: number;
  reasoning?: string;
};

type ReportCandidate = {
  id: string;
  cameraId: string;
  edgeCameraId: string;
  cameraName: string;
  overallRiskLevel: string;
  cmpRiskLevel: string | null;
  overallDescription: string;
  missingHardhats: number | null;
  missingVests: number | null;
  constructionSafety: CategoryBlock;
  fireSafety: CategoryBlock;
  propertySecurity: CategoryBlock;
  classificationJson: unknown;
  visionVerificationJson: unknown;
  eventImagePath: string | null;
  eventImageMimeType: string | null;
  eventImageData: Buffer | null;
  receivedAt: Date;
};

export type EvidenceAggregation = {
  themeSummaries: ThemeSummary[];
  highlights: SafetyHighlight[];
  unverifiedObservations: UnverifiedObservation[];
};

function normalizeRisk(value: string | null | undefined): string {
  if (!value) return "Low";
  const s = value.trim();
  if (!s) return "Low";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function effectiveRisk(overall: string, cmp: string | null | undefined): string {
  const order = ["Low", "Medium", "High", "Critical"];
  const cmpNorm = normalizeRisk(cmp);
  const overallNorm = normalizeRisk(overall);
  return order.indexOf(cmpNorm) >= order.indexOf(overallNorm) ? cmpNorm : overallNorm;
}

function isElevated(risk: string): boolean {
  return ["medium", "high", "critical"].includes(risk.toLowerCase());
}

function coerceCategory(raw: unknown): CategoryBlock {
  if (!raw || typeof raw !== "object") return { summary: "", issues: [], recommendations: [] };
  const o = raw as Record<string, unknown>;
  return {
    summary: typeof o.summary === "string" ? o.summary : "",
    issues: Array.isArray(o.issues) ? o.issues.filter((x): x is string => typeof x === "string") : [],
    recommendations: Array.isArray(o.recommendations)
      ? o.recommendations.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function textBlob(report: ReportCandidate): string {
  return [
    report.overallDescription,
    report.constructionSafety.summary,
    ...report.constructionSafety.issues,
    report.fireSafety.summary,
    ...report.fireSafety.issues,
    report.propertySecurity.summary,
    ...report.propertySecurity.issues,
  ]
    .join(" ")
    .toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function extractClassifications(raw: unknown): ClassificationHit[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.classifications)
    ? o.classifications
    : Array.isArray(o.visionClassifications)
      ? o.visionClassifications
      : [];
  const hits: ClassificationHit[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.type !== "string") continue;
    hits.push({
      type: row.type,
      detected: Boolean(row.detected),
      confidence: typeof row.confidence === "number" ? row.confidence : 0,
      reasoning: typeof row.reasoning === "string" ? row.reasoning : undefined,
    });
  }
  return hits;
}

function classifyGroup(report: ReportCandidate): HighlightGroup | null {
  const missingHardhats = report.missingHardhats ?? 0;
  const missingVests = report.missingVests ?? 0;
  const blob = textBlob(report);
  const edgeHits = extractClassifications(report.classificationJson).filter((h) => h.detected);
  const types = new Set(edgeHits.map((h) => h.type));

  if (types.has("ppe_violation") || missingHardhats > 0 || missingVests > 0) return "ppe";
  if (types.has("fall_risk") || containsAny(blob, FALL_KEYWORDS)) return "work_at_height";
  if (types.has("machinery_hazard") || containsAny(blob, MACHINERY_KEYWORDS)) return "machinery";
  if (
    types.has("fire_detected") ||
    types.has("smoke_detected") ||
    types.has("smoking") ||
    containsAny(blob, FIRE_KEYWORDS) ||
    containsAny(blob, SMOKE_KEYWORDS)
  ) {
    return "fire_smoke";
  }
  if (types.has("restricted_zone_entry") || containsAny(blob, INTRUSION_KEYWORDS)) {
    return "restricted_area";
  }
  if (containsAny(blob, HOUSEKEEPING_KEYWORDS) || report.constructionSafety.issues.length > 0) {
    return "access_housekeeping";
  }

  // Elevated with description but no clear theme — treat as housekeeping/access.
  if (isElevated(effectiveRisk(report.overallRiskLevel, report.cmpRiskLevel)) && report.overallDescription.trim()) {
    return "access_housekeeping";
  }
  return null;
}

function groupLabel(group: HighlightGroup): string {
  switch (group) {
    case "ppe":
      return "PPE usage";
    case "work_at_height":
      return "Work at height";
    case "machinery":
      return "Machinery and plant";
    case "fire_smoke":
      return "Fire / smoke conditions";
    case "restricted_area":
      return "Access control";
    default:
      return "Access and housekeeping";
  }
}

function groupHeading(group: HighlightGroup, location: string): string {
  return `${groupLabel(group)} observation at ${location}`;
}

function latinRatio(text: string): number {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(/[\u3400-\u9FFF]/g) ?? []).length;
  if (latin + cjk === 0) return text.trim() ? 0.5 : 0;
  return latin / (latin + cjk);
}

function preferReadableText(...candidates: Array<string | null | undefined>): string {
  const cleaned = candidates
    .map((value) => (value ?? "").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 12)
    .map((value) => {
      // Prefer the English segment when mixed bilingual text is joined by " | ".
      const parts = value
        .split(/\s\|\s/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        return parts.sort((a, b) => latinRatio(b) - latinRatio(a))[0] ?? value;
      }
      return value;
    });

  if (!cleaned.length) return "";
  cleaned.sort((a, b) => latinRatio(b) - latinRatio(a) || b.length - a.length);
  const best = cleaned[0];
  return best.endsWith(".") || best.endsWith("。") ? best : `${best}.`;
}

function visionSummary(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  return typeof o.summary === "string" ? o.summary : "";
}

function classificationReasoning(raw: unknown, types: string[]): string {
  const hits = extractClassifications(raw).filter((hit) => hit.detected && types.includes(hit.type));
  return hits.map((hit) => hit.reasoning ?? "").find((text) => text.trim()) ?? "";
}

function groupIncidentTypes(group: HighlightGroup): string[] {
  switch (group) {
    case "ppe":
      return ["ppe_violation"];
    case "work_at_height":
      return ["fall_risk"];
    case "machinery":
      return ["machinery_hazard"];
    case "fire_smoke":
      return ["fire_detected", "smoke_detected", "smoking"];
    case "restricted_area":
      return ["restricted_zone_entry"];
    default:
      return [];
  }
}

function buildObservation(report: ReportCandidate, group: HighlightGroup): string {
  const category =
    group === "fire_smoke"
      ? report.fireSafety
      : group === "restricted_area"
        ? report.propertySecurity
        : report.constructionSafety;

  const types = groupIncidentTypes(group);
  const preferred = preferReadableText(
    visionSummary(report.visionVerificationJson),
    classificationReasoning(report.classificationJson, types),
    classificationReasoning(report.visionVerificationJson, types),
    report.overallDescription,
    category.summary,
    ...category.issues.slice(0, 2),
  );

  if (preferred && latinRatio(preferred) >= 0.45) return preferred;

  // Fall back to a concise English management sentence when source text is Chinese-only.
  if (group === "ppe") {
    const missing: string[] = [];
    if ((report.missingHardhats ?? 0) > 0) missing.push("hard hat");
    if ((report.missingVests ?? 0) > 0) missing.push("high-visibility vest");
    if (missing.length) {
      return `Camera review at ${report.cameraName} showed incomplete PPE use (${missing.join(" and ")}).`;
    }
  }

  if (preferred) return preferred;
  return `An elevated condition related to ${groupLabel(group).toLowerCase()} was reviewed at ${report.cameraName}.`;
}

function buildConsideration(group: HighlightGroup): string {
  switch (group) {
    case "ppe":
      return "Incomplete PPE may increase injury severity if an unexpected event occurs in an active work zone.";
    case "work_at_height":
      return "Conditions around elevated work areas may deserve attention to maintain fall-protection discipline.";
    case "machinery":
      return "Closer attention to pedestrian and plant separation can reduce the chance of contact events.";
    case "fire_smoke":
      return "Visible haze or smoke-like conditions should be reviewed promptly so genuine fire risks are not overlooked.";
    case "restricted_area":
      return "Clear access control helps keep personnel away from areas that are temporarily closed for safety.";
    default:
      return "Maintaining clear access routes and orderly material storage supports safer site movement.";
  }
}

function buildImprovement(group: HighlightGroup): string {
  switch (group) {
    case "ppe":
      return "Reposition PPE reminder signage at the nearest access point and include a short supervisor check before crews enter the zone.";
    case "work_at_height":
      return "Arrange a short walk-down of the elevated work area to confirm edge protection and ladder/scaffold setup remain in good order.";
    case "machinery":
      return "Review pedestrian routes near plant movement and reinforce banksman / exclusion-zone arrangements for the next shift.";
    case "fire_smoke":
      return "Confirm housekeeping and hot-work controls in the reviewed area, and verify firefighting equipment remains accessible.";
    case "restricted_area":
      return "Check barrier placement and access notices so temporary restricted zones remain clearly marked.";
    default:
      return "Improve housekeeping and walkway marking so materials do not obstruct safe site circulation.";
  }
}

async function loadImageBytes(
  reportId: string,
  mimeType: string | null,
  blob: Buffer | null,
): Promise<Buffer | null> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  try {
    return await readFile(join(IMAGE_DIR, `${reportId}.${ext}`));
  } catch {
    return blob ? Buffer.from(blob) : null;
  }
}

export function perceptualHash(bytes: Buffer): number {
  const samples = 32;
  const stride = Math.max(1, Math.floor(bytes.length / samples));
  const values: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    values.push(bytes[Math.min(bytes.length - 1, i * stride)] ?? 0);
  }
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  let hash = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] >= avg) hash = (hash | (1 << i)) >>> 0;
  }
  return hash;
}

export function hammingDistance(a: number, b: number): number {
  let x = (a ^ b) >>> 0;
  let count = 0;
  while (x !== 0) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

function imageQualityOk(bytes: Buffer): boolean {
  return bytes.length >= 8_000 && bytes.length <= 8_000_000;
}

function isKnownFalsePositivePattern(cameraName: string, group: HighlightGroup): boolean {
  // Permanent background misread on lan_cam_04 fire/smoke — keep out of confirmed findings.
  return group === "fire_smoke" && /lan_cam_04/i.test(cameraName);
}

function agreementForGroup(
  report: ReportCandidate,
  group: HighlightGroup,
): { edgeAgreed: boolean; cmpAgreed: boolean; confidence: number; matchingType: string | null } {
  const typeMap: Record<HighlightGroup, string[]> = {
    ppe: ["ppe_violation"],
    work_at_height: ["fall_risk"],
    machinery: ["machinery_hazard"],
    fire_smoke: ["fire_detected", "smoke_detected", "smoking"],
    restricted_area: ["restricted_zone_entry"],
    access_housekeeping: [],
  };

  const edgeHits = extractClassifications(report.classificationJson).filter((h) => h.detected);
  const visionHits = extractClassifications(report.visionVerificationJson).filter((h) => h.detected);
  const wanted = typeMap[group];

  if (!wanted.length) {
    // Theme from category text only — treat structured text as edge agreement.
    const hasText =
      report.constructionSafety.issues.length > 0 ||
      report.fireSafety.issues.length > 0 ||
      report.propertySecurity.issues.length > 0 ||
      Boolean(report.overallDescription.trim());
    return {
      edgeAgreed: hasText,
      cmpAgreed: false,
      confidence: hasText ? 0.6 : 0,
      matchingType: null,
    };
  }

  const edgeHit = edgeHits.find((h) => wanted.includes(h.type));
  const visionHit = visionHits.find((h) => wanted.includes(h.type));
  return {
    edgeAgreed: Boolean(edgeHit),
    cmpAgreed: Boolean(visionHit),
    confidence: Math.max(edgeHit?.confidence ?? 0, visionHit?.confidence ?? 0),
    matchingType: edgeHit?.type ?? visionHit?.type ?? null,
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function compressConclusions(texts: string[], limit = 3): string[] {
  const cleaned = texts
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => t.length >= 20)
    .filter((t) => latinRatio(t) >= 0.45)
    .filter((t) => !/^text and vision both confirmed\.?$/i.test(t.trim()))
    .map((t) => (t.endsWith(".") ? t : `${t}.`));
  const unique: string[] = [];
  for (const text of cleaned) {
    const key = text.toLowerCase().slice(0, 80);
    if (unique.some((u) => u.toLowerCase().startsWith(key.slice(0, 40)))) continue;
    unique.push(text);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Aggregate structured EdgeReport text into thematic summaries and select
 * photo-supported highlights where the image comes from the same report as the text.
 * Dismissed / known false-positive patterns are returned separately as unverified.
 */
export async function selectSafetyHighlights(
  prisma: PrismaClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<EvidenceAggregation> {
  const [reports, dismissed] = await Promise.all([
    prisma.edgeReport.findMany({
      where: {
        receivedAt: { gte: rangeStart, lte: rangeEnd },
        keepalive: false,
        messageType: { not: "keepalive" },
      },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        cameraId: true,
        edgeCameraId: true,
        cameraName: true,
        overallRiskLevel: true,
        cmpRiskLevel: true,
        overallDescription: true,
        missingHardhats: true,
        missingVests: true,
        constructionSafety: true,
        fireSafety: true,
        propertySecurity: true,
        classificationJson: true,
        visionVerificationJson: true,
        eventImagePath: true,
        eventImageMimeType: true,
        eventImageData: true,
        receivedAt: true,
      },
      // Cap for report generation latency; busiest days have ~1.7k reports.
      take: 2500,
    }),
    prisma.incident.findMany({
      where: {
        status: "dismissed",
        detectedAt: {
          gte: new Date(rangeStart.getTime() - FALSE_POSITIVE_LOOKBACK_MS),
          lte: rangeEnd,
        },
      },
      select: { cameraId: true, type: true },
    }),
  ]);

  const dismissedKeys = new Set(dismissed.map((row) => `${row.cameraId}::${row.type}`));

  const candidates: ReportCandidate[] = reports.map((report) => ({
    id: report.id,
    cameraId: report.cameraId,
    edgeCameraId: report.edgeCameraId,
    cameraName: report.cameraName,
    overallRiskLevel: report.overallRiskLevel,
    cmpRiskLevel: report.cmpRiskLevel,
    overallDescription: report.overallDescription,
    missingHardhats: report.missingHardhats,
    missingVests: report.missingVests,
    constructionSafety: coerceCategory(report.constructionSafety),
    fireSafety: coerceCategory(report.fireSafety),
    propertySecurity: coerceCategory(report.propertySecurity),
    classificationJson: report.classificationJson,
    visionVerificationJson: report.visionVerificationJson,
    eventImagePath: report.eventImagePath,
    eventImageMimeType: report.eventImageMimeType,
    eventImageData: report.eventImageData ? Buffer.from(report.eventImageData) : null,
    receivedAt: report.receivedAt,
  }));

  type ThemeBucket = {
    group: HighlightGroup;
    reports: ReportCandidate[];
    cameras: Set<string>;
    elevatedCount: number;
    conclusions: string[];
    verifiedCount: number;
    unverifiedCount: number;
  };

  const buckets = new Map<HighlightGroup, ThemeBucket>();

  for (const report of candidates) {
    const risk = effectiveRisk(report.overallRiskLevel, report.cmpRiskLevel);
    const group = classifyGroup(report);
    if (!group) continue;
    // Only aggregate elevated / issue-bearing reports into themes.
    const hasIssues =
      report.constructionSafety.issues.length > 0 ||
      report.fireSafety.issues.length > 0 ||
      report.propertySecurity.issues.length > 0 ||
      (report.missingHardhats ?? 0) > 0 ||
      (report.missingVests ?? 0) > 0;
    if (!isElevated(risk) && !hasIssues) continue;

    const agreement = agreementForGroup(report, group);
    const falsePositive = isKnownFalsePositivePattern(report.cameraName, group);
    const dismissedHistory =
      agreement.matchingType != null &&
      dismissedKeys.has(`${report.cameraId}::${agreement.matchingType}`);

    const bucket =
      buckets.get(group) ??
      ({
        group,
        reports: [],
        cameras: new Set<string>(),
        elevatedCount: 0,
        conclusions: [],
        verifiedCount: 0,
        unverifiedCount: 0,
      } satisfies ThemeBucket);

    bucket.reports.push(report);
    bucket.cameras.add(report.cameraName);
    if (isElevated(risk)) bucket.elevatedCount += 1;
    bucket.conclusions.push(buildObservation(report, group));
    if (falsePositive || dismissedHistory || !(agreement.edgeAgreed && agreement.cmpAgreed)) {
      bucket.unverifiedCount += 1;
    } else {
      bucket.verifiedCount += 1;
    }
    buckets.set(group, bucket);
  }

  const themeSummaries: ThemeSummary[] = [];
  const unverifiedObservations: UnverifiedObservation[] = [];

  for (const bucket of buckets.values()) {
    const cameras = uniqueSorted([...bucket.cameras]);
    const recurring = compressConclusions(bucket.conclusions);
    const mostlyUnverified = bucket.unverifiedCount >= bucket.verifiedCount;
    const knownFp = bucket.group === "fire_smoke" && cameras.some((c) => /lan_cam_04/i.test(c));

    const evidenceStatus: EvidenceStatus = knownFp
      ? "dismissed_pattern"
      : mostlyUnverified
        ? "unverified"
        : "confirmed";

    const summary =
      evidenceStatus === "dismissed_pattern"
        ? `${bucket.reports.length} ${groupLabel(bucket.group).toLowerCase()} readings were recorded, largely from a known background false-positive pattern and are not treated as confirmed findings.`
        : evidenceStatus === "unverified"
          ? `${bucket.reports.length} ${groupLabel(bucket.group).toLowerCase()} readings were recorded across ${cameras.length} camera(s), but dual vision confirmation was incomplete or cases were dismissed.`
          : `${bucket.reports.length} ${groupLabel(bucket.group).toLowerCase()} observations were recorded across ${cameras.length} camera(s), with ${bucket.elevatedCount} elevated classifications.`;

    themeSummaries.push({
      group: bucket.group,
      label: groupLabel(bucket.group),
      observationCount: bucket.reports.length,
      cameraCount: cameras.length,
      elevatedCount: bucket.elevatedCount,
      cameras,
      summary,
      recurringConclusions: recurring,
      evidenceStatus,
    });

    if (evidenceStatus !== "confirmed") {
      unverifiedObservations.push({
        group: bucket.group,
        label: groupLabel(bucket.group),
        observationCount: bucket.reports.length,
        cameras,
        summary,
        reason:
          evidenceStatus === "dismissed_pattern"
            ? "Known false-positive camera pattern excluded from confirmed findings."
            : "Dismissed, single-source, or incomplete edge/CMP agreement.",
      });
    }
  }

  themeSummaries.sort((a, b) => b.observationCount - a.observationCount || b.elevatedCount - a.elevatedCount);
  unverifiedObservations.sort((a, b) => b.observationCount - a.observationCount);

  // Build photo-supported highlights from confirmed themes first, then high-quality
  // elevated observations that still have usable text+photo (labelled unverified).
  const highlights: Array<SafetyHighlight & { score: number; hash: number | null }> = [];

  const rankedReports = [...candidates]
    .map((report) => {
      const group = classifyGroup(report);
      if (!group) return null;
      const risk = effectiveRisk(report.overallRiskLevel, report.cmpRiskLevel);
      const agreement = agreementForGroup(report, group);
      const falsePositive = isKnownFalsePositivePattern(report.cameraName, group);
      const dismissedHistory =
        agreement.matchingType != null &&
        dismissedKeys.has(`${report.cameraId}::${agreement.matchingType}`);

      // Never promote known false-positive fire patterns into photo highlights.
      if (falsePositive) return null;

      const dualAgreed =
        agreement.edgeAgreed && agreement.cmpAgreed && agreement.confidence >= MIN_CONFIDENCE;
      const hasIssues =
        report.constructionSafety.issues.length > 0 ||
        report.fireSafety.issues.length > 0 ||
        report.propertySecurity.issues.length > 0 ||
        (report.missingHardhats ?? 0) > 0 ||
        (report.missingVests ?? 0) > 0 ||
        Boolean(report.overallDescription.trim());

      if (!hasIssues && !isElevated(risk)) return null;
      if (!dualAgreed && !(isElevated(risk) && hasIssues)) return null;

      const evidenceStatus: EvidenceStatus =
        dualAgreed && !dismissedHistory ? "confirmed" : "unverified";

      // Prefer confirmed; still allow a few unverified photo-backed examples if no confirmed exist.
      const riskBoost =
        risk === "Critical" ? 40 : risk === "High" ? 30 : risk === "Medium" ? 15 : 5;
      const confirmBoost = evidenceStatus === "confirmed" ? 50 : 0;
      const score = riskBoost + confirmBoost + agreement.confidence * 10;

      return { report, group, agreement, evidenceStatus, dismissedHistory, score, risk };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);

  for (const item of rankedReports) {
    if (highlights.length >= MAX_HIGHLIGHTS) break;

    // Prefer confirmed; only fill remaining slots with unverified if we have fewer than 2 confirmed.
    const confirmedCount = highlights.filter((h) => h.evidenceStatus === "confirmed").length;
    if (item.evidenceStatus !== "confirmed" && confirmedCount >= 2 && highlights.length >= 3) {
      continue;
    }

    // One highlight per camera+group.
    if (
      highlights.some(
        (existing) =>
          existing.cameraName === item.report.cameraName && existing.group === item.group,
      )
    ) {
      continue;
    }

    const imageBytes = await loadImageBytes(
      item.report.id,
      item.report.eventImageMimeType,
      item.report.eventImageData,
    );
    if (!imageBytes || !imageQualityOk(imageBytes)) continue;

    const hash = perceptualHash(imageBytes);
    const duplicateScore = highlights.reduce((best, existing) => {
      if (existing.hash == null) return best;
      return Math.min(best, hammingDistance(hash, existing.hash));
    }, 64);
    if (duplicateScore <= DUPLICATE_HAMMING_THRESHOLD) continue;

    const validation: PhotoValidationTrace = {
      edgeAgreed: item.agreement.edgeAgreed,
      cmpAgreed: item.agreement.cmpAgreed,
      confidence: item.agreement.confidence,
      temporalMatchCount: rankedReports.filter(
        (other) =>
          other.report.id !== item.report.id &&
          other.report.cameraName === item.report.cameraName &&
          other.group === item.group,
      ).length,
      duplicateScore: Number.isFinite(duplicateScore) ? duplicateScore : null,
      eligible: true,
      reasons: [
        item.evidenceStatus === "confirmed" ? "edge_cmp_agreement" : "text_elevated_observation",
        "image_quality_ok",
        "same_report_photo_text",
      ],
    };

    highlights.push({
      id: item.report.id,
      edgeReportId: item.report.id,
      group: item.group,
      heading: groupHeading(item.group, item.report.cameraName),
      location: item.report.cameraName,
      cameraName: item.report.cameraName,
      observedAt: item.report.receivedAt,
      observation: buildObservation(item.report, item.group),
      potentialConsideration: buildConsideration(item.group),
      positiveResponse: null,
      suggestedImprovement: buildImprovement(item.group),
      imagePath: item.report.eventImagePath,
      imageBytes,
      imageMimeType: item.report.eventImageMimeType ?? "image/jpeg",
      evidenceStatus: item.evidenceStatus,
      verified: item.evidenceStatus === "confirmed",
      validation,
      score: item.score,
      hash,
    });
  }

  // Prefer confirmed highlights first in the final list.
  const finalHighlights = highlights
    .sort((a, b) => {
      const av = a.evidenceStatus === "confirmed" ? 1 : 0;
      const bv = b.evidenceStatus === "confirmed" ? 1 : 0;
      if (bv !== av) return bv - av;
      return b.score - a.score;
    })
    .slice(0, MAX_HIGHLIGHTS)
    .map(({ score: _score, hash: _hash, ...highlight }) => highlight);

  return {
    themeSummaries,
    highlights: finalHighlights,
    unverifiedObservations,
  };
}
