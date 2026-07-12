#!/usr/bin/env bash
# Run on macOS in: ~/Development/WingYipSt Avision Mobile
# Updates CMP URL to :3102 and starts EAS APK build (requires eas login on Mac).
set -euo pipefail

CMP_API_URL="http://wingyip.axoncase.com:3102"
export EXPO_PUBLIC_CMP_API_URL="${CMP_API_URL%/}"

cd "${1:-$HOME/Development/WingYipSt Avision Mobile}"

echo "Directory: $(pwd)"
echo "CMP URL: $EXPO_PUBLIC_CMP_API_URL"

# .env
if grep -q '^EXPO_PUBLIC_CMP_API_URL=' .env 2>/dev/null; then
  sed -i '' "s|^EXPO_PUBLIC_CMP_API_URL=.*|EXPO_PUBLIC_CMP_API_URL=${EXPO_PUBLIC_CMP_API_URL}|" .env
else
  printf '\nEXPO_PUBLIC_CMP_API_URL=%s\n' "$EXPO_PUBLIC_CMP_API_URL" >> .env
fi

# eas.json
node <<'NODE'
const fs = require("fs");
const cmpUrl = process.env.EXPO_PUBLIC_CMP_API_URL;
const cfg = JSON.parse(fs.readFileSync("eas.json", "utf8"));
for (const p of ["preview", "production"]) {
  cfg.build[p].env.EXPO_PUBLIC_CMP_API_URL = cmpUrl;
}
fs.writeFileSync("eas.json", JSON.stringify(cfg, null, 2) + "\n");
NODE

# app.config.js fallback + version bump (if file exists)
if [[ -f app.config.js ]]; then
  sed -i '' 's|http://wingyip.axoncase.com:3002|http://wingyip.axoncase.com:3102|g' app.config.js
  sed -i '' 's|versionCode: 2|versionCode: 3|g' app.config.js
  sed -i '' 's|version: "2.0.0"|version: "2.0.1"|g' app.config.js
fi

if [[ -f constants/Config.ts ]]; then
  sed -i '' 's|http://localhost:3002|http://wingyip.axoncase.com:3102|g' constants/Config.ts
  sed -i '' 's|http://wingyip.axoncase.com:3002|http://wingyip.axoncase.com:3102|g' constants/Config.ts
fi

npm install
npm run build:apk

echo ""
echo "Download the APK from the EAS build page when the cloud build completes."
