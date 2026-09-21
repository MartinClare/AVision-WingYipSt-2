import { readFile } from "fs/promises";
import { join } from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyAnalysis, type Classification, type ClassificationResult } from "@/lib/llm-classifier";
import { evaluateAlarms, ensureDefaultRules } from "@/lib/alarm-engine";
import { verifyWithVision, reconcileClassifications } from "@/lib/vision-verifier";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const IMAGE_DIR = process.env.IMAGE_STORAGE_PATH ?? join(process.cwd(), "..", "data", "images");
const RATE_DIR = process.env.CMP_LLM_RATE_DIR ?? "/tmp/avision-cmp-llm-rate";

const parseSec = (key: string, fallback: number) =>
  Math.max(60, parseInt(process.env[key] ?? String(fallback), 10) || fallback);

const LLM_RATE_LIMIT_MS = parseSec("LLM_RATE_LIMIT_SECONDS", 60) * 1000;
const VISION_RATE_LIMIT_MS = parseSec("VISION_RATE_LIMIT_SECONDS", 120) * 1000;

function deriveCmpRiskLevel(classifications: Classification[]): string {
  const ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const detected = classifications.filter((c) => c.detected);
  if (detected.length === 0) return "Low";
  const top = detected.reduce((best, c) =>
    (ORDER[c.riskLevel] ?? 0) > (ORDER[best.riskLevel] ?? 0) ? c : best
  );
  return top.riskLevel.charAt(0).toUpperCase() + top.riskLevel.slice(1);
}

function ratePath(cameraId: string, kind: "text" | "vision") {
  return join(RATE_DIR, `${cameraId}.${kind}`);
}

