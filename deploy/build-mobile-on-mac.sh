#!/usr/bin/env bash
# Build the Wing Yip CMP Android APK on macOS (EAS cloud build).
#
# Typical Mac folder:
#   ~/Development/WingYipSt Avision Mobile
#
# Usage (on Mac):
#   CMP_API_URL=http://192.168.10.148:3102 bash deploy/build-mobile-on-mac.sh
# Or from the Mac mobile folder directly:
#   CMP_API_URL=http://192.168.10.148:3102 ./build-mobile-on-mac.sh
set -euo pipefail

MAC_MOBILE_DIR="${MAC_MOBILE_DIR:-$HOME/Development/WingYipSt Avision Mobile}"
CMP_API_URL="${CMP_API_URL:-http://wingyip.axoncase.com:3102}"
BUILD_PROFILE="${BUILD_PROFILE:-production}"

if [[ -d "$MAC_MOBILE_DIR" ]]; then
  cd "$MAC_MOBILE_DIR"
elif [[ -f package.json && -f app.config.js ]]; then
  :
else
  echo "Mobile project not found at: $MAC_MOBILE_DIR" >&2
  echo "Set MAC_MOBILE_DIR to your Wing Yip mobile folder." >&2
  exit 1
fi

export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"

echo "Mobile dir: $(pwd)"
echo "CMP API URL: $EXPO_PUBLIC_CMP_API_URL"
echo "EAS profile: $BUILD_PROFILE"

if ! command -v eas >/dev/null 2>&1; then
  echo "Installing eas-cli..."
  npm install -g eas-cli
fi

npm install

# Keep local dev + EAS build env aligned with the central CMP host.
if grep -q '^EXPO_PUBLIC_CMP_API_URL=' .env 2>/dev/null; then
  sed -i '' "s|^EXPO_PUBLIC_CMP_API_URL=.*|EXPO_PUBLIC_CMP_API_URL=${EXPO_PUBLIC_CMP_API_URL}|" .env
else
  printf '\nEXPO_PUBLIC_CMP_API_URL=%s\n' "$EXPO_PUBLIC_CMP_API_URL" >> .env
fi

node <<'NODE'
const fs = require("fs");
const path = "eas.json";
const cmpUrl = process.env.EXPO_PUBLIC_CMP_API_URL;
const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
for (const profile of ["preview", "production"]) {
  cfg.build[profile].env.EXPO_PUBLIC_CMP_API_URL = cmpUrl;
}
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
console.log("Updated eas.json profiles to", cmpUrl);
NODE

echo ""
echo "Starting EAS APK build..."
if [[ "$BUILD_PROFILE" == "preview" ]]; then
  npm run build:apk:preview
else
  npm run build:apk
fi

echo ""
echo "When the build finishes, download the APK from the EAS dashboard and install on phones."
echo "Then sign in and use Settings -> Register this device for push."
