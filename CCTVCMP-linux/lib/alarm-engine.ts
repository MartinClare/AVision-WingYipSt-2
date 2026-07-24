import { prisma } from "@/lib/prisma";
import type { ClassificationResult } from "@/lib/llm-classifier";
import type { IncidentRiskLevel, IncidentStatus } from "@prisma/client";
import { dispatchNotifications } from "@/lib/notifications/dispatcher";
import { dispatchMobilePush } from "@/lib/mobile-push/dispatch";
import { readFile } from "fs/promises";
import { join } from "path";

const RISK_ORDER: Record<IncidentRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const IMAGE_DIR = process.env.IMAGE_STORAGE_PATH ?? join(process.cwd(), "..", "data", "images");

/**
 * Incident types prone to static-background false positives (e.g. a permanent
 * reflection, steam vent, or discoloured wall that repeatedly reads as fire/smoke).
 * Repeat alerts for these types whose evidence photo is visually unchanged from
 * the previous alert on the same camera are treated as the same recurring false
 * alarm and are skipped rather than creating another incident. PPE/machinery/people
 * types are intentionally excluded since legitimate repeat violations can look similar.
 */
const IMAGE_DEDUP_TYPES = new Set(["fire_detected", "smoke_detected"]);

/**
 * Fraction (0-1) of sampled byte difference below which two evidence photos are
 * considered "the same scene" (nothing changed since the last alert).
 * Tunable via IMAGE_DEDUP_THRESHOLD env var; clamped to a sane range.
 */
const IMAGE_DEDUP_THRESHOLD = Math.min(
  0.2,
  Math.max(0.005, parseFloat(process.env.IMAGE_DEDUP_THRESHOLD ?? "0.04") || 0.04)
);

/**
 * Lightweight byte-sampling frame comparison — same technique already used by the
 * edge scene-change gate (cloud/src/backgroundLoop.ts). Avoids needing an image
 * decoding dependency; comparing raw JPEG bytes is enough to tell "unchanged static
 * scene" apart from "something moved / changed".
 */
function frameDifferenceScore(prev: Buffer, next: Buffer): number {
  const n = Math.min(prev.length, next.length);
  if (n === 0) return 1;
  const samples = Math.min(2048, n);
  const stride = Math.max(1, Math.floor(n / samples));
  let total = 0;
  let count = 0;
  for (let i = 0; i < n; i += stride) {
    total += Math.abs(prev[i] - next[i]) / 255;
    count++;
  }
  return count > 0 ? total / count : 1;
}

/** Load an edge report's evidence photo bytes (filesystem first, DB blob fallback). */
async function loadEdgeReportImageBytes(edgeReportId: string): Promise<Buffer | null> {
  const report = await prisma.edgeReport.findUnique({
    where: { id: edgeReportId },
    select: { eventImageMimeType: true, eventImageData: true },
  });
  if (!report) return null;

  const mimeType = report.eventImageMimeType || "image/jpeg";
  const ext = mimeType === "image/png" ? "png" : "jpg";
  try {
    return await readFile(join(IMAGE_DIR, `${edgeReportId}.${ext}`));
  } catch {
    return report.eventImageData ? Buffer.from(report.eventImageData) : null;
  }
}

type AlarmResult = {
  created: Array<{ id: string; type: string; riskLevel: string; reasoning: string }>;
  skipped: Array<{ type: string; reason: string }>;
  recordOnly: Array<{ id: string; type: string }>;
};

type CameraContext = {
  cameraId: string;
  projectId: string;
  zoneId: string;
  /** Optional display name — used for known false-positive camera patterns. */
  cameraName?: string | null;
};

/**
 * Cameras with persistent background patterns that repeatedly false-trigger
 * fire/smoke classification (e.g. steam / wall discoloration on lan_cam_04).
 * These still appear in reports as unverified; they must not open user-facing alarms.
 */
function isKnownFireFalsePositiveCamera(cameraName: string | null | undefined): boolean {
  if (!cameraName) return false;
  return /lan_cam_04/i.test(cameraName);
}

/**
 * Evaluate classifications against alarm rules, handle dedup and consecutive hits,
 * create incidents, and dispatch notifications.
 */
