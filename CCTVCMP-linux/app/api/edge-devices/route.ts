import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { listEdgeDevicesPage } from "@/lib/edge-devices-list";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const offsetRaw = request.nextUrl.searchParams.get("offset");
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const offset = offsetRaw != null ? Number(offsetRaw) : 0;
  const limit = limitRaw != null ? Number(limitRaw) : 12;

  const page = await listEdgeDevicesPage({
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 12,
  });

  return NextResponse.json({ data: page });
}

const createSchema = z.object({
  name: z.string().min(1),
  edgeCameraId: z.string().min(1),
  streamUrl: z.string().trim().min(1).optional(),
  projectId: z.string().min(1),
  zoneId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== Role.admin && user.role !== Role.project_manager) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.camera.findUnique({ where: { edgeCameraId: parsed.data.edgeCameraId } });
  if (existing) {
    return NextResponse.json({ message: "Edge camera ID already registered" }, { status: 409 });
  }

  const camera = await prisma.camera.create({
    data: {
      name: parsed.data.name,
      edgeCameraId: parsed.data.edgeCameraId,
      streamUrl: parsed.data.streamUrl,
      projectId: parsed.data.projectId,
      zoneId: parsed.data.zoneId,
    },
  });

  return NextResponse.json({ data: camera }, { status: 201 });
}
