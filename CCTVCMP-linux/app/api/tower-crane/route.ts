import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  filterMdvrDevices,
  withMobileMachineDefaultNames,
  type MdvrModuleSet,
} from "@/lib/mdvr-device-sets";
import { fetchTowerCraneSnapshot } from "@/lib/tower-crane";

function parseModule(raw: string | null): MdvrModuleSet | null {
  if (raw === "tower-crane" || raw === "mobile-machine") return raw;
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const snapshot = await fetchTowerCraneSnapshot();
  const module = parseModule(request.nextUrl.searchParams.get("module"));
  if (!module) {
    return NextResponse.json({ data: snapshot });
  }

  let devices = filterMdvrDevices(snapshot.devices, module);
  if (module === "mobile-machine") {
    devices = withMobileMachineDefaultNames(devices);
  }

  return NextResponse.json({ data: { ...snapshot, devices } });
}