export async function evaluateAlarms(
  classification: ClassificationResult,
  camera: CameraContext,
  edgeReportId: string,
  detectedAt: Date,
  currentImageBytes?: Buffer
): Promise<AlarmResult> {
  const result: AlarmResult = { created: [], skipped: [], recordOnly: [] };

  const [rules, systemUser] = await Promise.all([
    prisma.alarmRule.findMany({ where: { enabled: true } }),
    prisma.user.findFirst({ where: { role: "admin" } }),
  ]);
  const ruleMap = new Map(rules.map((r) => [r.incidentType, r]));

  if (!systemUser) {
    console.error("[AlarmEngine] No admin user found for incident logs");
    return result;
  }

  const isCmpVerified = classification.source === "vision";

  // CMP is the final arbiter for user-facing alarms. If a vision-verified result
  // says an issue is not present, dismiss any matching open alarm immediately.
  if (isCmpVerified) {
    for (const cls of classification.classifications.filter((c) => !c.detected)) {
      const openIncidents = await prisma.incident.findMany({
        where: {
          cameraId: camera.cameraId,
          type: cls.type,
          status: { in: ["open", "acknowledged"] as IncidentStatus[] },
        },
        select: { id: true },
      });

      for (const incident of openIncidents) {
        await prisma.incident.update({
          where: { id: incident.id },
          data: {
            status: "dismissed",
            dismissedAt: new Date(),
            logs: {
              create: {
                userId: systemUser.id,
                action: "dismissed",
              },
            },
          },
        });
        result.skipped.push({ type: cls.type, reason: "dismissed_by_cmp_verification" });
      }
    }
  }

  const detected = classification.classifications.filter((c) => c.detected);
  if (detected.length === 0) return result;

  // Resolve camera name once for FP pattern checks when caller did not pass it.
  let cameraName = camera.cameraName ?? null;
  if (!cameraName) {
    const camRow = await prisma.camera.findUnique({
      where: { id: camera.cameraId },
      select: { name: true },
    });
    cameraName = camRow?.name ?? null;
  }

  for (const cls of detected) {
    const rule = ruleMap.get(cls.type);

    if (!rule) {
      result.skipped.push({ type: cls.type, reason: "no_rule" });
      continue;
    }

    // Suppress known static fire/smoke false positives (same pattern as daily reports).
    if (
      (cls.type === "fire_detected" || cls.type === "smoke_detected") &&
      isKnownFireFalsePositiveCamera(cameraName)
    ) {
      result.skipped.push({
        type: cls.type,
        reason: `known_false_positive_camera (${cameraName})`,
      });
      continue;
    }

    if (cls.confidence < rule.minConfidence) {
      result.skipped.push({
        type: cls.type,
        reason: `confidence ${cls.confidence.toFixed(2)} < ${rule.minConfidence}`,
      });
      continue;
    }

    if (RISK_ORDER[cls.riskLevel] < RISK_ORDER[rule.minRiskLevel]) {
      result.skipped.push({
        type: cls.type,
        reason: `risk ${cls.riskLevel} < min ${rule.minRiskLevel}`,
      });
      continue;
    }

    if (rule.consecutiveHits > 1) {
      const windowMs = rule.dedupMinutes * 60 * 1000;
      const since = new Date(detectedAt.getTime() - windowMs);
      const recentReports = await prisma.edgeReport.count({
        where: {
          cameraId: camera.cameraId,
          receivedAt: { gte: since },
        },
      });
      if (recentReports < rule.consecutiveHits) {
        result.skipped.push({
          type: cls.type,
          reason: `consecutive ${recentReports}/${rule.consecutiveHits}`,
        });
        continue;
      }
    }

    const dedupSince = new Date(detectedAt.getTime() - rule.dedupMinutes * 60 * 1000);
    const existing = await prisma.incident.findFirst({
      where: {
        cameraId: camera.cameraId,
        type: cls.type,
        status: { in: ["open", "acknowledged"] as IncidentStatus[] },
        detectedAt: { gte: dedupSince },
      },
    });

    if (existing) {
      result.skipped.push({ type: cls.type, reason: "duplicate" });
      continue;
    }

    if (currentImageBytes && currentImageBytes.length > 0 && IMAGE_DEDUP_TYPES.has(cls.type)) {
      const previousIncident = await prisma.incident.findFirst({
        where: {
          cameraId: camera.cameraId,
          type: cls.type,
          edgeReportId: { not: edgeReportId },
        },
        orderBy: { detectedAt: "desc" },
        select: { edgeReportId: true },
      });

      const previousImageBytes = previousIncident?.edgeReportId
        ? await loadEdgeReportImageBytes(previousIncident.edgeReportId)
        : null;

      if (previousImageBytes) {
        const diffScore = frameDifferenceScore(previousImageBytes, currentImageBytes);
        if (diffScore <= IMAGE_DEDUP_THRESHOLD) {
          result.skipped.push({
            type: cls.type,
            reason: `duplicate_image (diff ${diffScore.toFixed(3)} <= ${IMAGE_DEDUP_THRESHOLD})`,
          });
          continue;
        }
      }
    }

    const incident = await prisma.incident.create({
      data: {
        projectId: camera.projectId,
        cameraId: camera.cameraId,
        zoneId: camera.zoneId,
        edgeReportId,
        type: cls.type,
        riskLevel: cls.riskLevel,
        status: rule.recordOnly ? "record_only" : "open",
        recordOnly: rule.recordOnly,
        reasoning: cls.reasoning,
        detectedAt,
        logs: {
          create: { userId: systemUser.id, action: "created" },
        },
      },
      include: {
        camera: { select: { name: true } },
        zone: { select: { name: true } },
        project: { select: { name: true } },
        edgeReport: {
          select: {
            id: true,
            overallDescription: true,
            classificationJson: true,
            visionVerificationJson: true,
            eventImagePath: true,
            eventImageMimeType: true,
          },
        },
      },
    });

    if (rule.recordOnly) {
      result.recordOnly.push({ id: incident.id, type: cls.type });
    } else {
      result.created.push({
        id: incident.id,
        type: cls.type,
        riskLevel: cls.riskLevel,
        reasoning: cls.reasoning,
      });

      dispatchNotifications(incident).catch((err) =>
        console.error("[AlarmEngine] Notification dispatch error:", err)
      );
      dispatchMobilePush(incident).catch((err) =>
        console.error("[AlarmEngine] Mobile push dispatch error:", err)
      );
    }
  }

  return result;
}

