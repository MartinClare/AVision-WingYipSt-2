import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AnalyticsReport = {
  receivedAt: Date;
  overallRiskLevel: string;
  cmpRiskLevel: string | null;
  peopleCount: number | null;
  missingHardhats: number | null;
  missingVests: number | null;
  keepalive: boolean;
  messageType: string;
};

export type TrendPoint = {
  date: string;
  totalReports: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  /** PPE compliance %, null when no people were detected that day */
  ppeCompliance: number | null;
};

export type AnalyticsSnapshot = {
  trend: TrendPoint[];
  totalReports: number;
  highRiskCount: number;
  totalPeopleDetected: number;
  /** Overall PPE compliance %, null when no people detected */
  ppeCompliance: number | null;
};

function asNumber(value: bigint | number | string): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value);
}

/** Derive all analytics from real EdgeReport rows. Excludes keepalive-only rows. */
export function buildAnalyticsSnapshot(reports: AnalyticsReport[]): AnalyticsSnapshot {
  const dailyMap = new Map<
    string,
    { total: number; high: number; medium: number; low: number; withPeople: number; ppeCompliant: number }
  >();

  let totalHighRisk = 0;
  let totalWithPeople = 0;
  let totalPpeCompliant = 0;
  let totalPeopleDetected = 0;
  let totalReports = 0;

  for (const r of reports) {
    if (r.keepalive || r.messageType === "keepalive") continue;

    // Shift UTC → HKT (+8 h) then take YYYY-MM-DD
    const hktMs = r.receivedAt.getTime() + 8 * 60 * 60 * 1000;
    const hktDate = new Date(hktMs).toISOString().slice(0, 10);

    if (!dailyMap.has(hktDate)) {
      dailyMap.set(hktDate, { total: 0, high: 0, medium: 0, low: 0, withPeople: 0, ppeCompliant: 0 });
    }
    const day = dailyMap.get(hktDate)!;
    day.total++;
    totalReports++;

    const risk = (r.cmpRiskLevel || r.overallRiskLevel || "Low").toLowerCase();
    if (risk === "high") { day.high++; totalHighRisk++; }
    else if (risk === "critical") { day.high++; totalHighRisk++; }
    else if (risk === "medium") day.medium++;
    else day.low++;

    const people = r.peopleCount ?? 0;
    totalPeopleDetected += people;

    if (people > 0) {
      day.withPeople++;
      totalWithPeople++;
      const compliant = (r.missingHardhats ?? 0) === 0 && (r.missingVests ?? 0) === 0;
      if (compliant) { day.ppeCompliant++; totalPpeCompliant++; }
    }
  }

  const trend: TrendPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      totalReports: v.total,
      highRisk: v.high,
      mediumRisk: v.medium,
      lowRisk: v.low,
      ppeCompliance: v.withPeople > 0 ? Math.round((v.ppeCompliant / v.withPeople) * 100) : null,
    }));

  return {
    trend,
    totalReports,
    highRiskCount: totalHighRisk,
    totalPeopleDetected,
    ppeCompliance: totalWithPeople > 0 ? Math.round((totalPpeCompliant / totalWithPeople) * 100) : null,
  };
}

/**
 * Daily aggregates in SQL so Analytics does not load ~1M keepalive rows into Node.
 * That load froze AVision top-tab navigation (Dashboard / Edge / Incidents / …).
 */
export async function fetchAnalyticsSnapshot(options?: {
  since?: Date;
  projectId?: string | null;
}): Promise<AnalyticsSnapshot> {
  const since = options?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const projectId = options?.projectId?.trim() || null;

  const rows = await prisma.$queryRaw<
    {
      day: string;
      total: bigint;
      high: bigint;
      medium: bigint;
      low: bigint;
      with_people: bigint;
      ppe_compliant: bigint;
      people_sum: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      to_char(er.received_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(er.cmp_risk_level, er.overall_risk_level, 'low')) IN ('high', 'critical')
      )::bigint AS high,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(er.cmp_risk_level, er.overall_risk_level, 'low')) = 'medium'
      )::bigint AS medium,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(er.cmp_risk_level, er.overall_risk_level, 'low')) NOT IN ('high', 'critical', 'medium')
      )::bigint AS low,
      COUNT(*) FILTER (WHERE COALESCE(er.people_count, 0) > 0)::bigint AS with_people,
      COUNT(*) FILTER (
        WHERE COALESCE(er.people_count, 0) > 0
          AND COALESCE(er.missing_hardhats, 0) = 0
          AND COALESCE(er.missing_vests, 0) = 0
      )::bigint AS ppe_compliant,
      COALESCE(SUM(er.people_count), 0)::bigint AS people_sum
    FROM edge_reports er
    ${projectId ? Prisma.sql`INNER JOIN cameras c ON c.id = er.camera_id` : Prisma.empty}
    WHERE er.received_at >= ${since}
      AND er.keepalive = false
      AND er.message_type <> 'keepalive'
      ${projectId ? Prisma.sql`AND c.project_id = ${projectId}` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1
  `);

  let totalReports = 0;
  let highRiskCount = 0;
  let totalPeopleDetected = 0;
  let totalWithPeople = 0;
  let totalPpeCompliant = 0;

  const trend: TrendPoint[] = rows.map((row) => {
    const total = asNumber(row.total);
    const high = asNumber(row.high);
    const medium = asNumber(row.medium);
    const low = asNumber(row.low);
    const withPeople = asNumber(row.with_people);
    const ppeCompliant = asNumber(row.ppe_compliant);
    const peopleSum = asNumber(row.people_sum);

    totalReports += total;
    highRiskCount += high;
    totalPeopleDetected += peopleSum;
    totalWithPeople += withPeople;
    totalPpeCompliant += ppeCompliant;

    return {
      date: String(row.day).slice(0, 10),
      totalReports: total,
      highRisk: high,
      mediumRisk: medium,
      lowRisk: low,
      ppeCompliance: withPeople > 0 ? Math.round((ppeCompliant / withPeople) * 100) : null,
    };
  });

  return {
    trend,
    totalReports,
    highRiskCount,
    totalPeopleDetected,
    ppeCompliance: totalWithPeople > 0 ? Math.round((totalPpeCompliant / totalWithPeople) * 100) : null,
  };
}
