#!/usr/bin/env bash
# Daily backup — dumps the Postgres database + a manifest of MinIO bucket
# contents to a timestamped directory. Designed to run from the host via cron:
#   0 3 * * *  /opt/vrok/scripts/backup.sh >> /var/log/vrok-backup.log 2>&1
#
# Requires: docker compose stack running (postgres + minio services).
# Outputs:
#   $BACKUP_DIR/<YYYY-MM-DD>/db.sql.gz
#   $BACKUP_DIR/<YYYY-MM-DD>/minio-manifest.txt
#
# Retention is controlled by BACKUP_RETENTION_DAYS (default 14). Older
# folders are removed at the end. The script is idempotent: re-running on
# the same day overwrites the existing dump.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-zora-os}"
PG_USER="${POSTGRES_USER:-zora}"
PG_DB="${POSTGRES_DB:-zora}"
MINIO_BUCKET="${MINIO_BUCKET:-zora-media}"
TODAY="$(date +%Y-%m-%d)"
TARGET="${BACKUP_DIR}/${TODAY}"

mkdir -p "${TARGET}"

echo "→ pg_dump → ${TARGET}/db.sql.gz"
docker compose -p "${COMPOSE_PROJECT}" exec -T postgres \
  pg_dump -U "${PG_USER}" "${PG_DB}" --clean --if-exists \
  | gzip -9 > "${TARGET}/db.sql.gz"

echo "→ MinIO manifest → ${TARGET}/minio-manifest.txt"
docker compose -p "${COMPOSE_PROJECT}" exec -T minio \
  sh -c "mc ls --recursive local/${MINIO_BUCKET} || true" \
  > "${TARGET}/minio-manifest.txt" 2>&1 || true

# Optional: mirror MinIO bucket to a sibling folder. Disabled by default —
# enable with BACKUP_INCLUDE_MEDIA=1 if you have the disk budget.
if [[ "${BACKUP_INCLUDE_MEDIA:-0}" == "1" ]]; then
  echo "→ MinIO bucket mirror → ${TARGET}/media/"
  mkdir -p "${TARGET}/media"
  docker compose -p "${COMPOSE_PROJECT}" exec -T minio \
    mc mirror --quiet "local/${MINIO_BUCKET}" /tmp/backup-staging || true
  docker compose -p "${COMPOSE_PROJECT}" cp "minio:/tmp/backup-staging/." "${TARGET}/media/" || true
fi

echo "→ retention: prune > ${RETENTION_DAYS} days under ${BACKUP_DIR}"
find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -name "[0-9]*-[0-9]*-[0-9]*" \
  -exec rm -rf {} +

SIZE="$(du -sh "${TARGET}" | cut -f1)"
echo "✓ Backup complete: ${TARGET} (${SIZE})"