/**
 * Seed default alarm rules if none exist.
 * Called on first webhook or from settings.
 */
/** In-memory cache so we only hit the DB once per server process. */
let _defaultRulesSeeded = false;

export async function ensureDefaultRules(): Promise<void> {
  if (_defaultRulesSeeded) return;
  const count = await prisma.alarmRule.count();
  if (count > 0) {
    _defaultRulesSeeded = true;
    // Still run policy migration in case rules exist but need updating.
    await migrateStrictAlertPolicy();
    return;
  }

  // Only the four high-priority incident types generate active alerts.
  // All other types are seeded as disabled so they don't clutter the UI.
  const defaults: Array<{
    name: string;
    incidentType: string;
    minRiskLevel: IncidentRiskLevel;
    dedupMinutes: number;
    consecutiveHits: number;
    recordOnly: boolean;
    enabled: boolean;
  }> = [
    { name: "PPE Violation (No Hardhat)", incidentType: "ppe_violation",    minRiskLevel: "medium", dedupMinutes: 5, consecutiveHits: 1, recordOnly: false, enabled: true  },
    { name: "Fire / Smoke",               incidentType: "fire_detected",    minRiskLevel: "high", dedupMinutes: 30, consecutiveHits: 2, recordOnly: false, enabled: true  },
    { name: "Machinery Hazard",           incidentType: "machinery_hazard", minRiskLevel: "medium", dedupMinutes: 5, consecutiveHits: 1, recordOnly: false, enabled: true  },
    { name: "Work at Height / Fall Risk", incidentType: "fall_risk",        minRiskLevel: "medium", dedupMinutes: 5, consecutiveHits: 1, recordOnly: false, enabled: true  },
    { name: "Smoking",               incidentType: "smoking",               minRiskLevel: "high", dedupMinutes: 5,  consecutiveHits: 1, recordOnly: false, enabled: true  },
    // Disabled — not raised under the strict alert policy
    { name: "Smoke Detected",        incidentType: "smoke_detected",        minRiskLevel: "high", dedupMinutes: 5,  consecutiveHits: 1, recordOnly: true,  enabled: false },
    { name: "Restricted Zone Entry", incidentType: "restricted_zone_entry", minRiskLevel: "high", dedupMinutes: 10, consecutiveHits: 1, recordOnly: true,  enabled: false },
    { name: "Near Miss",             incidentType: "near_miss",             minRiskLevel: "high", dedupMinutes: 15, consecutiveHits: 2, recordOnly: true,  enabled: false },
  ];

  for (const d of defaults) {
    await prisma.alarmRule.create({
      data: d as Parameters<typeof prisma.alarmRule.create>[0]["data"],
    });
  }

  _defaultRulesSeeded = true;
  console.log("[AlarmEngine] Seeded default alarm rules (strict policy)");
}

/**
 * Enforce the strict alert policy on existing alarm rules.
 *
 * Active (create real incidents):  ppe_violation, fire_detected, machinery_hazard, fall_risk, smoking
 * Disabled (record-only / off):    smoke_detected, restricted_zone_entry, near_miss
 *
 * Only updates rules that still have old defaults — manually customised rules are preserved.
 */
