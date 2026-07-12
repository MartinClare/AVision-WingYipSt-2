# CMP Mobile (Expo)

Native **standalone** app for AXON Vision CMP — full parity with the web dashboard: KPIs, filtered incidents with bounding boxes, edge device detail + report feed, analytics, settings, and push notifications.

## Quick start (dev)

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

Set `EXPO_PUBLIC_CMP_API_URL` to your CMP server (phones cannot use `localhost`).

**Public CMP URL (phones on Wi‑Fi or mobile data):** `http://wingyip.axoncase.com:3102`

**LAN-only fallback:** `http://192.168.10.148:3102`

## Build Android APK (macOS)

APK builds are done on the Mac in:

`~/Development/WingYipSt Avision Mobile`

From that folder (or from this repo on Mac):

```bash
CMP_API_URL=http://wingyip.axoncase.com:3102 bash deploy/build-mobile-on-mac.sh
```

Or manually:

```bash
cd ~/Development/WingYipSt\ Avision\ Mobile
cp .env.example .env   # if needed
# set EXPO_PUBLIC_CMP_API_URL=http://192.168.10.148:3102 in .env and eas.json
npm install -g eas-cli
npm install
eas login
npm run build:apk
```

Download the APK from the EAS build page when the cloud build completes.

See [README build section](README.md) in repo for push setup on CMP server.

## Background alerts

Native background alerts use Expo push notifications. They work when the APK is in the background or closed, after three things are done:

1. Build and install the standalone APK (`npm run build:apk` or `npm run build:apk:preview`).
2. Set `EXPO_ACCESS_TOKEN` on the CMP server and restart CMP:

```bash
export EXPO_ACCESS_TOKEN=your_expo_access_token
cd ..
./deploy/start-cmp.sh
```

3. Open the APK once, sign in, then go to **Settings → Register this device for push**. Use **Send test notification** to verify delivery.

The current mobile web preview cannot receive alerts while closed. That requires a separate HTTPS PWA Web Push setup.

## App identity

| Field | Value |
|-------|-------|
| App name | AXON Vision CMP |
| Android package | `com.axoncase.cmp` |
| EAS project | `4d418b37-ba61-4887-84e2-c489fecb5d17` |
