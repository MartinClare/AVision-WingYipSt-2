import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const types = ["fall_risk","machinery_hazard","near_miss","ppe_violation","fire_detected"];
const since = new Date(Date.now() - 14*24*3600*1000);
for (const type of types) {
  const all = await p.incident.count({ where: { type } });
  const open = await p.incident.count({ where: { type, status: { in: ["open","acknowledged"] } } });
  const recent = await p.incident.count({ where: { type, detectedAt: { gte: since } } });
  const byStatus = await p.incident.groupBy({ by: ["status"], where: { type }, _count: true });
  console.log(JSON.stringify({ type, all, open, recent14d: recent, byStatus }));
}
const latest = await p.incident.findMany({
  where: { type: { in: ["fall_risk","machinery_hazard"] } },
  orderBy: { detectedAt: "desc" },
  take: 12,
  include: { camera: { select: { name: true } } },
});
for (const i of latest) {
  console.log("latest", i.type, i.riskLevel, i.status, i.recordOnly, i.camera.name, i.detectedAt.toISOString());
}
const rules = await p.alarmRule.findMany({ where: { incidentType: { in: ["fall_risk","machinery_hazard"] } } });
for (const r of rules) console.log("rule", r.incidentType, "enabled="+r.enabled, "recordOnly="+r.recordOnly, r.minRiskLevel, r.minConfidence);
await p.$disconnect();
