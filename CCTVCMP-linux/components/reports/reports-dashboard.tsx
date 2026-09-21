"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReportFileItem } from "@/lib/reports/report-files";

type GenerateSummary = {
  status: string;
  highlights: number;
  reviews: number;
  cameras: number;
  confidence: string;
  narrativeSource?: "llm" | "template";
  narrativeModel?: string | null;
};

type ReportPagePayload = {
  reports: ReportFileItem[];
  total: number;
  dailyCount: number;
  formats: Array<"pdf" | "docx">;
  nextOffset: number | null;
};

type Props = {
  initialReports: ReportFileItem[];
  initialNextOffset: number | null;
  initialDailyCount: number;
  initialFormats: Array<"pdf" | "docx">;
  initialTotal: number;
  pageSize?: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Hong_Kong",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextRunLabel(): string {
  const now = new Date();
  const hktParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const values = Object.fromEntries(hktParts.map((part) => [part.type, part.value]));
  const after19 = Number(values.hour) >= 19;
  const base = new Date(`${values.year}-${values.month}-${values.day}T19:00:00+08:00`);
  if (after19) base.setUTCDate(base.getUTCDate() + 1);
  return base.toLocaleString("en-GB", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsDashboard({
  initialReports,
  initialNextOffset,
  initialDailyCount,
  initialFormats,
  initialTotal,
  pageSize = 20,
}: Props) {
  const [reports, setReports] = useState(initialReports);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [dailyCount, setDailyCount] = useState(initialDailyCount);
  const [formats, setFormats] = useState(initialFormats);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [generating, setGenerating] = useState<"pdf" | "docx" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<GenerateSummary | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const latest = reports[0] ?? null;

  useEffect(() => {
    setReports(initialReports);
    setNextOffset(initialNextOffset);
    setDailyCount(initialDailyCount);
    setFormats(initialFormats);
    setTotal(initialTotal);
  }, [initialReports, initialNextOffset, initialDailyCount, initialFormats, initialTotal]);

  function applyPage(page: ReportPagePayload, mode: "replace" | "append") {
    setDailyCount(page.dailyCount);
    setFormats(page.formats);
    setTotal(page.total);
    setNextOffset(page.nextOffset);
    if (mode === "replace") {
      setReports(page.reports);
      return;
    }
    setReports((prev) => {
      const seen = new Set(prev.map((r) => r.filename));
      return [...prev, ...page.reports.filter((r) => !seen.has(r.filename))];
    });
  }

  async function refreshReports() {
    const response = await fetch(`/api/reports?offset=0&limit=${pageSize}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { data: ReportPagePayload };
    applyPage(payload.data, "replace");
  }

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/reports?offset=${nextOffset}&limit=${pageSize}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { data: ReportPagePayload };
      applyPage(payload.data, "append");
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || nextOffset == null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "240px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, nextOffset]);

  async function generate(format: "pdf" | "docx") {
    setGenerating(format);
    setMessage(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "daily", format }),
      });
      const payload = (await response.json()) as {
        data?: { filename: string; summary: GenerateSummary };
        message?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to generate report");
      }
      setLastSummary(payload.data.summary);
      const source = payload.data.summary.narrativeSource === "llm" ? "LLM narrative" : "template narrative";
      const model =
        payload.data.summary.narrativeSource === "llm" && payload.data.summary.narrativeModel
          ? ` (${payload.data.summary.narrativeModel})`
          : "";
      setMessage(`${payload.data.filename} generated successfully — ${source}${model}.`);
      await refreshReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate report");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <FileCheck2 className="h-4 w-4" />
            AVision reporting center
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Daily Safety Reports</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Evidence-backed management summaries: text results are aggregated by theme and each
            photo observation is labelled as confirmed or unverified.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => generate("pdf")}
            disabled={generating !== null}
            className="gap-2"
          >
            {generating === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => generate("docx")}
            disabled={generating !== null}
            className="gap-2"
          >
            {generating === "docx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCheck2 className="h-4 w-4" />
            )}
            Generate DOCX
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            message.includes("successfully")
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="overflow-hidden">
          <div className="h-1 bg-emerald-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Automation
                </p>
                <p className="mt-2 text-xl font-semibold">Active</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                <CalendarClock className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Next: {nextRunLabel()} HKT</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-sky-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Report window
                </p>
                <p className="mt-2 text-xl font-semibold">Previous 24h</p>
              </div>
              <div className="rounded-lg bg-sky-500/10 p-2 text-sky-600">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">19:00 yesterday → 19:00 today</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-violet-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reports stored
                </p>
                <p className="mt-2 text-xl font-semibold">{dailyCount}</p>
              </div>
              <div className="rounded-lg bg-violet-500/10 p-2 text-violet-600">
                <FileText className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {formats.map((value) => value.toUpperCase()).join(" + ") || "No reports yet"}
              {total > reports.length ? ` · ${reports.length}/${total} shown` : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest report
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {latest ? latest.format.toUpperCase() : "Pending"}
                </p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 truncate text-xs text-muted-foreground">
              {latest ? formatDate(latest.createdAt) : "Scheduled for 19:00 HKT"}
            </p>
          </CardContent>
        </Card>
      </div>

      {lastSummary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Status", lastSummary.status],
              ["Reviews", String(lastSummary.reviews)],
              ["Cameras", String(lastSummary.cameras)],
              ["Highlights", String(lastSummary.highlights)],
              ["Confidence", lastSummary.confidence],
              [
                "Narrative",
                lastSummary.narrativeSource === "llm"
                  ? `LLM${lastSummary.narrativeModel ? ` · ${lastSummary.narrativeModel}` : ""}`
                  : "Template",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold break-all">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Report history</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Generated safety reviews available for secure download.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="gap-2" onClick={refreshReports}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {!reports.length ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-center">
                <FileText className="mb-3 h-9 w-9 text-muted-foreground" />
                <p className="font-medium">No reports generated yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate one now or wait for the 19:00 HKT schedule.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.filename}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                        report.format === "pdf"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-blue-500/10 text-blue-600",
                      )}
                    >
                      {report.format.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {report.period === "daily" ? "Daily Safety Review" : "Weekly Safety Report"}
                        </p>
                        <Badge variant="outline">{report.reportDate}</Badge>
                        {report.variant === "evidence" ? (
                          <Badge>Evidence trial</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generated {formatDate(report.createdAt)} HKT · {formatBytes(report.size)}
                      </p>
                    </div>
                    <a
                      href={`/api/reports/${encodeURIComponent(report.filename)}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                ))}
                <div ref={sentinelRef} className="h-6 w-full" />
                {loadingMore && (
                  <p className="py-1 text-center text-xs text-muted-foreground">
                    Loading more reports…
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Evidence validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                [Camera, "Clear evidence", "Image must be usable and relevant."],
                [CheckCircle2, "Independent agreement", "Edge and CMP vision must agree."],
                [ImageIcon, "Duplicate control", "Repeated and static scenes are collapsed."],
                [ShieldCheck, "False-alarm exclusion", "Dismissed or uncertain alerts are omitted."],
              ].map(([Icon, title, description]) => {
                const IconComponent = Icon as typeof Camera;
                return (
                  <div className="flex gap-3" key={title as string}>
                    <div className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{title as string}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {description as string}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Report contents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                "Daily overview and management KPIs",
                "3–5 verified photo highlights",
                "Neutral observations and considerations",
                "Immediate, short-term and ongoing improvements",
                "Positive safety practices",
                "Monitoring coverage and confidence",
              ].map((item) => (
                <div className="flex items-start gap-2" key={item}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

