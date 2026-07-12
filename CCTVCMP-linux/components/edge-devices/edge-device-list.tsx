"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatHKT } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { floorLabel, floorHeading } from "@/lib/camera-status";

type Device = {
  id: string;
  name: string;
  edgeCameraId: string | null;
  streamUrl: string | null;
  status: string;
  lastReportAt: string | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  isOnline: boolean;
  latestReport: {
    id: string;
    overallRiskLevel: string;
    overallDescription: string;
    eventImagePath: string | null;
    receivedAt: string;
  } | null;
  latestAlertEvidence: {
    id: string;
    overallRiskLevel: string;
    eventImagePath: string;
    receivedAt: string;
  } | null;
  incidentCount: number;
  reportCount: number;
};

const SNAPSHOT_REFRESH_MS = 15_000; // refresh every 15 s on the list page

function withTimestamp(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

/** Snapshot thumbnail that always fetches the latest frame directly. */
function DeviceSnapshot({ deviceId, name }: { deviceId: string; name: string }) {
  const base = `/api/edge-devices/${deviceId}/snapshot`;
  const [src, setSrc] = useState(() => withTimestamp(base));

  useEffect(() => {
    setSrc(withTimestamp(base));
    const id = setInterval(() => setSrc(withTimestamp(base)), SNAPSHOT_REFRESH_MS);
    return () => clearInterval(id);
  }, [base]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={`${name} snapshot`}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
    </>
  );
}

function StatusDot({ device, t }: { device: Device; t: ReturnType<typeof useTranslations<"edgeDevices">> }) {
  if (device.status === "maintenance") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        {t("statusMaintenance")}
      </span>
    );
  }
  if (device.status === "degraded") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
        {t("statusStreamIssue")}
      </span>
    );
  }
  if (device.isOnline) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
        <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
        {t("statusOnline")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
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

export function EdgeDeviceList({ devices }: { devices: Device[] }) {
  const t = useTranslations("edgeDevices");

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-1">{t("noDevicesRegistered")}</p>
        <p className="text-sm">{t("noDevicesSubtext")}</p>
      </div>
    );
  }

  // Group by floor, preserving order from the page
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
        <div key={floor}>
          {/* Floor heading */}
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {floorHeading(floor)}
            </h3>
            <span className="text-xs text-muted-foreground/50 bg-muted px-2 py-0.5 rounded-full">
              {items.length} cam{items.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 border-t border-border/40" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((d) => (
              <Link key={d.id} href={`/edge-devices/${d.id}`} className="group block">
                <Card className="h-full transition-all duration-150 hover:border-primary/60 hover:shadow-md group-focus-visible:ring-2 ring-primary">
                  {/* Thumbnail */}
                  <div className="relative overflow-hidden rounded-t-xl bg-muted/30 h-36">
                    <DeviceSnapshot deviceId={d.id} name={d.name} />
                    {d.latestReport && (
                      <div className="absolute top-2 right-2">
                        {riskBadge(d.latestReport.overallRiskLevel)}
                      </div>
                    )}
                    <div className="absolute top-2 left-2 rounded-full bg-background/80 px-2 py-0.5 backdrop-blur-sm">
                      <StatusDot device={d} t={t} />
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-2">
                    <p className="font-semibold text-sm leading-tight truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.project?.name ?? "—"}
                      {d.zone?.name ? ` · ${d.zone.name}` : ""}
                    </p>
                    {(d.edgeCameraId || d.streamUrl) && (
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {d.edgeCameraId ?? "—"}
                        {d.streamUrl ? ` · ${d.streamUrl}` : ""}
                      </p>
                    )}
                    {d.latestReport?.overallDescription && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                        {d.latestReport.overallDescription}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">
                        {d.lastReportAt ? formatHKT(d.lastReportAt) : t("never")}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{d.reportCount} {t("rptLabel")}</span>
                        <span>{d.incidentCount} {t("incLabel")}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
