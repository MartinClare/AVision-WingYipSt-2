"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  applyTowerCraneAliases,
  upsertChannelAlias,
  upsertDeviceAlias,
  type TowerCraneAliases,
} from "@/lib/tower-crane-aliases-shared";
import { Check, ChevronDown, ChevronRight, MapPin, Pencil, Radio, Video, X } from "lucide-react";

export type MonitorChannel = { index: number; name: string; platformName?: string };

export type MonitorDevice = {
  vehiId: number;
  vehiIdno: string;
  displayName?: string;
  companyId: number | null;
  companyName: string | null;
  deviceId: string;
  channelCount: number;
  channels: MonitorChannel[];
  online: boolean;
  lng: number | null;
  lat: number | null;
  gpsTime: string | null;
  network: number | null;
  heading: number | null;
  videoUrl: string | null;
};

export type TowerCraneMonitorProps = {
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  companyName: string | null;
  apiUrl: string | null;
  openJsession: string | null;
  mediaHost: string | null;
  mediaPort: number | null;
  error: string | null;
  fetchedAt: string;
  devices: MonitorDevice[];
};

type PlayingSlot = {
  key: string;
  deviceId: string;
  vehiIdno: string;
  displayName: string;
  channelIndex: number;
  channelName: string;
  url: string;
};

function deviceLabel(device: Pick<MonitorDevice, "displayName" | "vehiIdno">) {
  return device.displayName?.trim() || device.vehiIdno;
}

type EditTarget =
  | { kind: "device"; deviceId: string; value: string }
  | { kind: "channel"; deviceId: string; channelIndex: number; value: string };

function buildVideoUrl(
  apiUrl: string | null,
  jsession: string | null,
  deviceId: string,
  channelIndex: number,
  channelName?: string,
  mediaHost?: string | null,
  mediaPort?: number | null
): string | null {
  if (!apiUrl || !jsession) return null;
  const params = new URLSearchParams({
    base: apiUrl,
    jsession,
    devIdno: deviceId,
    channel: String(channelIndex),
    title: channelName || `${deviceId} - CH${channelIndex + 1}`,
    mediaHost: mediaHost || "",
    mediaPort: String(mediaPort || 6605),
  });
  return `/mdvr-h5-player.html?${params.toString()}`;
}

function OnlineDot({ online, labelOnline, labelOffline }: { online: boolean; labelOnline: string; labelOffline: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", online ? "text-green-400" : "text-red-400")}>
      <span className={cn("h-2 w-2 rounded-full", online ? "animate-pulse bg-green-400" : "bg-red-400")} />
      {online ? labelOnline : labelOffline}
    </span>
  );
}

type LeafletMap = {
  remove: () => void;
  setView: (c: [number, number], z: number) => void;
  fitBounds: (b: unknown, o?: unknown) => void;
};

function loadLeaflet(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any;
}> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (window as any).L;
    if (existing) {
      resolve({ L: existing });
      return;
    }

    if (!document.getElementById("leaflet-css-cdn")) {
      const link = document.createElement("link");
      link.id = "leaflet-css-cdn";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const ready = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (L) resolve({ L });
      else reject(new Error("Leaflet missing after load"));
    };

    const scriptExisting = document.getElementById("leaflet-js-cdn") as HTMLScriptElement | null;
    if (scriptExisting) {
      if ((window as unknown as { L?: unknown }).L) ready();
      else scriptExisting.addEventListener("load", ready, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "leaflet-js-cdn";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = ready;
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.body.appendChild(script);
  });
}

