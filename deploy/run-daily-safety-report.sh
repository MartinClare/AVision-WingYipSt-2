#!/usr/bin/env bash
# Generate the daily safety review PDF + DOCX for the preceding 24 hours ending 19:00 HKT.
# Reports are retained in data/reports (no automatic deletion).
# Intended to be run by systemd timer at 19:00 Asia/Hong_Kong.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMP_DIR="$ROOT/CCTVCMP-linux"
LOG_DIR="${REPORT_LOG_DIR:-$CMP_DIR/data/reports/logs}"

resolve_node() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  # Fall back to the newest Cursor-bundled Node (system Node is not installed here).
  local newest
  newest="$(ls -1dt /home/axon/.cursor-server/bin/linux-x64/*/node 2>/dev/null | head -n 1 || true)"
  if [[ -n "$newest" && -x "$newest" ]]; then
    printf '%s\n' "$newest"
    return 0
  fi
  return 1
}

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/daily-safety-report.log"

{
  echo "[$(date -Is)] daily-safety-report: start"
  cd "$CMP_DIR"

  if ! NODE_BIN="$(resolve_node)"; then
    echo "[$(date -Is)] daily-safety-report: node binary not found" >&2
    exit 127
  fi

  export PATH="$(dirname "$NODE_BIN"):$PATH"
  echo "[$(date -Is)] daily-safety-report: using node=$NODE_BIN ($("$NODE_BIN" -v))"

  "$NODE_BIN" --env-file=.env ./node_modules/tsx/dist/cli.mjs \
    scripts/generate-safety-report.ts \
    --period daily \
    --format both

  echo "[$(date -Is)] daily-safety-report: success"
} >>"$LOG_FILE" 2>&1
