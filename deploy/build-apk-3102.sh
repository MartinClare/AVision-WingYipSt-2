#!/usr/bin/env bash
# Build Wing Yip CMP Android APK (EAS cloud) targeting central CMP on :3102.
#
# Auth (pick one):
#   export EXPO_TOKEN=your_expo_access_token   # https://expo.dev/accounts/interlv/settings/access-tokens
#   eas login                                  # interactive
#
# Usage:
#   bash deploy/build-apk-3102.sh
#   MAC_MOBILE_DIR="$HOME/Development/WingYipSt Avision Mobile" bash deploy/build-apk-3102.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMP_API_URL="http://wingyip.axoncase.com:3102"
BUILD_PROFILE="${BUILD_PROFILE:-production}"
MAC_MOBILE_DIR="${MAC_MOBILE_DIR:-$HOME/Development/WingYipSt Avision Mobile}"

if [[ -d "$MAC_MOBILE_DIR" && -f "$MAC_MOBILE_DIR/package.json" ]]; then
  MOBILE_DIR="$MAC_MOBILE_DIR"
else
  MOBILE_DIR="$ROOT/mobile"
fi

export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"

echo "==> Mobile dir: $MOBILE_DIR"
echo "==> CMP API URL: $EXPO_PUBLIC_CMP_API_URL"
echo "==> EAS profile: $BUILD_PROFILE"

cd "$MOBILE_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node 20+ or run on your Mac." >&2
  exit 1
fi

if ! command -v eas >/dev/null 2>&1; then
  npm install -g eas-cli
fi

npm install

# Sync env for local tooling + EAS
if [[ -f .env ]]; then
  if grep -q '^EXPO_PUBLIC_CMP_API_URL=' .env; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^EXPO_PUBLIC_CMP_API_URL=.*|EXPO_PUBLIC_CMP_API_URL=${EXPO_PUBLIC_CMP_API_URL}|" .env
    else
      sed -i "s|^EXPO_PUBLIC_CMP_API_URL=.*|EXPO_PUBLIC_CMP_API_URL=${EXPO_PUBLIC_CMP_API_URL}|" .env
    fi
  else
    printf '\nEXPO_PUBLIC_CMP_API_URL=%s\n' "$EXPO_PUBLIC_CMP_API_URL" >> .env
  fi
else
  printf 'EXPO_PUBLIC_CMP_API_URL=%s\n' "$EXPO_PUBLIC_CMP_API_URL" > .env
fi

node <<'NODE'
const fs = require("fs");
const cmpUrl = process.env.EXPO_PUBLIC_CMP_API_URL;
const path = "eas.json";
const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
for (const profile of ["preview", "production"]) {
  cfg.build[profile].env.EXPO_PUBLIC_CMP_API_URL = cmpUrl;
}
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
console.log("Updated eas.json ->", cmpUrl);
NODE

if [[ -z "${EXPO_TOKEN:-}" ]]; then
  if ! eas whoami >/dev/null 2>&1; then
    echo ""
    echo "Not logged in to Expo. Either:" >&2
    echo "  1. export EXPO_TOKEN=... && bash $0" >&2
    echo "  2. eas login && bash $0" >&2
    echo "Token: https://expo.dev/accounts/interlv/settings/access-tokens" >&2
    exit 1
  fi
fi

echo ""
echo "==> Starting EAS cloud build (APK)..."
eas build --profile "$BUILD_PROFILE" --platform android --non-interactive

echo ""
echo "When finished, download the APK from the EAS build page."
echo "Install on phones, sign in, then Settings -> Register this device for push."
