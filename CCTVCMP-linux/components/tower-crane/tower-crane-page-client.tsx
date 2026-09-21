"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TowerCraneMonitor } from "@/components/tower-crane/tower-crane-monitor";
import type { TowerCraneMonitorProps } from "@/components/tower-crane/tower-crane-monitor";

type MdvrModule = "tower-crane" | "mobile-machine";
type Snapshot = Omit<TowerCraneMonitorProps, "i18nNamespace">;

export function TowerCranePageClient({
  module,
  i18nNamespace,
}: {
  module: MdvrModule;
  i18nNamespace: "towerCrane" | "mobileMachine";
}) {
  const t = useTranslations(i18nNamespace);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 20_000);

    (async () => {
      try {
        const res = await fetch(`/api/tower-crane?module=${encodeURIComponent(module)}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const data = json.data;
        if (!data) {
          throw new Error("Empty snapshot");
        }
        setSnapshot({
          configured: Boolean(data.configured),
          connected: Boolean(data.connected),
          accountName: data.accountName ?? null,
          companyName: data.companyName ?? null,
          apiUrl: data.apiUrl ?? null,
          openJsession: data.openJsession ?? null,
          mediaHost: data.mediaHost ?? null,
          mediaPort: data.mediaPort ?? null,
          error: data.error ?? null,
          fetchedAt: data.fetchedAt ?? new Date().toISOString(),
          devices: Array.isArray(data.devices) ? data.devices : [],
        });
      } catch (err) {
        if (ac.signal.aborted) {
          setLoadError("timeout");
          return;
        }
        setLoadError(err instanceof Error ? err.message : "failed");
      }
    })();

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [module]);

  const devices = snapshot?.devices ?? [];
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {!snapshot ? (
            <span className="inline-block h-4 w-48 animate-pulse rounded bg-muted align-middle" />
          ) : snapshot.configured ? (
            t("subtitle", { online: onlineCount, total: devices.length })
          ) : (
            t("subtitleUnconfigured")
          )}
        </p>
      </div>
      {loadError && !snapshot ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : snapshot ? (
        <TowerCraneMonitor {...snapshot} i18nNamespace={i18nNamespace} />
      ) : (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      )}
    </div>
  );
}
