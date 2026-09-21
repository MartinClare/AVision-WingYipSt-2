"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pager } from "@/components/ui/pager";
import { formatHKT } from "@/lib/utils";
import { useTranslations } from "next-intl";

type AlertItem = {
  id: string;
  type: string;
  riskLevel: string;
  status: string;
  cameraName: string;
  detectedAt: string;
};

export function AlertFeed({
  initialIncidents,
  initialTotal,
  pageSize = 20,
}: {
  initialIncidents: AlertItem[];
  initialTotal: number;
  pageSize?: number;
}) {
  const t = useTranslations("dashboard");
  const tIncidents = useTranslations("incidents");
  const tCommon = useTranslations("common");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setIncidents(initialIncidents);
    setTotal(initialTotal);
    setPage(1);
  }, [initialIncidents, initialTotal]);

  const goTo = useCallback(
    async (next: number) => {
      if (next < 1 || next > pageCount || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          section: "alerts",
          limit: String(pageSize),
          offset: String((next - 1) * pageSize),
        });
        const res = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data;
        if (!data?.incidents) return;
        setIncidents(data.incidents);
        if (typeof data.total === "number") setTotal(data.total);
        setPage(next);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [pageCount, pageSize]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("recentAlerts")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {incidents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("noRecentIncidents")}
            </p>
          ) : (
            incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">
                    {tIncidents(`types.${inc.type}` as Parameters<typeof tIncidents>[0]) ||
                      inc.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground"> · {inc.cameraName}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge
                    variant={
                      inc.riskLevel === "critical" || inc.riskLevel === "high"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {tCommon(`riskLevel.${inc.riskLevel}` as Parameters<typeof tCommon>[0])}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatHKT(inc.detectedAt)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
        <Pager page={page} pageCount={pageCount} loading={loading} onGo={(p) => void goTo(p)} />
      </CardContent>
    </Card>
  );
}
