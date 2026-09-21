import { execFile } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSafetyReportData } from "@/lib/reports/fetch-safety-report-data";
import { listReportFilesPage } from "@/lib/reports/report-files";

const GENERATE_ROLES = new Set(["admin", "project_manager", "safety_officer"]);
const execFileAsync = promisify(execFile);
let generationInProgress = false;

export const runtime = "nodejs";

type GenerationMeta = {
  narrativeSource?: "llm" | "template";
  narrativeModel?: string | null;
  status?: string;
  highlights?: number;
  reviews?: number;
  cameras?: number;
  confidence?: string;
};

function readLastGenerationMeta(): GenerationMeta | null {
  try {
    const outputDir = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "data", "reports");
    const raw = readFileSync(join(outputDir, ".last-generation.json"), "utf8");
    return JSON.parse(raw) as GenerationMeta;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const offset = Number(sp.get("offset") ?? "0");
  const limit = Number(sp.get("limit") ?? "20");

  const page = await listReportFilesPage({
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 20,
  });

  return NextResponse.json({ data: page });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!GENERATE_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (generationInProgress) {
    return NextResponse.json({ message: "A report is already being generated" }, { status: 409 });
  }

  let body: { format?: unknown; period?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Defaults are valid.
  }
  const format = body.format === "docx" ? "docx" : "pdf";
  const period = body.period === "weekly" ? "weekly" : "daily";

  generationInProgress = true;
  try {
    const now = new Date();
    const data = await fetchSafetyReportData(prisma, period, now);
    const stamp = now.toISOString().slice(0, 10);
    const filename = `safety-${period}-${stamp}.${format}`;
    await execFileAsync(
      process.execPath,
      [
        "--env-file=.env",
        "./node_modules/tsx/dist/cli.mjs",
        "scripts/generate-safety-report.ts",
        "--period",
        period,
        "--format",
        format,
      ],
      {
        cwd: process.cwd(),
        timeout: 180_000,
        env: process.env,
      }
    );

    const meta = readLastGenerationMeta();

    return NextResponse.json({
      data: {
        filename,
        downloadUrl: `/api/reports/${encodeURIComponent(filename)}`,
        summary: {
          status: meta?.status ?? data.dailyStatus,
          highlights: meta?.highlights ?? data.highlights.length,
          reviews: meta?.reviews ?? data.kpis.reviewsCompleted,
          cameras: meta?.cameras ?? data.kpis.camerasReporting,
          confidence: meta?.confidence ?? data.monitoring.confidence,
          narrativeSource: meta?.narrativeSource ?? (period === "daily" ? "template" : "template"),
          narrativeModel: meta?.narrativeModel ?? null,
        },
      },
    });
  } catch (error) {
    console.error("[reports] Generation failed:", error);
    return NextResponse.json({ message: "Report generation failed" }, { status: 500 });
  } finally {
    generationInProgress = false;
  }
}
