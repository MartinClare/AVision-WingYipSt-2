"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IncidentRiskLevel, IncidentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import { IncidentActions } from "@/components/incidents/incident-actions";
import { formatHKT } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { IncidentListItem } from "@/lib/incidents-list";

type IncidentRow = Omit<IncidentListItem, "detectedAt"> & {
  detectedAt: string | Date;
};

function riskVariant(level: IncidentRiskLevel): "default" | "secondary" | "destructive" {
  if (level === "critical") return "destructive";
  if (level === "high") return "default";
  return "secondary";
}

function statusColor(status: IncidentStatus): string {
  switch (status) {
    case "open":
      return "text-red-400";
    case "acknowledged":
      return "text-yellow-400";
    case "resolved":
      return "text-green-400";
    case "dismissed":
      return "text-gray-400";
    case "record_only":
      return "text-blue-400";
    default:
      return "";
  }
}

function EvidenceThumb({ imagePath }: { imagePath: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "160px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-14 w-20 overflow-hidden rounded bg-muted/40">
      {visible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagePath}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

export function IncidentTable({
  initialIncidents,
  initialTotal,
  initialStatusCounts,
  filterQuery,
  pageSize = 20,
}: {
  initialIncidents: IncidentRow[];
  initialTotal: number;
  initialStatusCounts: Record<string, number>;
  /** Extra query string already applied on the server (risk/category). */
  filterQuery?: string;
  pageSize?: number;
}) {
  const t = useTranslations("incidents");
  const tCommon = useTranslations("common");
  const FILTERS: Array<{ label: string; value: IncidentStatus | "all" }> = [
    { label: t("filterAll"), value: "all" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterAcknowledged"), value: "acknowledged" },
    { label: t("filterResolved"), value: "resolved" },
    { label: t("filterDismissed"), value: "dismissed" },
    { label: t("filterRecordOnly"), value: "record_only" },
  ];

  const [filter, setFilter] = useState<IncidentStatus | "all">("all");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [total, setTotal] = useState(initialTotal);
  const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const loadingRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setIncidents(initialIncidents);
    setTotal(initialTotal);
    setStatusCounts(initialStatusCounts);
    setFilter("all");
    setPage(1);
    setHiddenIds(new Set());
  }, [initialIncidents, initialTotal, initialStatusCounts]);

  function onStatusChange(incidentId: string, newStatus: IncidentStatus) {
    if (newStatus === "dismissed") {
      setHiddenIds((prev) => new Set([...prev, incidentId]));
    }
  }

  const buildUrl = useCallback(
    (targetPage: number, status: IncidentStatus | "all") => {
      const params = new URLSearchParams(filterQuery ?? "");
      params.delete("status");
      params.delete("cursor");
      params.delete("offset");
      params.set("limit", String(pageSize));
      params.set("offset", String((targetPage - 1) * pageSize));
      if (status !== "all") params.set("status", status);
      return `/api/incidents?${params.toString()}`;
    },
    [filterQuery, pageSize]
  );

  const fetchPage = useCallback(
    async (targetPage: number, status: IncidentStatus | "all") => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await fetch(buildUrl(targetPage, status), { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data;
        if (!data?.incidents) return;
        setIncidents(data.incidents);
        if (typeof data.total === "number") setTotal(data.total);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
        setPage(targetPage);
        window.scrollTo({ top: 0 });
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [buildUrl]
  );

  const changeFilter = useCallback(
    (value: IncidentStatus | "all") => {
      setFilter(value);
      setHiddenIds(new Set());
      void fetchPage(1, value);
    },
    [fetchPage]
  );

  const visible = incidents.filter((i) => !hiddenIds.has(i.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("incidentTracking")}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => changeFilter(f.value)}
                disabled={loading}
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1 text-xs opacity-60">
                    ({statusCounts[f.value] ?? 0})
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colType")}</TableHead>
              <TableHead>{t("colRisk")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead>{t("colCamera")}</TableHead>
              <TableHead>{t("colZone")}</TableHead>
              <TableHead>{t("colDetected")}</TableHead>
              <TableHead>{t("colEvidence")}</TableHead>
              <TableHead>{t("colAssigned")}</TableHead>
              <TableHead>{t("colAction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  {loading ? "…" : t("noIncidentsFound")}
                </TableCell>
              </TableRow>
            )}
            {visible.map((incident) => (
              <TableRow key={incident.id} className="hover:bg-muted/50">
                <TableCell>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="flex items-center gap-2 hover:underline focus:outline-none"
                  >
                    <span>
                      {t(`types.${incident.type}` as Parameters<typeof t>[0]) ||
                        incident.type.replaceAll("_", " ")}
                    </span>
                    {incident.recordOnly && (
                      <Badge variant="secondary" className="text-xs">
                        {t("record")}
                      </Badge>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={riskVariant(incident.riskLevel)}>
                    {tCommon(`riskLevel.${incident.riskLevel}` as Parameters<typeof tCommon>[0])}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={statusColor(incident.status)}>
                    {tCommon(`status.${incident.status}` as Parameters<typeof tCommon>[0])}
                  </span>
                </TableCell>
                <TableCell>{incident.camera.name}</TableCell>
                <TableCell>{incident.zone.name}</TableCell>
                <TableCell className="text-xs">{formatHKT(incident.detectedAt)}</TableCell>
                <TableCell>
                  {incident.evidence?.imagePath ? (
                    <Link href={`/incidents/${incident.id}`} className="block">
                      <EvidenceThumb imagePath={incident.evidence.imagePath} />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{incident.assignee?.name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="inline-flex items-center rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      {t("view")}
                    </Link>
                    <IncidentActions
                      incidentId={incident.id}
                      currentStatus={incident.status}
                      onStatusChange={onStatusChange}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager
          page={page}
          pageCount={pageCount}
          loading={loading}
          onGo={(p) => void fetchPage(p, filter)}
        />
      </CardContent>
    </Card>
  );
}