async function migrateStrictAlertPolicy(): Promise<void> {
  const active: Array<{ incidentType: string; name: string }> = [
    { incidentType: "ppe_violation",    name: "PPE Violation (No Hardhat)" },
    { incidentType: "fire_detected",    name: "Fire / Smoke" },
    { incidentType: "machinery_hazard", name: "Machinery Hazard" },
    { incidentType: "fall_risk",        name: "Person Fallen / Injured" },
    { incidentType: "smoking",          name: "Smoking" },
  ];
  const inactive: Array<{ incidentType: string; name: string }> = [
    { incidentType: "smoke_detected",        name: "Smoke Detected" },
    { incidentType: "restricted_zone_entry", name: "Restricted Zone Entry" },
    { incidentType: "near_miss",             name: "Near Miss" },
  ];

  for (const t of active) {
    const rule = await prisma.alarmRule.findFirst({ where: { incidentType: t.incidentType as import("@prisma/client").IncidentType } });
    if (!rule) {
      await prisma.alarmRule.create({
        data: {
          name: t.name, incidentType: t.incidentType, minRiskLevel: "high",
          dedupMinutes: 5, consecutiveHits: 1, recordOnly: false, enabled: true,
        } as Parameters<typeof prisma.alarmRule.create>[0]["data"],
      });
      console.log(`[AlarmEngine] Created active rule: ${t.incidentType}`);
    } else if (!rule.enabled || rule.recordOnly) {
      await prisma.alarmRule.update({
        where: { id: rule.id },
        data: { enabled: true, recordOnly: false, minRiskLevel: "high" },
      });
      console.log(`[AlarmEngine] Activated rule: ${t.incidentType}`);
    }
  }

  for (const t of inactive) {
    const rule = await prisma.alarmRule.findFirst({ where: { incidentType: t.incidentType as import("@prisma/client").IncidentType } });
    if (!rule) {
      await prisma.alarmRule.create({
        data: {
          name: t.name, incidentType: t.incidentType, minRiskLevel: "high",
          dedupMinutes: 5, consecutiveHits: 1, recordOnly: true, enabled: false,
        } as Parameters<typeof prisma.alarmRule.create>[0]["data"],
      });
    } else if (rule.enabled && !rule.recordOnly) {
      await prisma.alarmRule.update({
        where: { id: rule.id },
        data: { enabled: false, recordOnly: true },
      });
      console.log(`[AlarmEngine] Disabled rule: ${t.incidentType}`);
    }
  }
}

/**
 * The three categories that always produce an immediate popup alert in the CMP UI
 * regardless of other alarm-rule settings.
 */
export const CRITICAL_ALERT_TYPES = [
  "ppe_violation",
  "smoking",
  "fire_detected",
  "machinery_hazard",
] as const;

export type CriticalAlertType = typeof CRITICAL_ALERT_TYPES[number];

/**
 * Ensure the four critical-alert rules exist with correct defaults.
 * Safe to call repeatedly; only updates rules whose values still match the
 * *old* (pre-critical) defaults so that manual admin changes are preserved.
 */
export async function migrateCriticalAlertRules(): Promise<void> {
  const targets = [
    { incidentType: "ppe_violation",    name: "PPE Violation",    oldMinRisk: "medium" as IncidentRiskLevel },
    { incidentType: "smoking",          name: "Smoking",          oldMinRisk: "low"    as IncidentRiskLevel },
    { incidentType: "fire_detected",    name: "Fire Detected",    oldMinRisk: "low"    as IncidentRiskLevel },
    { incidentType: "machinery_hazard", name: "Machinery Hazard", oldMinRisk: "medium" as IncidentRiskLevel },
  ];

  for (const t of targets) {
    const rule = await prisma.alarmRule.findFirst({ where: { incidentType: t.incidentType as import("@prisma/client").IncidentType } });
    if (!rule) {
      // Create if missing (handles fresh installs where seeding hasn't run yet)
      await prisma.alarmRule.create({
        data: {
          name: t.name,
          incidentType: t.incidentType,
          minRiskLevel: "high",
          dedupMinutes: 5,
          consecutiveHits: 1,
          recordOnly: false,
        } as Parameters<typeof prisma.alarmRule.create>[0]["data"],
      });
    } else if (rule.minRiskLevel === t.oldMinRisk || rule.recordOnly) {
      // Update only if still at old default (not manually customised)
      await prisma.alarmRule.update({
        where: { id: rule.id },
        data: {
          minRiskLevel: "high",
          dedupMinutes: rule.dedupMinutes === 15 || rule.dedupMinutes === 2 ? 5 : rule.dedupMinutes,
          recordOnly: false,
        },
      });
      console.log(`[AlarmEngine] Migrated critical rule: ${t.incidentType}`);
    }
  }
}
