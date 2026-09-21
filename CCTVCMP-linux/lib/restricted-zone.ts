/**
 * Restricted-zone (限制區域) live CCTV config.
 * Streams are served by go2rtc on the CMP host. Source ids must exist in go2rtc.yaml.
 */

export type RestrictedZoneCamera = {
  id: string;
  name: string;
  /** go2rtc stream name */
  go2rtcSrc: string;
  ip: string;
};

export const RESTRICTED_ZONE_CAMERAS: RestrictedZoneCamera[] = [
  {
    id: "f6-ea",
    name: "F6 / EA",
    go2rtcSrc: "av2_camera35",
    ip: "192.168.10.62",
  },
  {
    id: "f8-ea1",
    name: "F8 / EA1",
    // Must match camera id in app.config.json / go2rtc (edge-cloud regenerates yaml)
    go2rtcSrc: "av2_camera33",
    ip: "192.168.10.59",
  },
  {
    id: "f10-ea-chutaitai",
    name: "F10 / EA 出料台",
    go2rtcSrc: "av2_camera34",
    ip: "192.168.10.58",
  },
];

/** JPEG snapshot URL for live view (HTTP, works through Next rewrite). */
export function buildGo2rtcFrameUrl(src: string): string {
  // Authenticated API proxy (more reliable than next rewrite for browser img).
  return `/api/restricted-zone/frame?src=${encodeURIComponent(src)}`;
}
