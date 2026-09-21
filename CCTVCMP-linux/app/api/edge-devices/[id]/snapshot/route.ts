import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { join } from "path";

const IMAGE_DIR = process.env.IMAGE_STORAGE_PATH ?? join(process.cwd(), "..", "data", "images");

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return new NextResponse(null, { status: 401 });

  const camera = await prisma.camera.findUnique({
    where: { id: context.params.id },
    select: { id: true },
  });
  if (!camera) return new NextResponse(null, { status: 404 });

  // Find the latest report that has an image (disk or DB)
  const report = await prisma.edgeReport.findFirst({
    where: {
      cameraId: camera.id,
      eventImageIncluded: true,
    },
    orderBy: { receivedAt: "desc" },
    select: { id: true, eventImageMimeType: true, eventImageData: true },
  });

  let imageId: string | null = null;
  let mimeType = "image/jpeg";
  let dbBlob: Uint8Array | null = null;

  if (report) {
    imageId = report.id;
    mimeType = report.eventImageMimeType ?? mimeType;
    dbBlob = report.eventImageData ? new Uint8Array(report.eventImageData) : null;
  } else {
    // Fall back to archived reports: retention moves old rows to
    // edge_reports_archive, but image files persist on disk.
    const archived = await prisma.$queryRaw<
      Array<{ id: string; event_image_mime_type: string | null }>
    >`
      SELECT id, event_image_mime_type
      FROM edge_reports_archive
      WHERE camera_id = ${camera.id} AND event_image_included
      ORDER BY received_at DESC
      LIMIT 1
    `;
    if (archived[0]) {
      imageId = archived[0].id;
      mimeType = archived[0].event_image_mime_type ?? mimeType;
    }
  }

  if (!imageId) return new NextResponse(null, { status: 204 });

  const headers = {
    "Content-Type": mimeType,
    "Cache-Control": "no-store, max-age=0",
  };

  // 1. Try disk first (new storage)
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const filePath = join(IMAGE_DIR, `${imageId}.${ext}`);
  try {
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, { status: 200, headers });
  } catch {
    // 2. Fall back to DB blob for old records
    if (dbBlob) {
      return new NextResponse(dbBlob, { status: 200, headers });
    }
  }

  return new NextResponse(null, { status: 204 });
}
