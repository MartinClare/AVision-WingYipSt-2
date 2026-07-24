import { TowerCraneMonitor } from "@/components/tower-crane/tower-crane-monitor";
import { fetchTowerCraneSnapshot } from "@/lib/tower-crane";
import { getTranslations } from "next-intl/server";

export default async function TowerCranePage() {
  const t = await getTranslations("towerCrane");
  const snapshot = await fetchTowerCraneSnapshot();
  const onlineCount = snapshot.devices.filter((d) => d.online).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {snapshot.configured
            ? t("subtitle", { online: onlineCount, total: snapshot.devices.length })
            : t("subtitleUnconfigured")}
        </p>
      </div>
      <TowerCraneMonitor
        configured={snapshot.configured}
        connected={snapshot.connected}
        accountName={snapshot.accountName}
        companyName={snapshot.companyName}
        apiUrl={snapshot.apiUrl}
        openJsession={snapshot.openJsession}
        mediaHost={snapshot.mediaHost}
        mediaPort={snapshot.mediaPort}
        error={snapshot.error}
        fetchedAt={snapshot.fetchedAt}
        devices={snapshot.devices}
      />
    </div>
  );
}
