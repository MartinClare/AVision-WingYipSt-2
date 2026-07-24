/**
 * Persistent display-name aliases for tower-crane devices/channels.
 * Stored as JSON next to other CMP runtime data (survives deploys of app code).
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  normalizeTowerCraneAliases,
  type TowerCraneAliases,
} from "@/lib/tower-crane-aliases-shared";

export type { TowerCraneAliases, TowerCraneDeviceAlias } from "@/lib/tower-crane-aliases-shared";
export {
  applyTowerCraneAliases,
  normalizeTowerCraneAliases,
  upsertChannelAlias,
  upsertDeviceAlias,
} from "@/lib/tower-crane-aliases-shared";

const ALIASES_PATH = join(process.cwd(), "..", "data", "tower-crane-aliases.json");

export async function getTowerCraneAliases(): Promise<TowerCraneAliases> {
  try {
    const raw = await readFile(ALIASES_PATH, "utf8");
    return normalizeTowerCraneAliases(JSON.parse(raw));
  } catch {
    return { devices: {} };
  }
}

export async function setTowerCraneAliases(input: unknown): Promise<TowerCraneAliases> {
  const aliases = normalizeTowerCraneAliases(input);
  await mkdir(dirname(ALIASES_PATH), { recursive: true });
  await writeFile(ALIASES_PATH, JSON.stringify(aliases, null, 2), "utf8");
  return aliases;
}
