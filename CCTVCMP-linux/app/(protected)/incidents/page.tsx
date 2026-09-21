import type { IncidentRiskLevel, IncidentStatus } from "@prisma/client";
import { IncidentTable } from "@/components/incidents/incident-table";
import { getTranslations } from "next-intl/server";
import { isRiskCategoryKey, typesForCategory } from "@/lib/incident-categories";
import { listIncidentsPage } from "@/lib/incidents-list";

const VALID_STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved", "dismissed", "record_only"];
const VALID_RISKS: IncidentRiskLevel[] = ["low", "medium", "high", "critical"];

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("incidents");
  const params = await searchParams;

  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const riskParam = typeof params.riskLevel === "string" ? params.riskLevel : undefined;
  const categoryParam = typeof params.category === "string" ? params.category : undefined;
  const categoryFilter = isRiskCategoryKey(categoryParam) ? categoryParam : null;
  const categoryTypes = categoryFilter ? typesForCategory(categoryFilter) : null;

  const statusFilter = statusParam
    ?.split(",")
    .filter((s): s is IncidentStatus => VALID_STATUSES.includes(s as IncidentStatus));

  const riskFilter = riskParam
    ?.split(",")
    .filter((r): r is IncidentRiskLevel => VALID_RISKS.includes(r as IncidentRiskLevel));

  const page = await listIncidentsPage({
    offset: 0,
    limit: 20,
    statusFilter,
    riskFilter,
    categoryTypes,
  });

  const tDash = categoryFilter ? await getTranslations("dashboard") : null;
  const filterLabel = [
    categoryFilter && tDash ? tDash(`categories.${categoryFilter}`) : null,
    statusFilter?.length ? statusFilter.join(", ") : null,
    riskFilter?.length ? riskFilter.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterQuery = new URLSearchParams();
  if (riskParam) filterQuery.set("riskLevel", riskParam);
  if (categoryParam) filterQuery.set("category", categoryParam);
  // status filter is controlled by the table buttons; URL status still applied on first paint
  if (statusParam) filterQuery.set("status", statusParam);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          {filterLabel && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("filteredBy")} <span className="font-medium text-foreground">{filterLabel}</span>
              &nbsp;·&nbsp;
              <a href="/incidents" className="text-primary hover:underline">
                {t("clearFilter")}
              </a>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Showing {page.incidents.length}
            {page.total > page.incidents.length ? ` of ${page.total}` : ""}
          </p>
        </div>
      </div>
      <IncidentTable
        initialIncidents={page.incidents}
        initialTotal={page.total}
        initialStatusCounts={page.statusCounts}
        filterQuery={filterQuery.toString()}
        pageSize={20}
      />
    </div>
  );
}
