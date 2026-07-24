/**
 * Tower crane MDVR client.
 *
 * Uses the same web-monitor APIs as the supplier UI (not Open API vehicle list,
 * which returns empty for this account). Live video uses the web JSESSIONID
 * (same as the supplier H5 player) plus Cmsv6Player with /libcmsv6decode.wasm.
 *
 * Env:
 *   TOWER_CRANE_API_URL   e.g. http://14.21.18.177:88
 *   TOWER_CRANE_ACCOUNT
 *   TOWER_CRANE_PASSWORD
 */

import crypto from "crypto";
import { applyTowerCraneAliases, getTowerCraneAliases } from "@/lib/tower-crane-aliases";

const DEFAULT_TIMEOUT_MS = 20_000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const AES_KEY = Buffer.from("ttx123456Aes1234"); // 16-byte key from platform public.js

export type TowerCraneConfig = {
  baseUrl: string;
  account: string;
  password: string;
  configured: boolean;
};

export type TowerCraneChannel = {
  index: number;
  name: string;
  /** Original MDVR channel label (before CMP alias). */
  platformName: string;
};

export type TowerCraneDevice = {
  vehiId: number;
  vehiIdno: string;
  /** User-facing label (alias or platform plate/id). */
  displayName: string;
  companyId: number | null;
  companyName: string | null;
  iconType: number | null;
  deviceId: string;
  channelCount: number;
  channels: TowerCraneChannel[];
  online: boolean;
  lng: number | null;
  lat: number | null;
  gpsTime: string | null;
  network: number | null;
  heading: number | null;
  videoUrl: string | null;
};

export type TowerCraneSnapshot = {
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  companyName: string | null;
  apiUrl: string | null;
  /** Session used for live video (web JSESSIONID — not Open API jsession). */
  openJsession: string | null;
  mediaHost: string | null;
  mediaPort: number | null;
  error: string | null;
  fetchedAt: string;
  devices: TowerCraneDevice[];
};

type WebSession = {
  cookie: string;
  accountName: string | null;
  companyName: string | null;
  expiresAt: number;
};

type OpenSession = {
  jsession: string;
  expiresAt: number;
};

let webSession: WebSession | null = null;
let openSession: OpenSession | null = null;

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getTowerCraneConfig(): TowerCraneConfig {
  const baseUrl = trimSlash(process.env.TOWER_CRANE_API_URL?.trim() || "");
  const account = process.env.TOWER_CRANE_ACCOUNT?.trim() || "";
  const password = process.env.TOWER_CRANE_PASSWORD ?? "";
  return {
    baseUrl,
    account,
    password,
    configured: Boolean(baseUrl && account && password),
  };
}

function encryptParams(obj: Record<string, unknown>): string {
  const raw = JSON.stringify(obj);
  const cipher = crypto.createCipheriv("aes-128-ecb", AES_KEY, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]).toString("base64");
}

function decryptPayload(b64: string): unknown {
  const decipher = crypto.createDecipheriv("aes-128-ecb", AES_KEY, null);
  decipher.setAutoPadding(true);
  const pt = Buffer.concat([decipher.update(Buffer.from(b64, "base64")), decipher.final()]).toString(
    "utf8"
  );
  return JSON.parse(pt);
}

