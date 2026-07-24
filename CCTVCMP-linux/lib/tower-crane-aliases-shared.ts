export type TowerCraneDeviceAlias = {
  /** Custom crane / machine display name */
  name?: string;
  /** Channel index (stringified) → custom name */
  channels?: Record<string, string>;
};

export type TowerCraneAliases = {
  devices: Record<string, TowerCraneDeviceAlias>;
};

export function normalizeTowerCraneAliases(raw: unknown): TowerCraneAliases {
  if (!raw || typeof raw !== "object") return { devices: {} };
  const devices = (raw as { devices?: unknown }).devices;
  if (!devices || typeof devices !== "object") return { devices: {} };

  const out: TowerCraneAliases = { devices: {} };
  for (const [deviceId, value] of Object.entries(devices as Record<string, unknown>)) {
    if (!deviceId || !value || typeof value !== "object") continue;
    const entry = value as TowerCraneDeviceAlias;
    const channels: Record<string, string> = {};
    if (entry.channels && typeof entry.channels === "object") {
      for (const [idx, name] of Object.entries(entry.channels)) {
        if (typeof name === "string" && name.trim()) channels[idx] = name.trim();
      }
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name && Object.keys(channels).length === 0) continue;
    out.devices[deviceId] = {
      ...(name ? { name } : {}),
      ...(Object.keys(channels).length ? { channels } : {}),
    };
  }
  return out;
}

export function applyTowerCraneAliases<
  T extends {
    deviceId: string;
    vehiIdno: string;
    displayName?: string;
    channels: Array<{ index: number; name: string; platformName?: string }>;
  },
>(devices: T[], aliases: TowerCraneAliases): T[] {
  return devices.map((device) => {
    const alias = aliases.devices[device.deviceId];
    const displayName = alias?.name?.trim() || device.vehiIdno;
    const channels = device.channels.map((ch) => {
      const platformName = ch.platformName || ch.name;
      const custom = alias?.channels?.[String(ch.index)]?.trim();
      return {
        ...ch,
        platformName,
        name: custom || platformName,
      };
    });
    return { ...device, displayName, channels };
  });
}

export function upsertDeviceAlias(
  aliases: TowerCraneAliases,
  deviceId: string,
  name: string | null
): TowerCraneAliases {
  const devices = { ...aliases.devices };
  const current = { ...(devices[deviceId] || {}) };
  const trimmed = name?.trim() || "";
  if (trimmed) current.name = trimmed;
  else delete current.name;
  if (!current.name && (!current.channels || Object.keys(current.channels).length === 0)) {
    delete devices[deviceId];
  } else {
    devices[deviceId] = current;
  }
  return { devices };
}

export function upsertChannelAlias(
  aliases: TowerCraneAliases,
  deviceId: string,
  channelIndex: number,
  name: string | null
): TowerCraneAliases {
  const devices = { ...aliases.devices };
  const current = { ...(devices[deviceId] || {}) };
  const channels = { ...(current.channels || {}) };
  const key = String(channelIndex);
  const trimmed = name?.trim() || "";
  if (trimmed) channels[key] = trimmed;
  else delete channels[key];
  if (Object.keys(channels).length) current.channels = channels;
  else delete current.channels;
  if (!current.name && !current.channels) delete devices[deviceId];
  else devices[deviceId] = current;
  return { devices };
}
