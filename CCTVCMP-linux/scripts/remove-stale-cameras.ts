/**
 * remove-stale-cameras.ts — delete orphaned camera rows left over from the
 * camera-ID rename (camera1–camera32 → av2_camera1–av2_camera32).
 *
 * Run:
 *   npm run remove-stale-cameras
 *
 * All dependent rows (EdgeReport, Incident, IncidentLog, NotificationLog,
 * MobilePushLog) are removed automatically via DB cascade.
 */

import { PrismaClient } from "@prisma/client";

// IDs that existed before the av2_ prefix was added
const STALE_IDS = Array.from({ length: 32 }, (_, i) => `camera${i + 1}`);

void (async () => {
  const prisma = new PrismaClient();
  try {
    // Find stale rows first so we can report what will be removed
    const stale = await prisma.camera.findMany({
      where: { edgeCameraId: { in: STALE_IDS } },
      select: {
        id: true,
        edgeCameraId: true,
        name: true,
        _count: { select: { edgeReports: true, incidents: true } },
      },
    });

    if (stale.length === 0) {
      console.log("No stale cameras found — nothing to do.");
      return;
    }

    console.log(`Found ${stale.length} stale camera(s) to remove:\n`);
    for (const c of stale) {
      console.log(
        `  ${c.edgeCameraId?.padEnd(12)} "${c.name}"` +
        `  (${c._count.edgeReports} reports, ${c._count.incidents} incidents)`
      );
    }

    // Single deleteMany — DB cascades handle all child rows automatically
    const { count } = await prisma.camera.deleteMany({
      where: { edgeCameraId: { in: STALE_IDS } },
    });

    console.log(`\n✓ Removed ${count} stale camera(s) and all related data.`);
    console.log("  Reload the CMP dashboard to confirm.\n");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
