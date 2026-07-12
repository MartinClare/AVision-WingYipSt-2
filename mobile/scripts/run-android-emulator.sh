#!/usr/bin/env bash
# Run AXON Vision CMP on Android emulator (Mac + Android Studio).
#
# One-time: Android Studio → Device Manager → Create Device (e.g. Pixel 6, API 34)
#
# Usage:
#   cd mobile
#   npm install
#   npm run android:emu
#
# Or start emulator from Android Studio first, then:
#   npm run android
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CMP_API_URL="${EXPO_PUBLIC_CMP_API_URL:-http://wingyip.axoncase.com:3102}"
export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"

if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

if [[ -z "${JAVA_HOME:-}" && -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
fi

echo "==> CMP API: $EXPO_PUBLIC_CMP_API_URL"
echo ""

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Open Android Studio once and install Android SDK Platform Tools." >&2
  echo "Or: export ANDROID_HOME=\"\$HOME/Library/Android/sdk\"" >&2
  exit 1
fi

if ! adb devices | grep -qE 'emulator-[0-9]+[[:space:]]+device'; then
  echo "No running emulator detected."
  echo ""
  echo "Start one from Android Studio:"
  echo "  Device Manager → ▶ on a virtual device (e.g. Pixel 6 API 34)"
  echo ""
  echo "Or from terminal (after creating an AVD):"
  echo "  emulator -list-avds"
  echo "  emulator -avd \"Pixel_6_API_34\""
  exit 1
fi

npm install

if [[ ! -d android || ! -f android/gradlew ]]; then
  echo "==> First run: generating native Android project..."
  npx expo prebuild --platform android --no-install
fi

echo "==> Building and launching on emulator..."
npx expo run:android
