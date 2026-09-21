import { fetchTowerCraneSnapshot } from "./lib/tower-crane.ts";

async function main() {
  const s = await fetchTowerCraneSnapshot();
  const d = s.devices.filter(
    (x) => x.iconType === 6 || String(x.deviceId).includes("020260521002")
  );
  const iconTypes = Array.from(new Set(s.devices.map((x) => x.iconType)));
  console.log(
    JSON.stringify(
      {
        configured: s.configured,
        connected: s.connected,
        apiUrl: s.apiUrl,
        openJsession: s.openJsession,
        mediaHost: s.mediaHost,
        mediaPort: s.mediaPort,
        error: s.error,
        deviceCount: s.devices.length,
        iconTypes,
        tower: d.map((x) => ({
          deviceId: x.deviceId,
          displayName: x.displayName,
          iconType: x.iconType,
          online: x.online,
          channelCount: x.channelCount,
          channels: x.channels,
          videoUrl: x.videoUrl,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
