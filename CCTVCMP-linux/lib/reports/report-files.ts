import { mkdir, readdir, stat } from "fs/promises";
import { basename, join } from "path";

export const REPORT_OUTPUT_DIR =
  process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "data", "reports");

export type ReportFileItem = {
  filename: string;
  period: "daily" | "weekly";
  reportDate: string;
  variant: "standard" | "evidence";
  format: "pdf" | "docx";
  size: number;
  createdAt: string;
};

export type ReportFilesPage = {
  reports: ReportFileItem[];
  total: number;
  dailyCount: number;
  formats: Array<"pdf" | "docx">;
  nextOffset: number | null;
};

const REPORT_FILENAME = /^safety-(daily|weekly)-(\d{4}-\d{2}-\d{2})(-evidence)?\.(pdf|docx)$/;

type ParsedName = {
  filename: string;
  period: "daily" | "weekly";
  reportDate: string;
  variant: "standard" | "evidence";
  format: "pdf" | "docx";
};

function parseReportName(filename: string): ParsedName | null {
  const match = REPORT_FILENAME.exec(filename);
  if (!match) return null;
  return {
    filename,
    period: match[1] as "daily" | "weekly",
    reportDate: match[2],
    variant: match[3] ? "evidence" : "standard",
    format: match[4] as "pdf" | "docx",
  };
}

async function listParsedNames(): Promise<ParsedName[]> {
  await mkdir(REPORT_OUTPUT_DIR, { recursive: true });
  const names = await readdir(REPORT_OUTPUT_DIR);
  return names
    .map(parseReportName)
    .filter((row): row is ParsedName => row !== null)
    .sort((a, b) => {
      if (a.reportDate !== b.reportDate) return b.reportDate.localeCompare(a.reportDate);
      return b.filename.localeCompare(a.filename);
    });
}

async function hydrate(parsed: ParsedName): Promise<ReportFileItem | null> {
  try {
    const fileStat = await stat(join(REPORT_OUTPUT_DIR, parsed.filename));
    if (!fileStat.isFile()) return null;
    return {
      ...parsed,
      size: fileStat.size,
      createdAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

/** Full list (legacy). Prefer listReportFilesPage for UI. */
export async function listReportFiles(): Promise<ReportFileItem[]> {
  const page = await listReportFilesPage({ offset: 0, limit: 10_000 });
  return page.reports;
}

/** Gallery-style page: only `stat` files in the requested slice. */
export async function listReportFilesPage(options?: {
  offset?: number;
  limit?: number;
}): Promise<ReportFilesPage> {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

  const parsed = await listParsedNames();
  const dailyCount = parsed.filter((r) => r.period === "daily").length;
  const formats = Array.from(new Set(parsed.map((r) => r.format))) as Array<"pdf" | "docx">;

  const slice = parsed.slice(offset, offset + limit);
  const hydrated = await Promise.all(slice.map(hydrate));
  const reports = hydrated.filter((row): row is ReportFileItem => row !== null);
  // Keep display order by reportDate even if a file disappeared mid-request
  reports.sort((a, b) => {
    if (a.reportDate !== b.reportDate) return b.reportDate.localeCompare(a.reportDate);
    return b.createdAt.localeCompare(a.createdAt);
  });

  const nextOffset = offset + limit < parsed.length ? offset + limit : null;

  return {
    reports,
    total: parsed.length,
    dailyCount,
    formats,
    nextOffset,
  };
}

export function safeReportFilename(value: string): string | null {
  const filename = basename(value);
  return REPORT_FILENAME.test(filename) ? filename : null;
}
