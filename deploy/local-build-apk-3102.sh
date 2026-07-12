#!/usr/bin/env bash
# Local Android APK (Android Studio / Gradle) — no EAS cloud queue.
#
# On Mac with Android Studio installed:
#   bash deploy/local-build-apk-3102.sh
#
# Android Studio workflow only:
#   STUDIO_ONLY=1 bash deploy/local-build-apk-3102.sh
#
# From Mac copy of repo:
#   MAC_MOBILE_DIR="$HOME/Development/WingYipSt Avision Mobile" bash deploy/local-build-apk-3102.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMP_API_URL="http://wingyip.axoncase.com:3102"
MAC_MOBILE_DIR="${MAC_MOBILE_DIR:-$HOME/Development/WingYipSt Avision Mobile}"

if [[ -d "$MAC_MOBILE_DIR" && -f "$MAC_MOBILE_DIR/package.json" ]]; then
  MOBILE_DIR="$MAC_MOBILE_DIR"
else
  MOBILE_DIR="$ROOT/mobile"
fi

export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"

echo "==> Mobile dir: $MOBILE_DIR"
echo "==> CMP API URL: $EXPO_PUBLIC_CMP_API_URL"

cd "$MOBILE_DIR"

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

bash scripts/local-android-apk.sh
