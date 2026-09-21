import { processEdgeReportJob } from "@/lib/process-edge-report-job";
import { prisma } from "@/lib/prisma";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: process-edge-report-job.ts <edgeReportId>");
    process.exit(2);
  }
  try {
    await processEdgeReportJob(id);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[job] failed", err);
    process.exit(1);
  });
