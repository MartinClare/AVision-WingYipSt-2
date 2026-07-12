#!/usr/bin/env bash
# Install hourly failure alerts + daily 08:00 status email for AVision healthcheck.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/healthcheck.py"
LOG_DIR="${HEALTHCHECK_LOG_DIR:-$HOME/avision-healthcheck}"
LOG_FILE="$LOG_DIR/healthcheck.log"

mkdir -p "$LOG_DIR"
chmod +x "$SCRIPT"

MARKER="# avision-healthcheck"
CRON_HOURLY="0 * * * * /usr/bin/python3 $SCRIPT >> $LOG_FILE 2>&1 $MARKER hourly"
CRON_DAILY="0 8 * * * /usr/bin/python3 $SCRIPT --daily-report >> $LOG_FILE 2>&1 $MARKER daily"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "$existing" | grep -v "$MARKER" || true)"
{
  printf '%s\n' "$filtered" | sed '/^$/d'
  echo "$CRON_HOURLY"
  echo "$CRON_DAILY"
} | crontab -

echo "Installed AVision healthcheck cron jobs:"
echo "  Hourly (alert on failure): 0 * * * *"
echo "  Daily report at 08:00:     0 8 * * *"
echo "Log file: $LOG_FILE"
echo ""
echo "Test email now with:"
echo "  python3 $SCRIPT --test-email"
