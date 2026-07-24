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

const REPORT_FILENAME = /^safety-(daily|weekly)-(\d{4}-\d{2}-\d{2})(-evidence)?\.(pdf|docx)$/;

export async function listReportFiles(): Promise<ReportFileItem[]> {
  await mkdir(REPORT_OUTPUT_DIR, { recursive: true });
  const names = await readdir(REPORT_OUTPUT_DIR);
  const rows = await Promise.all(
    names.map(async (filename): Promise<ReportFileItem | null> => {
      const match = REPORT_FILENAME.exec(filename);
      if (!match) return null;
      const fileStat = await stat(join(REPORT_OUTPUT_DIR, filename));
      if (!fileStat.isFile()) return null;
      return {
        filename,
        period: match[1] as "daily" | "weekly",
        reportDate: match[2],
        variant: match[3] ? "evidence" : "standard",
        format: match[4] as "pdf" | "docx",
        size: fileStat.size,
        createdAt: fileStat.mtime.toISOString(),
      };
    }),
  );

  return rows
    .filter((row): row is ReportFileItem => row !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function safeReportFilename(value: string): string | null {
  const filename = basename(value);
  return REPORT_FILENAME.test(filename) ? filename : null;
}
