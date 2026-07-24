import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  getTowerCraneAliases,
  setTowerCraneAliases,
  type TowerCraneAliases,
} from "@/lib/tower-crane-aliases";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const aliases = await getTowerCraneAliases();
  return NextResponse.json({ data: aliases });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  if (user.role === "viewer") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const payload =
    body && typeof body === "object" && "devices" in (body as object)
      ? (body as TowerCraneAliases)
      : body && typeof body === "object" && "data" in (body as object)
        ? ((body as { data: TowerCraneAliases }).data as TowerCraneAliases)
        : null;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Expected { devices: { ... } }" }, { status: 400 });
  }

  const aliases = await setTowerCraneAliases(payload);
  return NextResponse.json({ data: aliases });
}
