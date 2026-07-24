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
 *   npm run report:daily -- --skip-llm
 */

import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { applyLlmDailyNarrative } from "../lib/reports/apply-llm-daily-narrative";
import { fetchSafetyReportData } from "../lib/reports/fetch-safety-report-data";
import { generateLlmDailyNarrative } from "../lib/reports/generate-llm-daily-narrative";
import { generateSafetyReportDocx } from "../lib/reports/generate-safety-report-docx";
import { generateSafetyReportPdf } from "../lib/reports/generate-safety-report-pdf";
import type { ReportPeriod } from "../lib/reports/safety-report-types";

type ReportFormat = "docx" | "pdf" | "both";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  let period: ReportPeriod = "daily";
  let date = new Date();
  let output = "";
  let format: ReportFormat = "both";
  let skipLlm = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--period" && argv[i + 1]) {
      period = argv[++i] === "weekly" ? "weekly" : "daily";
    } else if ((arg === "--date" || arg === "-d") && argv[i + 1]) {
      date = new Date(argv[++i]);
    } else if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      output = argv[++i];
    } else if ((arg === "--format" || arg === "-f") && argv[i + 1]) {
      const value = argv[++i];
      format = value === "docx" || value === "pdf" || value === "both" ? value : "both";
    } else if (arg === "--skip-llm") {
      skipLlm = true;
    }
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid --date value");
  }
  if (format === "both" && output) {
    throw new Error("--output cannot be used with --format both");
  }

  return { period, date, output, format, skipLlm };
}

function reportDirs() {
  const outputDir = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "data", "reports");
  const logDir = process.env.REPORT_LOG_DIR ?? join(outputDir, "logs");
  const testingDir = join(outputDir, "testing-stage");
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(testingDir, { recursive: true });
  return { outputDir, logDir, testingDir };
}

function defaultOutputPath(period: ReportPeriod, date: Date, format: ReportFormat): string {
  const { outputDir } = reportDirs();
  const stamp = date.toISOString().slice(0, 10);
  const ext = format === "pdf" ? "pdf" : "docx";
  return join(outputDir, `safety-${period}-${stamp}.${ext}`);
}

function testingStageCopyPath(period: ReportPeriod, date: Date, format: ReportFormat): string {
  const { testingDir } = reportDirs();
  const stamp = date.toISOString().slice(0, 10);
  const ext = format === "pdf" ? "pdf" : "docx";
  return join(testingDir, `safety-${period}-${stamp}.${ext}`);
}

function appendReportLog(message: string): void {
  const { logDir } = reportDirs();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  appendFileSync(join(logDir, "daily-safety-report.log"), line);
  console.log(message);
}

async function main() {
  const { period, date, output, format, skipLlm } = parseArgs(process.argv.slice(2));
  appendReportLog(`Starting ${period} safety report generation (format=${format}, skipLlm=${skipLlm})`);

  let data = await fetchSafetyReportData(prisma, period, date);

  if (period === "daily") {
    const llmResult = await generateLlmDailyNarrative(data, { skip: skipLlm });
    if (llmResult.ok) {
      data = applyLlmDailyNarrative(data, llmResult.patch, {
        source: "llm",
        model: llmResult.model,
      });
      appendReportLog(`LLM narrative applied (model=${llmResult.model}, source=llm)`);
    } else {
      data = applyLlmDailyNarrative(data, null, {
        source: "template",
        model: llmResult.model,
      });
      appendReportLog(
        `LLM narrative fallback to templates (reason=${llmResult.reason}, model=${llmResult.model ?? "n/a"}, source=template)`,
      );
    }
  } else {
    data = {
      ...data,
      narrativeSource: "template",
      narrativeModel: null,
    };
  }

  const formats: Array<"pdf" | "docx"> =
    format === "both" ? ["pdf", "docx"] : [format];
  const writtenPaths: string[] = [];

  for (const outFormat of formats) {
    const outputPath = output || defaultOutputPath(period, date, outFormat);
    if (outFormat === "pdf") {
      await generateSafetyReportPdf(data, outputPath);
    } else {
      await generateSafetyReportDocx(data, outputPath);
    }
    const testingCopyPath = testingStageCopyPath(period, date, outFormat);
    copyFileSync(outputPath, testingCopyPath);
    writtenPaths.push(outputPath);
    appendReportLog(`Safety report generated (${outFormat}): ${outputPath}`);
    appendReportLog(`Testing-stage copy: ${testingCopyPath}`);
  }

  const { outputDir } = reportDirs();
  const generationMeta = {
    generatedAt: new Date().toISOString(),
    period,
    format,
    filename: writtenPaths.map((path) => path.split("/").pop()).join(", "),
    status: data.dailyStatus,
    highlights: data.highlights.length,
    reviews: data.kpis.reviewsCompleted,
    cameras: data.kpis.camerasReporting,
    confidence: data.monitoring.confidence,
    narrativeSource: data.narrativeSource ?? "template",
    narrativeModel: data.narrativeModel ?? null,
  };
  writeFileSync(
    join(outputDir, ".last-generation.json"),
    `${JSON.stringify(generationMeta, null, 2)}\n`,
    "utf8",
  );

  appendReportLog(`Period: ${data.title}`);
  appendReportLog(
    `Summary: status=${data.dailyStatus}, highlights=${data.highlights.length}, themes=${data.themeSummaries.length}, unverified=${data.unverifiedObservations.length}, reviews=${data.kpis.reviewsCompleted}, cameras=${data.kpis.camerasReporting}, confidence=${data.monitoring.confidence}, narrativeSource=${generationMeta.narrativeSource}, narrativeModel=${generationMeta.narrativeModel ?? "n/a"}`,
  );
}

main()
  .catch((err) => {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    try {
      appendReportLog(`FAILED to generate safety report: ${message}`);
    } catch {
      console.error("Failed to generate safety report:", err);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
