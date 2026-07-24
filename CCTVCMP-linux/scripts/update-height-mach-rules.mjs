import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const fall = await prisma.alarmRule.updateMany({
    where: { incidentType: "fall_risk" },
    data: {
      enabled: true,
      recordOnly: false,
      minRiskLevel: "medium",
      minConfidence: 0.5,
      dedupMinutes: 5,
      consecutiveHits: 1,
      name: "Work at Height / Fall Risk",
    },
  });
  const mach = await prisma.alarmRule.updateMany({
    where: { incidentType: "machinery_hazard" },
    data: {
      enabled: true,
      recordOnly: false,
      minRiskLevel: "medium",
      minConfidence: 0.5,
      dedupMinutes: 5,
      consecutiveHits: 1,
    },
  });
  console.log(JSON.stringify({ fall, mach }));
  const rules = await prisma.alarmRule.findMany({
    where: {
      incidentType: {
        in: ["fall_risk", "machinery_hazard", "ppe_violation", "fire_detected"],
      },
    },
    orderBy: { incidentType: "asc" },
  });
  for (const r of rules) {
    console.log(
      r.incidentType.padEnd(20),
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
