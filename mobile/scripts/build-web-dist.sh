#!/usr/bin/env bash
# Build and deploy the mobile web preview (browser) against central CMP :3102.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

export EXPO_PUBLIC_CMP_API_URL="${EXPO_PUBLIC_CMP_API_URL:-http://wingyip.axoncase.com:3102}"

echo "Building web export -> CMP $EXPO_PUBLIC_CMP_API_URL"
npx expo export --platform web

mkdir -p dist/assets/images public/assets/images
cp -f assets/images/splash-web.jpg dist/assets/images/splash-web.jpg
cp -f assets/images/splash-web.jpg public/assets/images/splash-web.jpg

rm -rf dist-web
cp -a dist dist-web

echo "Done. Start preview: PORT=8083 node scripts/serve-web-gzip.js"
