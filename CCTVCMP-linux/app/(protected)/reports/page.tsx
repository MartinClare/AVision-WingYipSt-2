import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { listReportFiles } from "@/lib/reports/report-files";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await listReportFiles();
  return <ReportsDashboard initialReports={reports} />;
}
