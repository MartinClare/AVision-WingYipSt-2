import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { listReportFilesPage } from "@/lib/reports/report-files";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const page = await listReportFilesPage({ offset: 0, limit: 20 });
  return (
    <ReportsDashboard
      initialReports={page.reports}
      initialNextOffset={page.nextOffset}
      initialDailyCount={page.dailyCount}
      initialFormats={page.formats}
      initialTotal={page.total}
      pageSize={20}
    />
  );
}
