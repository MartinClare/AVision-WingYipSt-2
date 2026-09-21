import { fetchAnalyticsSnapshot } from "@/lib/analytics";
import { AnalyticsCharts } from "@/components/analytics/charts";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function AnalyticsPage() {
  const snapshot = await fetchAnalyticsSnapshot();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">Last 30 days · {snapshot.totalReports.toLocaleString()} edge reports · auto-refreshes every 60 s</p>
      </div>
      <AutoRefresh intervalSec={60} />
      <AnalyticsCharts snapshot={snapshot} />
    </div>
  );
}
