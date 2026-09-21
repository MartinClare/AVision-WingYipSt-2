/**
 * Split the shared MDVR account fleet between CMP modules.
 *
 * Defaults (iconType from supplier platform):
 *   iconType 6 → tower crane
 *   iconType 2 → mobile machine / 360 CCTV locations
 *
 * Override with comma-separated device ids:
 *   TOWER_CRANE_DEVICE_IDS=020260521002
 *   MOBILE_MACHINE_DEVICE_IDS=020260521001,020260617001
 */

import type { TowerCraneDevice } from "@/lib/tower-crane";

export type MdvrModuleSet = "tower-crane" | "mobile-machine";

/** Friendly default labels for the two 360 / mobile-machine locations. */
export const MOBILE_MACHINE_DEFAULT_NAMES: Record<string, string> = {
  "020260521001": "360 Location 1",
  "020260617001": "360 Location 2",
};

function parseIdList(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

export function getMdvrDeviceIds(module: MdvrModuleSet): Set<string> | null {
  if (module === "tower-crane") {
    return parseIdList(process.env.TOWER_CRANE_DEVICE_IDS);
  }
  return parseIdList(process.env.MOBILE_MACHINE_DEVICE_IDS);
}

export function filterMdvrDevices(
  devices: TowerCraneDevice[],
  module: MdvrModuleSet
): TowerCraneDevice[] {
  const allow = getMdvrDeviceIds(module);
  if (allow) {
    return devices.filter((d) => allow.has(d.deviceId));
  }

  if (module === "tower-crane") {
    return devices.filter((d) => d.iconType === 6);
  }

  // Mobile machine / 360 CCTV locations
  return devices.filter((d) => d.iconType === 2);
}

export function withMobileMachineDefaultNames(
  devices: TowerCraneDevice[]
): TowerCraneDevice[] {
  return devices.map((d) => {
    const fallback = MOBILE_MACHINE_DEFAULT_NAMES[d.deviceId];
    if (!fallback) return d;
    // Keep explicit alias/displayName if already customized away from plate id.
    if (d.displayName && d.displayName !== d.vehiIdno && d.displayName !== d.deviceId) {
      return d;
    }
    return { ...d, displayName: fallback };
  });
}
