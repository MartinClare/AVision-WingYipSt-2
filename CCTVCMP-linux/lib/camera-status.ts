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

/**
 * Parse a camera name like "F1 / 1", "F13 / 2", "ROOF / 4", "G / 1"
 * into a [floorOrder, camNum] tuple for sorting.
 *   B = -1, G = 0, F1–F13 = 1–13, ROOF = 99
 */
export function parseCameraFloorOrder(name: string): [number, number] {
  const m = name.match(/^([A-Za-z]+)(\d*)\s*[/\-_ ]?\s*(\d+)/);
  if (!m) return [999, 999];
  const prefix = m[1].toUpperCase();
  const floorNum =
    prefix === "B"    ? -1 :
    prefix === "G"    ?  0 :
    prefix === "F"    ? parseInt(m[2] || "0", 10) :
    prefix === "ROOF" ? 99 : 999;
  const camNum = parseInt(m[3] || "0", 10);
  return [floorNum, camNum];
}

/** Sort an array of objects with a `name` field by floor then camera number (ascending). */
export function sortByFloor<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const [af, ac] = parseCameraFloorOrder(a.name);
    const [bf, bc] = parseCameraFloorOrder(b.name);
    return af !== bf ? af - bf : ac - bc;
  });
}

/** Extract floor label from a camera name, e.g. "F1 / 2" → "F1", "ROOF / 4" → "ROOF" */
export function floorLabel(name: string): string {
  return name.split(/[\s/]/)[0].trim().toUpperCase();
}

/** Human-readable floor heading */
export function floorHeading(label: string): string {
  if (label === "ROOF") return "Roof";
  if (label === "G")    return "Ground Floor";
  if (label === "B")    return "Basement";
  if (label.startsWith("F")) return `Floor ${label.slice(1)}`;
  return label;
}

const SYNTHETIC_CAMERA_PREFIXES = ["heartbeat-probe"];

export function isSyntheticEdgeCamera(camera: {
  name?: string | null;
  edgeCameraId?: string | null;
}) {
  const candidates = [camera.name, camera.edgeCameraId]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());

  return candidates.some(
    (value) =>
      SYNTHETIC_CAMERA_PREFIXES.some((prefix) => value.startsWith(prefix))
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