function mergeCookies(existing: string | null, setCookie: string | null): string {
  const jar = new Map<string, string>();
  if (existing) {
    for (const part of existing.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k && rest.length) jar.set(k, rest.join("="));
    }
  }
  if (setCookie) {
    // Node fetch may join multiple Set-Cookie with ", " which breaks expires dates;
    // for this platform we mainly care about JSESSIONID=...
    const m = setCookie.match(/JSESSIONID=([^;,\s]+)/i);
    if (m) jar.set("JSESSIONID", m[1]);
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function rawFetch(
  url: string,
  init: RequestInit & { cookie?: string | null } = {}
): Promise<{ json: unknown; cookie: string | null; status: number }> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 160)}`);
      }
    }
    const setCookie =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie().join(", ")
        : res.headers.get("set-cookie");
    return { json, cookie: setCookie, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

async function webCall<T>(
  baseUrl: string,
  action: string,
  params: Record<string, unknown> | null,
  cookie: string | null,
  method: "GET" | "POST" = "GET"
): Promise<{ data: T; cookie: string | null }> {
  const headers: Record<string, string> = { Newv: "1" };
  let url = `${baseUrl}/808gps/${action}`;
  let body: string | undefined;

  if (params) {
    const enc = encryptParams(params);
    if (method === "GET") {
      url = `${baseUrl}/808gps/${action.split("?")[0]}?${enc}`;
    } else {
      headers["Content-Type"] = "application/json";
      body = enc;
    }
  }

  const { json, cookie: setCookie, status } = await rawFetch(url, {
    method,
    headers,
    body,
    cookie,
  });

  if (status >= 400) {
    throw new Error(`Tower crane API HTTP ${status} on ${action}`);
  }

  const obj = json as { encry?: number; data?: string; result?: number; message?: string };
  const data = (obj?.encry === 1 && obj.data ? decryptPayload(obj.data) : json) as T;
  return { data, cookie: mergeCookies(cookie, setCookie) };
}

async function ensureWebSession(config: TowerCraneConfig): Promise<WebSession> {
  const now = Date.now();
  if (webSession && webSession.expiresAt > now) return webSession;

  let cookie: string | null = null;
  const init = await webCall<{ result: number; jsessionId?: string }>(
    config.baseUrl,
    "StandardLoginAction_initLoginSession.action",
    null,
    cookie,
    "GET"
  );
  cookie = init.cookie;

  const login = await webCall<{
    result: number;
    accountId?: number;
    companyId?: number;
    message?: string;
    name?: string;
  }>(
    config.baseUrl,
    "StandardLoginAction_login.action",
    {
      account: config.account,
      ipson: Buffer.from(config.password, "utf8").toString("base64"),
      language: "zh",
      verificationCode: "",
    },
    cookie,
    "POST"
  );

  if ((login.data as { result: number }).result !== 0) {
    webSession = null;
    throw new Error(
      (login.data as { message?: string }).message ||
        `Web login failed (result=${(login.data as { result: number }).result})`
    );
  }

  cookie = login.cookie;
  if (!cookie?.includes("JSESSIONID=")) {
    throw new Error("Web login succeeded but no JSESSIONID cookie returned");
  }

  webSession = {
    cookie,
    accountName: config.account,
    companyName: null,
    expiresAt: now + SESSION_TTL_MS,
  };
  return webSession;
}

async function ensureOpenSession(config: TowerCraneConfig): Promise<OpenSession> {
  const now = Date.now();
  if (openSession && openSession.expiresAt > now) return openSession;

  const url = `${config.baseUrl}/808gps/StandardApiAction_login.action?account=${encodeURIComponent(
    config.account
  )}&password=${encodeURIComponent(config.password)}`;
  const { json } = await rawFetch(url);
  const data = json as { result: number; jsession?: string; message?: string };
  if (data.result !== 0 || !data.jsession) {
    throw new Error(data.message || `Open API login failed (result=${data.result})`);
  }
  openSession = { jsession: data.jsession, expiresAt: now + SESSION_TTL_MS };
  return openSession;
}

function clearSessions() {
  webSession = null;
  openSession = null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isOnline(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

type VehicleDevice = {
  id?: string;
  cc?: number;
  cn?: string;
  ol?: number;
  sdc?: Array<{ cn?: string }>;
};

type VehicleRow = {
  id?: number;
  nm?: string;
  pid?: number;
  pnm?: string;
  ic?: number;
  dl?: VehicleDevice[];
};

type StatusRow = {
  id?: string;
  vid?: string;
  ol?: number;
  mlng?: string | number;
  mlat?: string | number;
  gt?: string;
  net?: number;
  hx?: number;
};

function buildChannels(dev: VehicleDevice): TowerCraneChannel[] {
  if (Array.isArray(dev.sdc) && dev.sdc.length > 0) {
    return dev.sdc.map((ch, index) => {
      const platformName = ch.cn || `CH${index + 1}`;
      return { index, name: platformName, platformName };
    });
  }
  if (dev.cn) {
    return dev.cn.split(",").map((name, index) => {
      const platformName = name.trim() || `CH${index + 1}`;
      return { index, name: platformName, platformName };
    });
  }
  const count = Number(dev.cc ?? 0) || 0;
  return Array.from({ length: count }, (_, index) => {
    const platformName = `CH${index + 1}`;
    return { index, name: platformName, platformName };
  });
}

function extractWebJsession(cookie: string | null | undefined): string | null {
  if (!cookie) return null;
  const m = cookie.match(/JSESSIONID=([^;,\s]+)/i);
  return m?.[1] || null;
}

async function fetchMediaServer(
  baseUrl: string,
  cookie: string
): Promise<{ host: string; port: number }> {
  const fallbackHost = trimSlash(baseUrl).replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  try {
    const res = await webCall<{ result: number; loginServer?: string }>(
      baseUrl,
      "StandardLoginAction_getLoginServer.action",
      null,
      cookie,
      "GET"
    );
    const raw = res.data.loginServer;
    if (!raw) return { host: fallbackHost, port: 6605 };
    const servers = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Array<{
      clientIp?: string;
      clientIp2?: string;
      lanip?: string;
      clientPort?: number;
    }>;
    const first = servers?.[0];
    const host = first?.clientIp || first?.clientIp2 || first?.lanip || fallbackHost;
    const port = Number(first?.clientPort) || 6605;
    return { host, port };
  } catch {
    return { host: fallbackHost, port: 6605 };
  }
}

/**
 * Build a same-origin single-channel player URL.
 *
 * Live video must use the web monitor JSESSIONID (cookie), not Open API
 * jsession — the H5 player authenticates streams with that session.
 * Do NOT point iframes at supplier videoH5.html with `channel=N` — there
 * `channel` means max window count, not camera index.
 */
function buildVideoUrl(
  baseUrl: string,
  jsession: string | null,
  deviceId: string,
  channel = 0,
  media?: { host: string; port: number } | null
): string | null {
  if (!jsession || !baseUrl) return null;
  const params = new URLSearchParams({
    base: baseUrl,
    jsession,
    devIdno: deviceId,
    channel: String(channel),
    title: `${deviceId} - CH${channel + 1}`,
    mediaHost: media?.host || "",
    mediaPort: String(media?.port || 6605),
  });
  return `/mdvr-h5-player.html?${params.toString()}`;
}

export function buildChannelVideoUrl(
  baseUrl: string,
  jsession: string | null,
  deviceId: string,
  channelIndex: number,
  media?: { host: string; port: number } | null
): string | null {
  return buildVideoUrl(baseUrl, jsession, deviceId, channelIndex, media);
}

async function fetchSnapshotOnce(config: TowerCraneConfig): Promise<TowerCraneSnapshot> {
  const fetchedAt = new Date().toISOString();
  const session = await ensureWebSession(config);
  // Live video uses the web monitor JSESSIONID (same as supplier UI).
  const videoJs = extractWebJsession(session.cookie);
  const media = await fetchMediaServer(config.baseUrl, session.cookie);
  // Open API jsession is optional / unused for playback on this account.
  let openJs: string | null = null;
  try {
    openJs = (await ensureOpenSession(config)).jsession;
  } catch {
    openJs = null;
  }
  void openJs;

  const vehiclesRes = await webCall<{
    result: number;
    vehicles?: VehicleRow[];
    infos?: Array<{ id?: string; name?: string }>;
    message?: string;
  }>(
    config.baseUrl,
    "StandardLoginAction_getUserVehicleExForIndex.action",
    { newv: 1, toMap: 2, vType: 0 },
    session.cookie,
    "GET"
  );

  if (vehiclesRes.cookie) {
    session.cookie = vehiclesRes.cookie;
    webSession = { ...session, cookie: vehiclesRes.cookie };
  }

  if (vehiclesRes.data.result !== 0) {
    throw new Error(
      vehiclesRes.data.message ||
        `getUserVehicleExForIndex failed (result=${vehiclesRes.data.result})`
    );
  }

  const companyName = vehiclesRes.data.infos?.[0]?.name ?? null;
  if (webSession) webSession.companyName = companyName;

  const statusRes = await webCall<{ result: number; status?: StatusRow[]; message?: string }>(
    config.baseUrl,
    "StandardPositionAction_statusEx.action",
    { toMap: 2, newv: 1, loadAll: 1, vType: 0 },
    session.cookie,
    "GET"
  );

  const statusByDevId = new Map<string, StatusRow>();
  const statusByVid = new Map<string, StatusRow>();
  for (const st of statusRes.data.status ?? []) {
    if (st.id) statusByDevId.set(String(st.id), st);
    if (st.vid) statusByVid.set(String(st.vid), st);
  }

  const devices: TowerCraneDevice[] = [];
  for (const vehi of vehiclesRes.data.vehicles ?? []) {
    const vehiIdno = String(vehi.nm ?? vehi.id ?? "");
    const companyId = vehi.pid != null ? Number(vehi.pid) : null;
    const vehiCompany = vehi.pnm ?? companyName;
    const list = vehi.dl?.length ? vehi.dl : [{ id: vehiIdno, cc: 0, cn: "" }];

    for (const dev of list) {
      const deviceId = String(dev.id ?? vehiIdno);
      if (!deviceId) continue;
      const st = statusByDevId.get(deviceId) ?? statusByVid.get(vehiIdno) ?? null;
      const channels = buildChannels(dev);
      devices.push({
        vehiId: Number(vehi.id ?? 0),
        vehiIdno,
        displayName: vehiIdno,
        companyId,
        companyName: vehiCompany,
        iconType: vehi.ic ?? null,
        deviceId,
        channelCount: channels.length || Number(dev.cc ?? 0) || 0,
        channels,
        online: isOnline(st?.ol ?? dev.ol),
        lng: asNumber(st?.mlng),
        lat: asNumber(st?.mlat),
        gpsTime: typeof st?.gt === "string" ? st.gt : null,
        network: asNumber(st?.net),
        heading: asNumber(st?.hx),
        videoUrl: buildVideoUrl(config.baseUrl, videoJs, deviceId, 0, media),
      });
    }
  }

  devices.sort((a, b) => a.vehiIdno.localeCompare(b.vehiIdno));
  const aliases = await getTowerCraneAliases();
  const labeled = applyTowerCraneAliases(devices, aliases);

  return {
    configured: true,
    connected: true,
    accountName: session.accountName,
    companyName,
    apiUrl: config.baseUrl,
    openJsession: videoJs,
    mediaHost: media.host,
    mediaPort: media.port,
    error: videoJs ? null : "Web video session missing (JSESSIONID).",
    fetchedAt,
    devices: labeled,
  };
}

export async function fetchTowerCraneSnapshot(): Promise<TowerCraneSnapshot> {
  const fetchedAt = new Date().toISOString();
  const config = getTowerCraneConfig();

  if (!config.configured) {
    return {
      configured: false,
      connected: false,
      accountName: null,
      companyName: null,
      apiUrl: null,
      openJsession: null,
      mediaHost: null,
      mediaPort: null,
      error:
        "Tower crane API is not configured. Set TOWER_CRANE_API_URL, TOWER_CRANE_ACCOUNT, and TOWER_CRANE_PASSWORD.",
      fetchedAt,
      devices: [],
    };
  }

  try {
    return await fetchSnapshotOnce(config);
  } catch (err) {
    clearSessions();
    try {
      return await fetchSnapshotOnce(config);
    } catch (err2) {
      clearSessions();
      return {
        configured: true,
        connected: false,
        accountName: config.account,
        companyName: null,
        apiUrl: config.baseUrl,
        openJsession: null,
        mediaHost: null,
        mediaPort: null,
        error: err2 instanceof Error ? err2.message : "Unknown tower crane API error",
        fetchedAt,
        devices: [],
      };
    }
  }
}
