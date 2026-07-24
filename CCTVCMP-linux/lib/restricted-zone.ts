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
    id: "f8-ea1",
    name: "F8 / EA1",
    go2rtcSrc: "rz_f8_ea1",
    ip: "192.168.10.59",
  },
];

/** JPEG snapshot URL for live view (HTTP, works through Next rewrite). */
export function buildGo2rtcFrameUrl(src: string): string {
  // Authenticated API proxy (more reliable than next rewrite for browser img).
  return `/api/restricted-zone/frame?src=${encodeURIComponent(src)}`;
}
