import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const fire = await prisma.alarmRule.updateMany({
    where: { incidentType: "fire_detected" },
    data: {
      enabled: true,
      recordOnly: false,
      minRiskLevel: "high",
      minConfidence: 0.75,
      dedupMinutes: 30,
      consecutiveHits: 2,
    },
  });
  const smoke = await prisma.alarmRule.updateMany({
    where: { incidentType: "smoke_detected" },
    data: {
      enabled: false,
      recordOnly: true,
      minRiskLevel: "high",
      minConfidence: 0.8,
      dedupMinutes: 30,
      consecutiveHits: 2,
    },
  });
  const ppe = await prisma.alarmRule.updateMany({
    where: { incidentType: "ppe_violation" },
    data: {
      enabled: true,
      recordOnly: false,
      minRiskLevel: "medium",
      minConfidence: 0.5,
      dedupMinutes: 5,
      consecutiveHits: 1,
    },
  });
  console.log(JSON.stringify({ fire, smoke, ppe }));
  const rules = await prisma.alarmRule.findMany({
    where: { incidentType: { in: ["fire_detected", "smoke_detected", "ppe_violation"] } },
    orderBy: { incidentType: "asc" },
  });
  for (const r of rules) {
    console.log(
      r.incidentType,
      "enabled=", r.enabled,
      "recordOnly=", r.recordOnly,
      "minRisk=", r.minRiskLevel,
      "minConf=", r.minConfidence,
      "dedup=", r.dedupMinutes,
      "consec=", r.consecutiveHits
    );
  }
}

main().finally(() => prisma.$disconnect());
