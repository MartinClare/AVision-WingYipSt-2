import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { edgeReportSchema } from "@/lib/validations/webhook";
import { enqueueEdgeReportJob } from "@/lib/enqueue-edge-report-job";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const IMAGE_DIR = process.env.IMAGE_STORAGE_PATH ?? join(process.cwd(), "..", "data", "images");

async function saveImageToDisk(reportId: string, bytes: Buffer, mimeType: string): Promise<string> {
  await mkdir(IMAGE_DIR, { recursive: true });
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const filename = `${reportId}.${ext}`;
  await writeFile(join(IMAGE_DIR, filename), bytes);
  return `/api/edge-reports/${reportId}/image`;
}

function getApiKey(request: NextRequest): string | null {
  return request.headers.get("x-api-key") ?? request.headers.get("X-API-Key");
}

function isAnalysisReport(messageType: string, keepalive: boolean): boolean {
  return messageType === "analysis" && !keepalive;
}

function normalizeStreamUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function resolveOrCreateCamera(edgeCameraId: string, cameraName: string, streamUrl: string | null) {
  const camera = await prisma.camera.findUnique({
    where: { edgeCameraId },
    include: { project: true, zone: true },
  });

  if (camera) return camera;

  let project = await prisma.project.findFirst();
  let zone = await prisma.zone.findFirst({ where: { projectId: project?.id } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: "Edge Site", location: "Edge" },
    });
  }
  if (!zone) {
    zone = await prisma.zone.create({
      data: { projectId: project.id, name: "Default", riskLevel: "medium" },
    });
  }

  try {
    return await prisma.camera.create({
      data: {
        name: cameraName || edgeCameraId,
        edgeCameraId,
        streamUrl,
        projectId: project.id,
        zoneId: zone.id,
      },
      include: { project: true, zone: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.camera.findUnique({
        where: { edgeCameraId },
        include: { project: true, zone: true },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

async function parseRequestBody(request: NextRequest): Promise<
  | { ok: true; payload: unknown; image: { bytes: Buffer; mimeType: string } | null }
  | { ok: false; message: string }
> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, message: "Invalid multipart form-data" };
    }

    const payloadField = form.get("payload");
    if (typeof payloadField !== "string" || payloadField.trim() === "") {
      return { ok: false, message: "Missing multipart field: payload" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadField);
    } catch {
      return { ok: false, message: "Invalid JSON in multipart payload field" };
    }

    const imageField = form.get("image");
    const fileCtorAvailable = typeof File !== "undefined";
    const isFileLike =
      !!imageField &&
      typeof imageField === "object" &&
      "arrayBuffer" in imageField &&
      typeof (imageField as { arrayBuffer?: unknown }).arrayBuffer === "function";

    if ((fileCtorAvailable && imageField instanceof File) || isFileLike) {
      const typedImage = imageField as { type?: string; arrayBuffer: () => Promise<ArrayBuffer> };
      const mimeType = typedImage.type || "image/jpeg";
      const bytes = Buffer.from(await typedImage.arrayBuffer());
      return { ok: true, payload, image: { bytes, mimeType } };
    }

    return { ok: true, payload, image: null };
  }

  if (contentType.includes("application/json") || contentType === "") {
    try {
      return { ok: true, payload: await request.json(), image: null };
    } catch {
      return { ok: false, message: "Invalid JSON" };
    }
  }

  return { ok: false, message: "Unsupported Content-Type" };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getApiKey(request);
    const expectedKey = process.env.EDGE_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    request.headers.get("authorization");

    const parsedBody = await parseRequestBody(request);
    if (!parsedBody.ok) {
      return NextResponse.json({ message: parsedBody.message }, { status: 400 });
    }

    const parsed = edgeReportSchema.safeParse(parsedBody.payload);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.flatten() }, { status: 400 });
    }

    const {
      edgeCameraId,
      cameraName,
      streamUrl,
      timestamp,
      messageType,
      keepalive,
      eventImageIncluded,
      analysis,
      deviceStatus,
    } = parsed.data;

    if (eventImageIncluded === true && !parsedBody.image) {
      return NextResponse.json(
        { message: "eventImageIncluded=true but multipart image file is missing" },
        { status: 400 }
      );
    }

    const normalizedStreamUrl = normalizeStreamUrl(streamUrl);
    const camera = await resolveOrCreateCamera(edgeCameraId, cameraName, normalizedStreamUrl);

    let zoneId = camera.zoneId;
    if (!zoneId) {
      const zone =
        (await prisma.zone.findFirst({ where: { projectId: camera.projectId } })) ??
        (await prisma.zone.create({
          data: { projectId: camera.projectId, name: "Default", riskLevel: "medium" },
        }));
      zoneId = zone.id;
      await prisma.camera.update({ where: { id: camera.id }, data: { zoneId } });
    }

    const detectedAt = new Date(timestamp);
    const eventTimestamp = Number.isNaN(detectedAt.getTime()) ? new Date() : detectedAt;
    const fullPayload = {
      edgeCameraId,
      cameraName,
      streamUrl,
      timestamp,
      messageType,
      keepalive,
      eventImageIncluded: eventImageIncluded || !!parsedBody.image,
      analysis: analysis ?? null,
    };
    const edgeReport = await prisma.edgeReport.create({
      data: {
        cameraId: camera.id,
        edgeCameraId,
        cameraName,
        messageType,
        keepalive,
        eventImageIncluded: eventImageIncluded || !!parsedBody.image,
        eventImageMimeType: parsedBody.image?.mimeType ?? null,
        eventTimestamp,
        overallRiskLevel: analysis?.overallRiskLevel ?? "Low",
        overallDescription:
          analysis?.overallDescription ??
          (messageType === "keepalive" || keepalive ? "Keepalive heartbeat" : ""),
        constructionSafety: analysis?.constructionSafety as object | undefined,
        fireSafety: analysis?.fireSafety as object | undefined,
        propertySecurity: analysis?.propertySecurity as object | undefined,
        peopleCount: analysis?.peopleCount ?? null,
        missingHardhats: analysis?.missingHardhats ?? null,
        missingVests: analysis?.missingVests ?? null,
        rawJson: fullPayload as object,
      },
    });

    if (parsedBody.image?.bytes) {
      const imagePath = await saveImageToDisk(
        edgeReport.id,
        parsedBody.image.bytes,
        parsedBody.image.mimeType ?? "image/jpeg"
      );
      await prisma.edgeReport.update({
        where: { id: edgeReport.id },
        data: { eventImagePath: imagePath },
      });
    }

    const cameraStatus = deviceStatus?.streamHealthy === false ? "degraded" : "online";
    await prisma.camera.update({
      where: { id: camera.id },
      data: {
        lastReportAt: new Date(),
        status: cameraStatus,
        streamUrl: normalizedStreamUrl ?? camera.streamUrl,
      },
    });

    // LLM/vision runs in a child process that exits when done — native RAM returns to the OS.
    if (analysis && isAnalysisReport(messageType, keepalive)) {
      enqueueEdgeReportJob(edgeReport.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[webhook] POST /api/webhook/edge-report failed:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
