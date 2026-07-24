import { RestrictedZoneMonitor } from "@/components/restricted-zone/restricted-zone-monitor";
import { RESTRICTED_ZONE_CAMERAS } from "@/lib/restricted-zone";
import { getTranslations } from "next-intl/server";

export default async function RestrictedZonePage() {
  const t = await getTranslations("restrictedZone");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { count: RESTRICTED_ZONE_CAMERAS.length })}
        </p>
      </div>
      <RestrictedZoneMonitor cameras={RESTRICTED_ZONE_CAMERAS} />
    </div>
  );
}
