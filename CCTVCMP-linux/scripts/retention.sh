#!/bin/bash
# CMP edge_reports retention: hot 7d -> archive 7-30d -> delete 30d+ (daily)
set -uo pipefail

APP=/home/axon/avision/AVision-WIngYipSt/CCTVCMP-linux
DBURL=$(grep -E '^DATABASE_URL=' "$APP/.env" | head -1 | cut -d'"' -f2 | sed 's/?schema=public//')
ARCHIVE_DIR=/home/axon/avision/archive/edge_reports
LOG=/home/axon/avision/archive/retention.log
mkdir -p "$ARCHIVE_DIR"

HOT_DAYS=${HOT_DAYS:-7}
DELETE_DAYS=${DELETE_DAYS:-30}
BATCH=${BATCH:-50000}
ARCHIVE_BATCH=10000
DO_VACUUM=0
[ "${1:-}" = "--vacuum" ] && DO_VACUUM=1
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log(){ echo "$(date -Is) $*" | tee -a "$LOG"; }

COLS="id, camera_id, edge_camera_id, camera_name, overall_risk_level, overall_description, people_count, missing_hardhats, missing_vests, raw_json, classification_json, received_at, message_type, keepalive, event_image_included, event_image_path, event_image_mime_type, event_image_data, event_timestamp, construction_safety_json, fire_safety_json, property_security_json, cmp_risk_level, vision_verification_json, translations_json"

log "--- retention run start (hot=${HOT_DAYS}d delete=${DELETE_DAYS}d dry=$DRY_RUN) ---"

# 0. Archive table (idempotent)
psql "$DBURL" -v ON_ERROR_STOP=1 >>"$LOG" 2>&1 <<SQL
CREATE TABLE IF NOT EXISTS edge_reports_archive (LIKE edge_reports INCLUDING DEFAULTS);
ALTER TABLE edge_reports_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS edge_reports_archive_received_at_idx ON edge_reports_archive (received_at);
CREATE INDEX IF NOT EXISTS edge_reports_archive_camera_id_idx ON edge_reports_archive (camera_id);
SQL
[ $? -ne 0 ] && { log "ERROR: archive table setup failed"; exit 1; }

# Dry-run counts
log "counts: $(psql "$DBURL" -Atc "
SELECT 'keepalive>${HOT_DAYS}d=' || count(*) FROM edge_reports WHERE keepalive AND received_at < now() - interval '$HOT_DAYS days';")"
log "counts: $(psql "$DBURL" -Atc "
SELECT 'events>${HOT_DAYS}d_unlinked=' || count(*) FROM edge_reports e
WHERE NOT keepalive AND received_at < now() - interval '$HOT_DAYS days'
  AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.edge_report_id = e.id);")"
log "counts: $(psql "$DBURL" -Atc "
SELECT 'archive>${DELETE_DAYS}d=' || count(*) FROM edge_reports_archive WHERE received_at < now() - interval '$DELETE_DAYS days';")"
[ "$DRY_RUN" = "1" ] && { log "--- dry run end ---"; exit 0; }

# 1. Delete old keepalives (heartbeats: no archive value), batched
ktotal=0
while :; do
  n=$(psql "$DBURL" -Atc "
    WITH b AS (SELECT id FROM edge_reports WHERE keepalive AND received_at < now() - interval '$HOT_DAYS days' LIMIT $BATCH),
         d AS (DELETE FROM edge_reports WHERE id IN (SELECT id FROM b) RETURNING id)
    SELECT count(*) FROM d;")
  [ $? -ne 0 ] && { log "ERROR: keepalive delete failed"; break; }
  n=${n:-0}; [ "$n" = "0" ] && break
  ktotal=$((ktotal + n)); log "keepalives deleted so far: $ktotal"
  sleep 0.3
done
log "keepalives deleted total: $ktotal"

# 2. Move old real events (not referenced by incidents) to archive, batched
atotal=0
while :; do
  n=$(psql "$DBURL" -Atc "
    WITH b AS (
      SELECT e.id FROM edge_reports e
      WHERE NOT e.keepalive AND e.received_at < now() - interval '$HOT_DAYS days'
        AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.edge_report_id = e.id)
      LIMIT $ARCHIVE_BATCH
    ),
    m AS (INSERT INTO edge_reports_archive ($COLS) SELECT $COLS FROM edge_reports WHERE id IN (SELECT id FROM b) RETURNING id),
    d AS (DELETE FROM edge_reports WHERE id IN (SELECT id FROM m) RETURNING id)
    SELECT count(*) FROM d;")
  [ $? -ne 0 ] && { log "ERROR: archive move failed"; break; }
  n=${n:-0}; [ "$n" = "0" ] && break
  atotal=$((atotal + n)); log "events archived so far: $atotal"
  sleep 0.3
done
log "events archived total: $atotal"

# 3. Dump + delete archive rows older than DELETE_DAYS
old=$(psql "$DBURL" -Atc "SELECT count(*) FROM edge_reports_archive WHERE received_at < now() - interval '$DELETE_DAYS days';")
old=${old:-0}
if [ "$old" -gt 0 ]; then
  dump="$ARCHIVE_DIR/purged-$(date +%Y%m%d-%H%M%S).jsonl.gz"
  psql "$DBURL" -Atc "SELECT row_to_json(a) FROM edge_reports_archive a WHERE received_at < now() - interval '$DELETE_DAYS days'" | gzip > "$dump"
  log "dumped $old archived rows to $dump ($(du -h "$dump" | cut -f1))"
  dtotal=0
  while :; do
    n=$(psql "$DBURL" -Atc "
      WITH b AS (SELECT id FROM edge_reports_archive WHERE received_at < now() - interval '$DELETE_DAYS days' LIMIT $BATCH),
           d AS (DELETE FROM edge_reports_archive WHERE id IN (SELECT id FROM b) RETURNING id)
      SELECT count(*) FROM d;")
    n=${n:-0}; [ "$n" = "0" ] && break
    dtotal=$((dtotal + n))
    sleep 0.2
  done
  log "archive rows purged total: $dtotal"
fi

# 4. Reclaim + refresh stats
if [ "$DO_VACUUM" = "1" ] && { [ "$ktotal" -gt 0 ] || [ "$atotal" -gt 0 ]; }; then
  log "VACUUM ANALYZE edge_reports ..."
  psql "$DBURL" -c "VACUUM ANALYZE edge_reports;" >>"$LOG" 2>&1
  psql "$DBURL" -c "VACUUM ANALYZE edge_reports_archive;" >>"$LOG" 2>&1
  log "vacuum done"
fi

log "--- retention run end: hot=$(psql "$DBURL" -Atc 'SELECT count(*) FROM edge_reports') archive=$(psql "$DBURL" -Atc 'SELECT count(*) FROM edge_reports_archive') size=$(psql "$DBURL" -Atc "SELECT pg_size_pretty(pg_total_relation_size('edge_reports'))") ---"
