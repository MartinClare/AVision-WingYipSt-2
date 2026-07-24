import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rules = await prisma.alarmRule.findMany({
  where: { incidentType: { in: ["fall_risk", "machinery_hazard", "ppe_violation", "fire_detected", "near_miss"] } },
  orderBy: { incidentType: "asc" },
});
for (const r of rules) {
  console.log(JSON.stringify({
    type: r.incidentType,
    enabled: r.enabled,
    recordOnly: r.recordOnly,
    minRisk: r.minRiskLevel,
    minConf: r.minConfidence,
    dedup: r.dedupMinutes,
    consec: r.consecutiveHits,
  }));
}
const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
const incs = await prisma.incident.findMany({
  where: {
    detectedAt: { gte: since },
    type: { in: ["fall_risk", "machinery_hazard", "ppe_violation", "fire_detected"] },
  },
  select: { type: true, riskLevel: true, status: true, camera: { select: { name: true } }, reasoning: true },
  orderBy: { detectedAt: "desc" },
  take: 200,
});
const byType = {};
for (const i of incs) {
  byType[i.type] = byType[i.type] || { n: 0, cameras: {}, risks: {}, status: {} };
  byType[i.type].n++;
  byType[i.type].cameras[i.camera.name] = (byType[i.type].cameras[i.camera.name] || 0) + 1;
  byType[i.type].risks[i.riskLevel] = (byType[i.type].risks[i.riskLevel] || 0) + 1;
  byType[i.type].status[i.status] = (byType[i.type].status[i.status] || 0) + 1;
}
console.log("---14d counts---");
console.log(JSON.stringify(byType, null, 2));
await prisma.$disconnect();
