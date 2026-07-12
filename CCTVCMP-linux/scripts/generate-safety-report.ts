/**
 * Generate a formatted daily or weekly safety summary report from CMP data.
 *
 * Examples:
 *   npm run report:daily
 *   npm run report:weekly
 *   npm run report:daily -- --format docx
 *   npm run report:daily -- --format pdf
 *   npm run report:daily -- --date 2026-06-24
 *   npm run report:daily -- --output /tmp/safety-daily.docx
 */

import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { fetchSafetyReportData } from "../lib/reports/fetch-safety-report-data";
import { generateSafetyReportDocx } from "../lib/reports/generate-safety-report-docx";
import { generateSafetyReportPdf } from "../lib/reports/generate-safety-report-pdf";
import type { ReportPeriod } from "../lib/reports/safety-report-types";

type ReportFormat = "docx" | "pdf";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  let period: ReportPeriod = "daily";
  let date = new Date();
  let output = "";
  let format: ReportFormat = "docx";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--period" && argv[i + 1]) {
      period = argv[++i] === "weekly" ? "weekly" : "daily";
    } else if ((arg === "--date" || arg === "-d") && argv[i + 1]) {
      date = new Date(argv[++i]);
    } else if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      output = argv[++i];
    } else if ((arg === "--format" || arg === "-f") && argv[i + 1]) {
      format = argv[++i] === "pdf" ? "pdf" : "docx";
    }
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid --date value");
  }

  return { period, date, output, format };
}

function defaultOutputPath(period: ReportPeriod, date: Date, format: ReportFormat): string {
  const dir = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "data", "reports");
  mkdirSync(dir, { recursive: true });
  const stamp = date.toISOString().slice(0, 10);
  const ext = format === "pdf" ? "pdf" : "docx";
  return join(dir, `safety-${period}-${stamp}.${ext}`);
}

function testingStageCopyPath(period: ReportPeriod, date: Date, format: ReportFormat): string {
  const dir = join(process.cwd(), "data", "reports", "testing-stage");
  mkdirSync(dir, { recursive: true });
  const stamp = date.toISOString().slice(0, 10);
  const ext = format === "pdf" ? "pdf" : "docx";
  return join(dir, `safety-${period}-${stamp}.${ext}`);
}

async function main() {
  const { period, date, output, format } = parseArgs(process.argv.slice(2));
  const data = await fetchSafetyReportData(prisma, period, date);
  const outputPath = output || defaultOutputPath(period, date, format);

  if (format === "pdf") {
    await generateSafetyReportPdf(data, outputPath);
  } else {
    await generateSafetyReportDocx(data, outputPath);
  }

  const testingCopyPath = testingStageCopyPath(period, date, format);
  copyFileSync(outputPath, testingCopyPath);

  console.log(`Safety report generated (${format}): ${outputPath}`);
  console.log(`Testing-stage copy: ${testingCopyPath}`);
  console.log(`Period: ${data.title}`);
  console.log(
    `Summary: ${data.summary.totalIncidents} incidents, ${data.summary.elevatedReports} elevated reports, ${data.findings.length} camera findings`,
  );
}

main()
  .catch((err) => {
    console.error("Failed to generate safety report:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