function CraneMap({ devices, selectedId }: { devices: MonitorDevice[]; selectedId: string | null }) {
  const t = useTranslations("towerCrane");
  const points = useMemo(
    () => devices.filter((d) => d.lat != null && d.lng != null),
    [devices]
  );
  const pointKey = points.map((d) => `${d.deviceId}:${d.lat}:${d.lng}:${d.online}`).join("|");

  useEffect(() => {
    if (points.length === 0) return;
    let map: LeafletMap | null = null;
    let cancelled = false;

    loadLeaflet()
      .then(({ L }) => {
        if (cancelled) return;
        const el = document.getElementById("tower-crane-map");
        if (!el) return;
        el.innerHTML = "";
        map = L.map(el, { zoomControl: true }) as LeafletMap;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        const bounds: [number, number][] = [];
        for (const d of points) {
          const marker = L.marker([d.lat!, d.lng!], {
            opacity: d.deviceId === selectedId ? 1 : 0.8,
          });
          marker.bindPopup(
            `<strong>${deviceLabel(d)}</strong><br/>${d.deviceId}<br/>${d.gpsTime || ""}`
          );
          marker.addTo(map);
          bounds.push([d.lat!, d.lng!]);
        }

        if (selectedId) {
          const sel = points.find((d) => d.deviceId === selectedId);
          if (sel) map!.setView([sel.lat!, sel.lng!], 15);
          else if (bounds.length) map!.fitBounds(bounds, { padding: [24, 24] });
        } else if (bounds.length === 1) {
          map!.setView(bounds[0], 14);
        } else if (bounds.length > 1) {
          map!.fitBounds(bounds, { padding: [24, 24] });
        }
      })
      .catch(() => {
        /* map is optional if CDN blocked */
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
    // pointKey captures coordinate changes without depending on array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey, selectedId]);

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        {t("noGps")}
      </div>
    );
  }

  return <div id="tower-crane-map" className="h-full min-h-[280px] w-full rounded-lg border border-border" />;
}

export function TowerCraneMonitor({
  configured,
  connected,
  accountName,
  companyName,
  apiUrl,
  openJsession,
  mediaHost,
  mediaPort,
  error,
  fetchedAt,
  devices,
}: TowerCraneMonitorProps) {
  const t = useTranslations("towerCrane");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(devices[0]?.deviceId ?? null);
  const [playing, setPlaying] = useState<PlayingSlot[]>([]);
  const [viewMode, setViewMode] = useState<"split" | "video" | "map">("split");
  const [localDevices, setLocalDevices] = useState(devices);
  const [aliases, setAliases] = useState<TowerCraneAliases>({ devices: {} });
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalDevices(devices);
  }, [devices]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tower-crane/aliases")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        setAliases(json.data as TowerCraneAliases);
      })
      .catch(() => {
        /* aliases are optional for display; server snapshot already applied them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onlineCount = localDevices.filter((d) => d.online).length;
  const companies = useMemo(() => {
    const map = new Map<string, MonitorDevice[]>();
    for (const d of localDevices) {
      const key = d.companyName || t("unknown");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [localDevices, t]);

  useEffect(() => {
    // Expand first company + first device by default
    if (localDevices.length === 0) return;
    const firstCompany = localDevices[0].companyName || "company";
    const prefer = localDevices.find((d) => d.online) ?? localDevices[0];
    setExpanded((prev) => ({
      ...prev,
      [`c:${firstCompany}`]: true,
      [`c:${prefer.companyName || firstCompany}`]: true,
      [`d:${prefer.deviceId}`]: true,
    }));
    if (!selectedDeviceId) setSelectedDeviceId(prefer.deviceId);
    // Auto-play CH1 of the first online crane only (single-channel pane)
    if (playing.length === 0 && openJsession) {
      const ch = prefer.channels[0] ?? { index: 0, name: "CH1" };
      const url = buildVideoUrl(apiUrl, openJsession, prefer.deviceId, ch.index, ch.name, mediaHost, mediaPort);
      if (url) {
        setPlaying([
          {
            key: `${prefer.deviceId}:${ch.index}`,
            deviceId: prefer.deviceId,
            vehiIdno: prefer.vehiIdno,
            displayName: deviceLabel(prefer),
            channelIndex: ch.index,
            channelName: ch.name,
            url,
          },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDevices, apiUrl, openJsession, mediaHost, mediaPort]);

  function togglePlay(device: MonitorDevice, channel: MonitorChannel) {
    const key = `${device.deviceId}:${channel.index}`;
    setSelectedDeviceId(device.deviceId);
    setPlaying((prev) => {
      const exists = prev.find((p) => p.key === key);
      if (exists) return prev.filter((p) => p.key !== key);
      const url = buildVideoUrl(apiUrl, openJsession, device.deviceId, channel.index, channel.name, mediaHost, mediaPort);
      if (!url) return prev;
      const next = [
        ...prev,
        {
          key,
          deviceId: device.deviceId,
          vehiIdno: device.vehiIdno,
          displayName: deviceLabel(device),
          channelIndex: channel.index,
          channelName: channel.name,
          url,
        },
      ];
      // Keep up to 9 panes like supplier 3x3
      return next.slice(-9);
    });
  }

  async function persistAliases(next: TowerCraneAliases) {
    setSaving(true);
    setSaveError(null);
    setAliases(next);
    setLocalDevices((prev) => {
      const updated = applyTowerCraneAliases(prev, next);
      setPlaying((slots) =>
        slots.map((slot) => {
          const device = updated.find((d) => d.deviceId === slot.deviceId);
          const ch = device?.channels.find((c) => c.index === slot.channelIndex);
          return {
            ...slot,
            displayName: device ? deviceLabel(device) : slot.displayName,
            channelName: ch?.name || slot.channelName,
          };
        })
      );
      return updated;
    });
    try {
      const res = await fetch("/api/tower-crane/aliases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Save failed (${res.status})`);
      }
      const json = await res.json();
      if (json?.data) {
        setAliases(json.data);
        setLocalDevices((prev) => applyTowerCraneAliases(prev, json.data));
      }
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("renameSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function commitEdit() {
    if (!editing) return;
    if (editing.kind === "device") {
      await persistAliases(upsertDeviceAlias(aliases, editing.deviceId, editing.value));
      return;
    }
    await persistAliases(
      upsertChannelAlias(aliases, editing.deviceId, editing.channelIndex, editing.value)
    );
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <p className="mb-1 text-lg font-medium">{t("configRequiredTitle")}</p>
        <p className="text-sm">{t("configRequiredBody")}</p>
        <pre className="mx-auto mt-4 max-w-xl overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-foreground">
{`TOWER_CRANE_API_URL=http://14.21.18.177:88
TOWER_CRANE_ACCOUNT=axon
TOWER_CRANE_PASSWORD=********`}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {connected ? <Badge>{t("connected")}</Badge> : <Badge variant="destructive">{t("disconnected")}</Badge>}
        <span className="text-sm text-muted-foreground">
          {t("onlineCount", { online: onlineCount, total: localDevices.length })}
        </span>
        <span className="text-sm text-muted-foreground">
          {accountName || t("unknown")}
          {companyName ? ` · ${companyName}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("lastUpdated")}: {new Date(fetchedAt).toLocaleString()}
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : null}
      {saveError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{saveError}</div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("renameHint")}</p>

      <div className="flex gap-2">
        {(
          [
            ["split", t("modeSplit")],
            ["video", t("modeVideo")],
            ["map", t("modeMap")],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              viewMode === mode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Device tree */}
        <Card className="max-h-[640px] overflow-hidden">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radio className="h-4 w-4" />
              {t("deviceTree")}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[580px] space-y-1 overflow-y-auto p-3 text-sm">
            {localDevices.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t("noDevicesTitle")}</p>
            ) : (
              companies.map(([company, list]) => {
                const cKey = `c:${company}`;
                const cOpen = expanded[cKey] ?? true;
                return (
                  <div key={company} className="mb-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 rounded px-1 py-1 text-left font-medium hover:bg-muted"
                      onClick={() => setExpanded((p) => ({ ...p, [cKey]: !cOpen }))}
                    >
                      {cOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="truncate">{company}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{list.length}</span>
                    </button>
                    {cOpen
                      ? list.map((device) => {
                          const dKey = `d:${device.deviceId}`;
                          const dOpen = expanded[dKey] ?? false;
                          const selected = selectedDeviceId === device.deviceId;
                          const editingDevice =
                            editing?.kind === "device" && editing.deviceId === device.deviceId;
                          return (
                            <div key={device.deviceId} className="ml-3 border-l border-border pl-2">
                              <div
                                className={cn(
                                  "group flex w-full items-center gap-1 rounded px-1 py-1 hover:bg-muted",
                                  selected && "bg-muted"
                                )}
                              >
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                                  onClick={() => {
                                    setSelectedDeviceId(device.deviceId);
                                    setExpanded((p) => ({ ...p, [dKey]: !dOpen }));
                                  }}
                                >
                                  {dOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                                  <span className={cn("h-2 w-2 shrink-0 rounded-full", device.online ? "bg-green-400" : "bg-red-400")} />
                                  {editingDevice ? (
                                    <Input
                                      autoFocus
                                      value={editing.value}
                                      disabled={saving}
                                      className="h-7 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") void commitEdit();
                                        if (e.key === "Escape") setEditing(null);
                                      }}
                                    />
                                  ) : (
                                    <span className="truncate" title={device.vehiIdno}>
                                      {deviceLabel(device)}
                                    </span>
                                  )}
                                </button>
                                {editingDevice ? (
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => void commitEdit()}>
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => setEditing(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
                                    title={t("renameDevice")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditing({
                                        kind: "device",
                                        deviceId: device.deviceId,
                                        value: deviceLabel(device),
                                      });
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              {dOpen
                                ? device.channels.map((ch) => {
                                    const active = playing.some(
                                      (p) => p.deviceId === device.deviceId && p.channelIndex === ch.index
                                    );
                                    const editingChannel =
                                      editing?.kind === "channel" &&
                                      editing.deviceId === device.deviceId &&
                                      editing.channelIndex === ch.index;
                                    return (
                                      <div
                                        key={`${device.deviceId}-${ch.index}`}
                                        className={cn(
                                          "group ml-5 flex w-[calc(100%-1.25rem)] items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted",
                                          active && "bg-primary/15 text-foreground"
                                        )}
                                      >
                                        <button
                                          type="button"
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                          onClick={() => togglePlay(device, ch)}
                                        >
                                          <Video className="h-3 w-3 shrink-0" />
                                          {editingChannel ? (
                                            <Input
                                              autoFocus
                                              value={editing.value}
                                              disabled={saving}
                                              className="h-7 text-xs"
                                              onClick={(e) => e.stopPropagation()}
                                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") void commitEdit();
                                                if (e.key === "Escape") setEditing(null);
                                              }}
                                            />
                                          ) : (
                                            <span className="truncate">{ch.name}</span>
                                          )}
                                        </button>
                                        {editingChannel ? (
                                          <div className="flex shrink-0 items-center gap-0.5">
                                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => void commitEdit()}>
                                              <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => setEditing(null)}>
                                              <X className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
                                            title={t("renameChannel")}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditing({
                                                kind: "channel",
                                                deviceId: device.deviceId,
                                                channelIndex: ch.index,
                                                value: ch.name,
                                              });
                                            }}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })
                                : null}
                            </div>
                          );
                        })
                      : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Video + Map */}
        <div
          className={cn(
            "grid gap-4",
            viewMode === "split" ? "xl:grid-cols-2" : "grid-cols-1"
          )}
        >
          {viewMode !== "map" ? (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Video className="h-4 w-4" />
                  {t("liveVideo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {playing.length === 0 ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t("selectChannel")}
                  </div>
                ) : (
                  <div
                    className={cn(
                      "grid gap-2",
                      playing.length === 1 ? "grid-cols-1" : playing.length <= 4 ? "grid-cols-2" : "grid-cols-3"
                    )}
                  >
                    {playing.map((slot) => (
                      <div key={slot.key} className="overflow-hidden rounded-lg border border-border bg-black">
                        <div className="flex items-center justify-between bg-black/80 px-2 py-1 text-[11px] text-white">
                          <span className="truncate">
                            {slot.displayName} · {slot.channelName}
                          </span>
                          <button
                            type="button"
                            className="text-white/70 hover:text-white"
                            onClick={() => setPlaying((prev) => prev.filter((p) => p.key !== slot.key))}
                          >
                            ✕
                          </button>
                        </div>
                        <iframe
                          title={`${slot.vehiIdno}-${slot.channelName}`}
                          src={slot.url}
                          className="aspect-video min-h-[200px] w-full bg-black"
                          allow="autoplay; fullscreen; microphone; camera"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {!openJsession ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("videoSessionHint")}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {viewMode !== "video" ? (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  {t("mapMode")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <CraneMap devices={localDevices} selectedId={selectedDeviceId} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Location monitoring table */}
      <Card>
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm">{t("locationMonitor")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colPlate")}</th>
                <th className="px-4 py-3 font-medium">{t("colDevice")}</th>
                <th className="px-4 py-3 font-medium">{t("colCompany")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colGpsTime")}</th>
                <th className="px-4 py-3 font-medium">{t("colLatLng")}</th>
                <th className="px-4 py-3 font-medium">{t("colChannels")}</th>
              </tr>
            </thead>
            <tbody>
              {localDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t("noDevicesBody")}
                  </td>
                </tr>
              ) : (
                localDevices.map((d) => (
                  <tr
                    key={d.deviceId}
                    className={cn(
                      "border-t border-border hover:bg-muted/40",
                      selectedDeviceId === d.deviceId && "bg-muted/60"
                    )}
                    onClick={() => setSelectedDeviceId(d.deviceId)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{deviceLabel(d)}</span>
                        {deviceLabel(d) !== d.vehiIdno ? (
                          <span className="text-xs font-normal text-muted-foreground">({d.vehiIdno})</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.deviceId}</td>
                    <td className="px-4 py-3">{d.companyName || "—"}</td>
                    <td className="px-4 py-3">
                      <OnlineDot online={d.online} labelOnline={t("statusOnline")} labelOffline={t("statusOffline")} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{d.gpsTime || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.lat != null && d.lng != null ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : "—"}
                    </td>
                    <td className="px-4 py-3">{d.channelCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
