"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pager } from "@/components/ui/pager";
import { formatHKT } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { floorLabel, floorHeading } from "@/lib/camera-status";
import type { DashboardEdgeTile } from "@/lib/dashboard-data";

export function EdgeStatusPanel({
  initialDevices,
  initialTotal,
  pageSize = 12,
}: {
  initialDevices: DashboardEdgeTile[];
  initialTotal: number;
  pageSize?: number;
}) {
  const t = useTranslations("dashboard");
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
          `/api/dashboard?section=devices&offset=${(next - 1) * pageSize}&limit=${pageSize}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data;
        if (!data?.devices) return;
        setDevices(data.devices);
        if (typeof data.total === "number") setTotal(data.total);
        setPage(next);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [pageCount, pageSize]
  );

  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("edgeDevicesLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">{t("noDevicesYet")}</p>
        </CardContent>
      </Card>
    );
  }

  const groups: { floor: string; items: DashboardEdgeTile[] }[] = [];
  for (const d of devices) {
    const fl = floorLabel(d.name);
    const last = groups[groups.length - 1];
    if (last && last.floor === fl) last.items.push(d);
    else groups.push({ floor: fl, items: [d] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("edgeDeviceStatus")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map(({ floor, items }) => (
          <div key={floor}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {floorHeading(floor)}
              </span>
              <span className="text-xs text-muted-foreground/50">({items.length})</span>
              <div className="flex-1 border-t border-border/40" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((d) => (
                <Link
                  key={d.id}
                  href={`/edge-devices/${d.id}`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          d.status === "maintenance"
                            ? "bg-yellow-400"
                            : d.isOnline
                              ? "bg-green-400 animate-pulse"
                              : "bg-red-400"
                        }`}
                      />
                      <span className="text-sm font-medium">{d.name}</span>
                    </div>
                    {d.latestRiskLevel && (
                      <Badge
                        variant={
                          d.latestRiskLevel === "High"
                            ? "destructive"
                            : d.latestRiskLevel === "Medium"
                              ? "default"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {d.latestRiskLevel}
                      </Badge>
                    )}
                  </div>
                  {d.latestDescription && (
                    <p className="mb-1 line-clamp-2 text-xs text-muted-foreground">
                      {d.latestDescription}
                    </p>
                  )}
                  {(d.edgeCameraId || d.streamUrl) && (
                    <p className="mb-1 line-clamp-1 text-[11px] text-muted-foreground">
                      {d.edgeCameraId ?? "—"}
                      {d.streamUrl ? ` · ${d.streamUrl}` : ""}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {d.lastReportAt
                      ? t("lastReport", { time: formatHKT(d.lastReportAt) })
                      : t("noReportsYet")}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
        <Pager page={page} pageCount={pageCount} loading={loading} onGo={(p) => void goTo(p)} />
      </CardContent>
    </Card>
  );
}
