import { KpiCards } from "@/components/kpi-cards";
import { EdgeStatusPanel } from "@/components/dashboard/edge-status-panel";
import { RiskBreakdown } from "@/components/dashboard/risk-breakdown";
import { AlertFeed } from "@/components/dashboard/alert-feed";
import {
  getDashboardAlertsPage,
  getDashboardEdgePage,
  getDashboardIncidentSummary,
} from "@/lib/dashboard-data";
import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const [incidentSummary, edgePage, alertsPage] = await Promise.all([
    getDashboardIncidentSummary(),
    getDashboardEdgePage(0, 12),
    getDashboardAlertsPage(null, 20, 0),
  ]);

  const riskCategories = incidentSummary.riskCategories.map((cat) => ({
    ...cat,
    category: t(`categories.${cat.categoryKey}`),
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <KpiCards
        edgeOnline={edgePage.onlineCount}
        edgeTotal={edgePage.total}
        openIncidents={incidentSummary.openIncidents}
        highCriticalRisk={incidentSummary.highCriticalRisk}
        avgResponseTime={incidentSummary.avgResponseTime}
      />
      <EdgeStatusPanel
        initialDevices={edgePage.devices}
        initialTotal={edgePage.total}
        pageSize={12}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <RiskBreakdown categories={riskCategories} />
        <AlertFeed
          initialIncidents={alertsPage.incidents}
          initialTotal={alertsPage.total}
          pageSize={20}
        />
      </div>
    </div>
  );
}
