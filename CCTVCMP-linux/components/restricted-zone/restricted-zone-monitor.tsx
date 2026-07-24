"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  RESTRICTED_ZONE_CAMERAS,
  buildGo2rtcFrameUrl,
  type RestrictedZoneCamera,
} from "@/lib/restricted-zone";

/** Live view via continuous JPEG snapshots (works through Next→go2rtc HTTP rewrite). */
function LiveVideo({ frameSrc, title }: { frameSrc: string; title: string }) {
  const [frameUrl, setFrameUrl] = useState(`${frameSrc}&t=${Date.now()}`);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    let alive = true;
    let timer: number | undefined;

    const pull = () => {
      if (!alive) return;
      const img = new Image();
      const url = `${frameSrc}${frameSrc.includes("?") ? "&" : "?"}t=${Date.now()}`;
      img.onload = () => {
        if (!alive) return;
        setFrameUrl(url);
        setError(false);
        timer = window.setTimeout(pull, 200);
      };
      img.onerror = () => {
        if (!alive) return;
        setError(true);
        timer = window.setTimeout(pull, 1000);
      };
      img.src = url;
    };

    pull();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [frameSrc]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-black">
      <div className="absolute left-3 top-3 z-10">
        <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frameUrl}
        alt={title}
        className="aspect-video min-h-[360px] w-full bg-black object-contain"
      />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
          Connecting to camera…
        </div>
      ) : null}
    </div>
  );
}

export function RestrictedZoneMonitor({
  cameras = RESTRICTED_ZONE_CAMERAS,
}: {
  cameras?: RestrictedZoneCamera[];
}) {
  const t = useTranslations("restrictedZone");
  const [selectedId, setSelectedId] = useState(cameras[0]?.id ?? null);

  const selected = useMemo(
    () => cameras.find((c) => c.id === selectedId) ?? cameras[0] ?? null,
    [cameras, selectedId]
  );

  if (cameras.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <p className="mb-1 text-lg font-medium">{t("noCamerasTitle")}</p>
        <p className="text-sm">{t("noCamerasBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{t("liveCctv")}</Badge>
        <span className="text-sm text-muted-foreground">
          {t("cameraCount", { count: cameras.length })}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-sm">{t("cameraList")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {cameras.map((cam) => {
              const active = selected?.id === cam.id;
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => setSelectedId(cam.id)}
                  className={cn(
                    "flex w-full flex-col rounded-md px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{cam.name}</span>
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {cam.ip}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Video className="h-4 w-4" />
              {selected ? selected.name : t("liveCctv")}
              {selected ? (
                <span className="font-normal text-muted-foreground">· {selected.ip}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {selected ? (
              <LiveVideo
                frameSrc={buildGo2rtcFrameUrl(selected.go2rtcSrc)}
                title={selected.name}
              />
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                {t("selectCamera")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
