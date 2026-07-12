#!/usr/bin/env bash
# Build Android APK locally (no EAS queue). Requires Android Studio / SDK + JDK.
#
# Quick CLI build:
#   cd mobile && npm run build:apk:local
#
# Android Studio only (generate native project, then open android/ in Studio):
#   cd mobile && npm run prebuild:android
#   open -a "Android Studio" android
#
# Env:
#   EXPO_PUBLIC_CMP_API_URL  default http://wingyip.axoncase.com:3102
#   BUILD_VARIANT            debug (default) | release
#   SKIP_PREBUILD=1          reuse existing android/ folder
#   STUDIO_ONLY=1            prebuild only, skip Gradle
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CMP_API_URL="${EXPO_PUBLIC_CMP_API_URL:-http://wingyip.axoncase.com:3102}"
export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"
BUILD_VARIANT="${BUILD_VARIANT:-debug}"
VERSION="$(grep -E '^\s*version:' app.config.js | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"

detect_android_home() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    return 0
  fi
  for candidate in \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk" \
    "/opt/android-sdk"; do
    if [[ -d "$candidate" ]]; then
      export ANDROID_HOME="$candidate"
      return 0
    fi
  done
  return 1
}

detect_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
    return 0
  fi
  if [[ -x "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    return 0
  fi
  if command -v java >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

echo "==> AXON Vision CMP — local Android APK"
echo "    CMP URL:     $EXPO_PUBLIC_CMP_API_URL"
echo "    App version: $VERSION"
echo "    Variant:     $BUILD_VARIANT"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20+." >&2
  exit 1
fi

npm install

if [[ "${SKIP_PREBUILD:-0}" != "1" ]]; then
  echo "==> expo prebuild (android) — applies cleartext HTTP plugin + native config"
  npx expo prebuild --platform android --no-install
else
  echo "==> Skipping prebuild (SKIP_PREBUILD=1)"
fi

if [[ "${STUDIO_ONLY:-0}" == "1" ]]; then
  echo ""
  echo "Native project ready at: $ROOT/android"
  echo ""
  echo "Android Studio:"
  echo "  1. File → Open → select the android folder"
  echo "  2. Wait for Gradle sync"
  echo "  3. Build → Build Bundle(s) / APK(s) → Build APK(s)"
  echo "     (or Build → Generate Signed Bundle / APK for release signing)"
  echo ""
  echo "APK output (debug): android/app/build/outputs/apk/debug/app-debug.apk"
  exit 0
fi

if ! detect_android_home; then
  echo "ANDROID_HOME not found. Install Android Studio and SDK, or set ANDROID_HOME." >&2
  echo "You can still use Android Studio: STUDIO_ONLY=1 npm run prebuild:android" >&2
  exit 1
fi

if ! detect_java_home; then
  echo "Java/JDK not found. Use Android Studio's bundled JDK or install JDK 17+." >&2
  exit 1
fi

export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"

if [[ ! -x "$ROOT/android/gradlew" ]]; then
  echo "Missing android/gradlew — run prebuild first." >&2
  exit 1
fi

chmod +x "$ROOT/android/gradlew"
cd "$ROOT/android"

APK_REL=""
if [[ "$BUILD_VARIANT" == "release" ]]; then
  if [[ -f "$ROOT/android/gradle.properties" ]] && grep -q 'MYAPP_UPLOAD_STORE_FILE' "$ROOT/android/gradle.properties" 2>/dev/null; then
    echo "==> Gradle assembleRelease (signed via gradle.properties)"
    ./gradlew assembleRelease --no-daemon
    APK_REL="app/build/outputs/apk/release/app-release.apk"
  else
    echo "==> No release keystore in android/gradle.properties — building debug APK instead."
    echo "    (Debug APK sideloads fine for internal testing.)"
    echo "    For signed release: copy android/gradle.properties.example → gradle.properties"
    BUILD_VARIANT="debug"
  fi
fi

if [[ "$BUILD_VARIANT" == "debug" ]]; then
  echo "==> Gradle assembleDebug"
  ./gradlew assembleDebug --no-daemon
  APK_REL="app/build/outputs/apk/debug/app-debug.apk"
fi

mkdir -p "$ROOT/builds"
OUT="$ROOT/builds/AXON-Vision-CMP-${VERSION}-${BUILD_VARIANT}-local.apk"
cp "$APK_REL" "$OUT"

echo ""
echo "Done."
echo "  APK: $OUT"
echo "  Install: adb install -r \"$OUT\""
echo ""