function lastRateAt(cameraId: string, kind: "text" | "vision"): number {
  try {
    const raw = readFileSync(ratePath(cameraId, kind), "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function setRateAt(cameraId: string, kind: "text" | "vision", at = Date.now()) {
  mkdirSync(RATE_DIR, { recursive: true });
  writeFileSync(ratePath(cameraId, kind), String(at));
}

async function loadImageFromDisk(
  reportId: string,
  mimeType: string | null
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const mime = mimeType || "image/jpeg";
  const ext = mime === "image/png" ? "png" : "jpg";
  try {
    const bytes = await readFile(join(IMAGE_DIR, `${reportId}.${ext}`));
    return { bytes, mimeType: mime };
  } catch {
    return null;
  }
}

async function propagateLastClassification(
  edgeReportId: string,
  cameraContext: { cameraId: string; projectId: string; zoneId: string },
  detectedAt: Date,
  throttledForMs: number
) {
  const last = await prisma.edgeReport.findFirst({
    where: {
      cameraId: cameraContext.cameraId,
      NOT: { classificationJson: { equals: Prisma.JsonNull } },
      id: { not: edgeReportId },
    },
    orderBy: { receivedAt: "desc" },
    select: { classificationJson: true, cmpRiskLevel: true },
  });

  if (last?.classificationJson && last.cmpRiskLevel) {
    await prisma.edgeReport.update({
      where: { id: edgeReportId },
      data: {
        cmpRiskLevel: last.cmpRiskLevel,
        classificationJson: last.classificationJson,
      },
    });

    const cachedResult = last.classificationJson as Partial<ClassificationResult>;
    if (Array.isArray(cachedResult?.classifications)) {
      await evaluateAlarms(
        {
          classifications: cachedResult.classifications,
          source: cachedResult.source ?? "llm",
          classifierModel: cachedResult.classifierModel ?? undefined,
          visionVerification: cachedResult.visionVerification,
        },
        cameraContext,
        edgeReportId,
        detectedAt
      );
    }

    console.log(
      `[job] Rate-limited camera=${cameraContext.cameraId} (${(throttledForMs / 1000).toFixed(1)}s < ${LLM_RATE_LIMIT_MS / 1000}s min) — propagated last classification (${last.cmpRiskLevel})`
    );
  } else {
    console.log(
      `[job] Rate-limited camera=${cameraContext.cameraId} — no previous classification to propagate yet`
    );
  }
}

export async function processEdgeReportJob(edgeReportId: string): Promise<void> {
  const report = await prisma.edgeReport.findUnique({
    where: { id: edgeReportId },
    include: { camera: true },
  });
  if (!report?.camera) {
    throw new Error(`EdgeReport not found: ${edgeReportId}`);
  }
  if (report.messageType !== "analysis" || report.keepalive) {
    return;
  }

  const camera = report.camera;
  const zoneId = camera.zoneId;
  if (!zoneId) {
    console.warn(`[job] camera ${camera.id} has no zone — skip`);
    return;
  }

  const analysis = {
    overallDescription: report.overallDescription ?? "",
    overallRiskLevel: report.overallRiskLevel ?? "Low",
    constructionSafety: report.constructionSafety,
    fireSafety: report.fireSafety,
    propertySecurity: report.propertySecurity,
    peopleCount: report.peopleCount,
    missingHardhats: report.missingHardhats,
    missingVests: report.missingVests,
  };

  const cameraContext = {
    cameraId: camera.id,
    projectId: camera.projectId,
    zoneId,
  };
  const detectedAt = report.eventTimestamp ?? report.receivedAt ?? new Date();

  await ensureDefaultRules();

  const now = Date.now();
  const timeSinceText = now - lastRateAt(camera.id, "text");
  if (timeSinceText < LLM_RATE_LIMIT_MS) {
    await propagateLastClassification(edgeReportId, cameraContext, detectedAt, timeSinceText);
    return;
  }
  setRateAt(camera.id, "text", now);

  const textClassification = await classifyAnalysis(analysis as Parameters<typeof classifyAnalysis>[0]);
  console.log(
    `[job] LLM text classify camera=${camera.id} source=${textClassification.source} model=${textClassification.classifierModel ?? "fallback"} ` +
      `detected=${textClassification.classifications.filter((c) => c.detected).map((c) => c.type).join(",") || "none"} ` +
      `(last was ${(timeSinceText / 1000).toFixed(1)}s ago)`
  );

  let finalClassification = textClassification;

  const timeSinceVision = now - lastRateAt(camera.id, "vision");
  if (timeSinceVision >= VISION_RATE_LIMIT_MS) {
    const image = await loadImageFromDisk(edgeReportId, report.eventImageMimeType);
    if (image) {
      setRateAt(camera.id, "vision", now);
      const visionResult = await verifyWithVision(image.bytes, image.mimeType, analysis as Parameters<typeof classifyAnalysis>[0]).catch(
        (err) => {
          console.error("[job] Vision verification failed:", err);
          return null;
        }
      );
      if (visionResult) {
        finalClassification = {
          classifications: reconcileClassifications(
            textClassification.classifications,
            visionResult.visionClassifications
          ),
          source: "vision",
          classifierModel: textClassification.classifierModel,
          visionVerification: visionResult,
        };
        console.log(
          `[job] Vision verify camera=${camera.id} accuracy=${visionResult.descriptionAccuracy} ` +
            `missed=${visionResult.missedHazards.length} incorrect=${visionResult.incorrectClaims.length}`
        );
      }
    }
  } else {
    console.log(
      `[job] Vision rate-limited camera=${camera.id} (${(timeSinceVision / 1000).toFixed(1)}s < ${VISION_RATE_LIMIT_MS / 1000}s min)`
    );
  }

  const cmpRiskLevel = deriveCmpRiskLevel(finalClassification.classifications);

  await prisma.edgeReport.update({
    where: { id: edgeReportId },
    data: {
      classificationJson: finalClassification as object,
      cmpRiskLevel,
      visionVerificationJson: finalClassification.visionVerification
        ? (finalClassification.visionVerification as object)
        : undefined,
    },
  });

  await evaluateAlarms(finalClassification, cameraContext, edgeReportId, detectedAt);

  if (process.env.TRANSLATE_EDGE_REPORTS === "1") {
    try {
      const { translateReportToZh } = await import("@/lib/translator");
      const translations = await translateReportToZh({
        overallDescription: analysis.overallDescription ?? "",
        classifications: finalClassification.classifications.map((c) => ({
          type: c.type,
          reasoning: c.reasoning,
        })),
        visionSummary: finalClassification.visionVerification?.summary,
        visionMissedHazards: finalClassification.visionVerification?.missedHazards,
        visionIncorrectClaims: finalClassification.visionVerification?.incorrectClaims,
      });
      await prisma.edgeReport.update({
        where: { id: edgeReportId },
        data: { translationsJson: translations as object },
      });
    } catch (translationErr) {
      console.error("[job] Translation failed for report", edgeReportId, translationErr);
    }
  }
}
