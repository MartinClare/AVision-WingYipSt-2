#!/usr/bin/env bash
# Forward spark public port 3002 to the central CMP on 192.168.10.148:3102.
# Run on spark (interlv@223.123.193.29) after stopping the local avision-cmp container.
set -euo pipefail

CENTRAL_CMP="${CENTRAL_CMP:-http://192.168.10.148:3102}"
REPO="${REPO:-$HOME/Documents/AVision-WIngYipSt}"
CONF="$REPO/deploy/cmp-central-proxy.conf"

mkdir -p "$(dirname "$CONF")"
cat > "$CONF" <<EOF
server {
    listen 3002;
    listen [::]:3002;
    server_name _;
    client_max_body_size 50m;
    location / {
        proxy_pass ${CENTRAL_CMP};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
EOF

echo "Stopping local spark CMP (central CMP is authoritative)..."
docker update --restart=no avision-cmp 2>/dev/null || true
docker stop avision-cmp 2>/dev/null || true

echo "Starting cmp-central-proxy on port 3002..."
docker rm -f cmp-central-proxy 2>/dev/null || true
docker run -d --name cmp-central-proxy --restart unless-stopped --network host \
  -v "$CONF:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine

sleep 2
curl -s -o /dev/null -w "proxy:%{http_code}\n" http://127.0.0.1:3002/api/mobile/me
echo "Public mobile URL: http://wingyip.axoncase.com:3002"
