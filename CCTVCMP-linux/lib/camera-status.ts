/**
 * Camera online-status constants — single source of truth for both the API
 * and the UI.  Keep the ratio ONLINE_THRESHOLD_MS / heartbeat comfortably
 * large (≥ 10×) so a few missed heartbeats don't flip the camera offline.
 *
 * Edge heartbeat interval (python/app/main.py → _heartbeat_loop):
 *   HEARTBEAT_INTERVAL_SECONDS = 30 s
 *
 * Online window (CMP side):
 *   ONLINE_THRESHOLD_MS = 10 min  →  ratio = 20×
 *
 * A camera is shown as ONLINE when:
 *   CMP server receive time (lastReportAt) < ONLINE_THRESHOLD_MS ago
 *
 * NOTE: lastReportAt is set to new Date() (CMP server clock) on every incoming
 * webhook — never to the edge device's own timestamp — so clock drift on the
 * edge box cannot cause false-offline readings.
 */
export const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

type ParsedCameraName = {
  floorKey: string;
  floorOrder: number;
  camOrder: number;
  camLabel: string;
};

/**
 * Parse display names like:
 *   "F1 / 1", "F1_1", "F8 / EA1", "ROOF / 4", "B / 1", "G / 2"
 */
export function parseCameraName(name: string): ParsedCameraName {
  const cleaned = name.trim();

  const roof = cleaned.match(/^ROOF\s*[/\-_]\s*(.+)$/i);
  if (roof) {
    return {
      floorKey: "ROOF",
      floorOrder: 99,
      camOrder: cameraTokenOrder(roof[1]),
      camLabel: roof[1].trim(),
    };
  }

  const basement = cleaned.match(/^B\s*[/\-_]\s*(.+)$/i);
  if (basement) {
    return {
      floorKey: "B",
      floorOrder: -1,
      camOrder: cameraTokenOrder(basement[1]),
      camLabel: basement[1].trim(),
    };
  }

  const ground = cleaned.match(/^G\s*[/\-_]\s*(.+)$/i);
  if (ground) {
    return {
      floorKey: "G",
      floorOrder: 0,
      camOrder: cameraTokenOrder(ground[1]),
      camLabel: ground[1].trim(),
    };
  }

  const floor = cleaned.match(/^F\s*(\d+)\s*[/\-_]\s*(.+)$/i);
  if (floor) {
    return {
      floorKey: `F${floor[1]}`,
      floorOrder: parseInt(floor[1], 10),
      camOrder: cameraTokenOrder(floor[2]),
      camLabel: floor[2].trim(),
    };
  }

  // Compact forms: F10_3 / F1-2
  const compact = cleaned.match(/^F(\d+)[_\-](.+)$/i);
  if (compact) {
    return {
      floorKey: `F${compact[1]}`,
      floorOrder: parseInt(compact[1], 10),
      camOrder: cameraTokenOrder(compact[2]),
      camLabel: compact[2].trim(),
    };
  }

  return {
    floorKey: cleaned.toUpperCase() || "OTHER",
    floorOrder: 999,
    camOrder: 999,
    camLabel: cleaned,
  };
}

function cameraTokenOrder(token: string): number {
  const trimmed = token.trim();
  // Pure camera numbers (1, 2, 3…) stay in natural order.
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  // Named cams (EA1, etc.) sort after numbered cams on the same floor.
  const digits = trimmed.match(/\d+/);
  const base = digits ? parseInt(digits[0], 10) : trimmed.toUpperCase().charCodeAt(0);
  return 1000 + base;
}

/**
 * Parse a camera name into a [floorOrder, camNum] tuple for sorting.
 *   B = -1, G = 0, F1–F13 = 1–13, ROOF = 99
 */
export function parseCameraFloorOrder(name: string): [number, number] {
  const parsed = parseCameraName(name);
  return [parsed.floorOrder, parsed.camOrder];
}

/** Sort an array of objects with a `name` field by floor then camera number (ascending). */
export function sortByFloor<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const [af, ac] = parseCameraFloorOrder(a.name);
    const [bf, bc] = parseCameraFloorOrder(b.name);
    if (af !== bf) return af - bf;
    if (ac !== bc) return ac - bc;
    return a.name.localeCompare(b.name);
  });
}

/** Extract floor label from a camera name, e.g. "F1 / 2" → "F1", "ROOF / 4" → "ROOF" */
export function floorLabel(name: string): string {
  return parseCameraName(name).floorKey;
}

/** Human-readable floor heading */
export function floorHeading(label: string): string {
  if (label === "ROOF") return "Roof";
  if (label === "G") return "Ground Floor";
  if (label === "B") return "Basement";
  if (/^F\d+$/i.test(label)) return `Floor ${label.slice(1)}`;
  if (label === "OTHER") return "Other";
  return label;
}

/** Short camera label under a floor group, e.g. "F1 / 2" → "Camera 2", "F8 / EA1" → "EA1" */
export function cameraShortLabel(name: string): string {
  const { camLabel } = parseCameraName(name);
  if (/^\d+$/.test(camLabel)) return `Camera ${camLabel}`;
  return camLabel;
}

/** Extract host/IP from an RTSP/HTTP URL without credentials. */
export function cameraHostLabel(streamUrl: string | null | undefined): string | null {
  if (!streamUrl) return null;
  try {
    const normalized = streamUrl.replace(/^rtsp:/i, "http:");
    const host = new URL(normalized).hostname;
    return host || null;
  } catch {
    const match = streamUrl.match(/@([^:/]+)/) || streamUrl.match(/:\/\/([^:/]+)/);
    return match?.[1] ?? null;
  }
}

const SYNTHETIC_CAMERA_PREFIXES = ["heartbeat-probe", "connectivity-test", "curl-test", "spark-"];

export function isSyntheticEdgeCamera(camera: {
  name?: string | null;
  edgeCameraId?: string | null;
}) {
  const candidates = [camera.name, camera.edgeCameraId]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());

  return candidates.some(
    (value) =>
      SYNTHETIC_CAMERA_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
      value.includes("connectivity-test") ||
      value.includes("curl-test"),
  );
}

export function shouldDisplayEdgeCamera(
  camera: {
    name?: string | null;
    edgeCameraId?: string | null;
    streamUrl?: string | null;
    edgeReports: Array<{ messageType: string; keepalive: boolean }>;
  }
) {
  if (isSyntheticEdgeCamera(camera)) return false;

  const hasAnalysisReport = camera.edgeReports.some(
    (report) => !report.keepalive && report.messageType !== "keepalive"
  );

  return Boolean(camera.streamUrl) || hasAnalysisReport;
}
