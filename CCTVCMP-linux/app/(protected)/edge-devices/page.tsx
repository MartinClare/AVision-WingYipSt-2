import { EdgeDeviceList } from "@/components/edge-devices/edge-device-list";
import { listEdgeDevicesPage } from "@/lib/edge-devices-list";
import { getTranslations } from "next-intl/server";

export default async function EdgeDevicesPage() {
  const t = await getTranslations("edgeDevices");
  const page = await listEdgeDevicesPage({ offset: 0, limit: 12 });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("onlineCount", { online: page.onlineCount, total: page.total })}
        </p>
      </div>
      <EdgeDeviceList
        initialDevices={page.devices}
        initialTotal={page.total}
        pageSize={12}
      />
    </div>
  );
}
