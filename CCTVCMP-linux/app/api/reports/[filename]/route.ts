import { readFile, stat } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { REPORT_OUTPUT_DIR, safeReportFilename } from "@/lib/reports/report-files";

export async function GET(
  request: NextRequest,
  context: { params: { filename: string } },
) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const filename = safeReportFilename(decodeURIComponent(context.params.filename));
  if (!filename) return NextResponse.json({ message: "Invalid report filename" }, { status: 400 });

  const filePath = join(REPORT_OUTPUT_DIR, filename);
  try {
    const [bytes, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    const isPdf = filename.endsWith(".pdf");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": isPdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "Report not found" }, { status: 404 });
  }
}

