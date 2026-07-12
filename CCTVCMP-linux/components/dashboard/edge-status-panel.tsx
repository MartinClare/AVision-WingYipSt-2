import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatHKT } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { floorLabel, floorHeading } from "@/lib/camera-status";

type DeviceStatus = {
  id: string;
  name: string;
  edgeCameraId: string | null;
  streamUrl: string | null;
  isOnline: boolean;
  status: string;
  lastReportAt: string | null;
  latestRiskLevel: string | null;
  latestDescription: string | null;
};

export async function EdgeStatusPanel({ devices }: { devices: DeviceStatus[] }) {
  const t = await getTranslations("dashboard");

  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("edgeDevicesLabel")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("noDevicesYet")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("edgeDeviceStatus")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {(() => {
          // Group devices by floor, preserving the sorted order from the page
          const groups: { floor: string; items: typeof devices }[] = [];
          for (const d of devices) {
            const fl = floorLabel(d.name);
            const last = groups[groups.length - 1];
            if (last && last.floor === fl) last.items.push(d);
            else groups.push({ floor: fl, items: [d] });
          }
          return groups.map(({ floor, items }) => (
            <div key={floor}>
              {/* Floor heading */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {floorHeading(floor)}
                </span>
                <span className="text-xs text-muted-foreground/50">({items.length})</span>
                <div className="flex-1 border-t border-border/40" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => (
                  <Link
                    key={d.id}
                    href={`/edge-devices/${d.id}`}
                    className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            d.status === "maintenance"
                              ? "bg-yellow-400"
                              : d.isOnline
                              ? "bg-green-400 animate-pulse"
                              : "bg-red-400"
                          }`}
                        />
                        <span className="font-medium text-sm">{d.name}</span>
                      </div>
                      {d.latestRiskLevel && (
                        <Badge
                          variant={
                            d.latestRiskLevel === "High"
                              ? "destructive"
                              : d.latestRiskLevel === "Medium"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {d.latestRiskLevel}
                        </Badge>
                      )}
                    </div>
                    {d.latestDescription && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                        {d.latestDescription}
                      </p>
                    )}
                    {(d.edgeCameraId || d.streamUrl) && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1">
                        {d.edgeCameraId ?? "—"}
                        {d.streamUrl ? ` · ${d.streamUrl}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {d.lastReportAt
                        ? t("lastReport", { time: formatHKT(d.lastReportAt) })
                        : t("noReportsYet")}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ));
        })()}
      </CardContent>
    </Card>
  );
}
