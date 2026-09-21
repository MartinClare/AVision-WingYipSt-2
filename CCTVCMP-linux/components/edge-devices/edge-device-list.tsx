"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pager } from "@/components/ui/pager";
import { formatHKT } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  cameraHostLabel,
  cameraShortLabel,
  floorHeading,
  floorLabel,
} from "@/lib/camera-status";
import type { EdgeDeviceListItem } from "@/lib/edge-devices-list";

type Device = EdgeDeviceListItem;

const SNAPSHOT_REFRESH_MS = 60_000;

function withTimestamp(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

/** Snapshot thumbnail — only fetches when the card is near the viewport. */
function DeviceSnapshot({ deviceId, name }: { deviceId: string; name: string }) {
  const base = `/api/edge-devices/${deviceId}/snapshot`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Preload each refresh and swap only after a successful load, so the
    // previous frame stays on screen instead of flashing blank on slow
    // or failed (204) fetches.
    const load = () => {
      const next = withTimestamp(base);
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setSrc(next);
      };
      img.src = next;
    };
    load();
    const id = setInterval(load, SNAPSHOT_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible, base]);

  return (
    <div ref={containerRef} className="h-full w-full bg-muted/40">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${name} snapshot`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          …
        </div>
      )}
    </div>
  );
}

function StatusDot({ device, t }: { device: Device; t: ReturnType<typeof useTranslations<"edgeDevices">> }) {
  if (device.status === "maintenance") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        {t("statusMaintenance")}
      </span>
    );
  }
  if (device.status === "degraded") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
        {t("statusStreamIssue")}
      </span>
    );
  }
  if (device.isOnline) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
        <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
        {t("statusOnline")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
      {t("statusOffline")}
    </span>
  );
}

function riskBadge(level: string) {
  const l = level.toLowerCase();
  if (l === "critical" || l === "high") return <Badge variant="destructive">{level}</Badge>;
  if (l === "medium") return <Badge variant="default">{level}</Badge>;
  return <Badge variant="secondary">{level}</Badge>;
}

export function EdgeDeviceList({
  initialDevices,
  initialTotal,
  pageSize = 12,
}: {
  initialDevices: Device[];
  initialTotal: number;
  pageSize?: number;
}) {
  const t = useTranslations("edgeDevices");
  const [devices, setDevices] = useState(initialDevices);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setDevices(initialDevices);
    setTotal(initialTotal);
    setPage(1);
  }, [initialDevices, initialTotal]);

  const goTo = useCallback(
    async (next: number) => {
      if (next < 1 || next > pageCount || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/edge-devices?offset=${(next - 1) * pageSize}&limit=${pageSize}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data;
        if (!data?.devices) return;
        setDevices(data.devices);
        if (typeof data.total === "number") setTotal(data.total);
        setPage(next);
        window.scrollTo({ top: 0 });
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [pageCount, pageSize]
  );

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <p className="mb-1 text-lg font-medium">{t("noDevicesRegistered")}</p>
        <p className="text-sm">{t("noDevicesSubtext")}</p>
      </div>
    );
  }

  const groups: { floor: string; items: Device[] }[] = [];
  for (const d of devices) {
    const fl = floorLabel(d.name);
    const last = groups[groups.length - 1];
    if (last && last.floor === fl) last.items.push(d);
    else groups.push({ floor: fl, items: [d] });
  }

  return (
    <div className="space-y-8">
      {groups.map(({ floor, items }) => (
        <section key={floor} aria-label={floorHeading(floor)}>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {floorHeading(floor)}
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {items.length} cam{items.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 border-t border-border/40" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((d) => {
              const host = cameraHostLabel(d.streamUrl);
              return (
                <Link key={d.id} href={`/edge-devices/${d.id}`} className="group block">
                  <Card className="h-full transition-all duration-150 hover:border-primary/60 hover:shadow-md group-focus-visible:ring-2 ring-primary">
                    <div className="relative h-36 overflow-hidden rounded-t-xl bg-muted/30">
                      <DeviceSnapshot deviceId={d.id} name={d.name} />
                      {d.latestReport && (
                        <div className="absolute right-2 top-2">
                          {riskBadge(d.latestReport.overallRiskLevel)}
                        </div>
                      )}
                      <div className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 backdrop-blur-sm">
                        <StatusDot device={d} t={t} />
                      </div>
                      <div className="absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-1 text-[11px] font-medium backdrop-blur-sm">
                        {floorHeading(floor)}
                      </div>
                    </div>

                    <CardContent className="space-y-2 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {cameraShortLabel(d.name)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.name}
                          {host ? ` · ${host}` : ""}
                        </p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.project?.name ?? "—"}
                        {d.zone?.name ? ` · ${d.zone.name}` : ""}
                      </p>
                      {d.latestReport?.overallDescription && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
                          {d.latestReport.overallDescription}
                        </p>
                      )}
                      <div className="flex items-center justify-between border-t border-border/50 pt-1">
                        <span className="text-xs text-muted-foreground">
                          {d.lastReportAt ? formatHKT(d.lastReportAt) : t("never")}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {d.reportCount} {t("rptLabel")}
                          </span>
                          <span>
                            {d.incidentCount} {t("incLabel")}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <Pager page={page} pageCount={pageCount} loading={loading} onGo={(p) => void goTo(p)} />
    </div>
  );
}
