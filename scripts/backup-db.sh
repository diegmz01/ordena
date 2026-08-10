#!/usr/bin/env bash
set -euo pipefail

# Backup de la base de datos Postgres de Ordena.
#
# Corre pg_dump en formato custom (comprimido) contra DATABASE_URL y rota
# los dumps locales según BACKUP_RETENTION_DAYS. Pensado para correr por
# cron en el VPS (ver docs/DEPLOY.md → "Backups y restauración").
#
# Uso:
#   ./scripts/backup-db.sh
#   BACKUP_DIR=/var/backups/ordena BACKUP_RETENTION_DAYS=14 ./scripts/backup-db.sh
#
# Cron (diario a las 3am):
#   0 3 * * * DATABASE_URL=... /var/www/ordena/scripts/backup-db.sh >> /var/log/ordena-backup.log 2>&1

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ordena}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}==>${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

command -v pg_dump >/dev/null 2>&1 || fail "Comando requerido no encontrado: pg_dump"
[[ -n "${DATABASE_URL:-}" ]] || fail "Falta DATABASE_URL en el entorno"

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
dump_file="${BACKUP_DIR}/ordena-${timestamp}.dump"

log "Volcando base de datos a ${dump_file}"
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$dump_file"
ok "Dump creado ($(du -h "$dump_file" | cut -f1))"

log "Borrando dumps con más de ${BACKUP_RETENTION_DAYS} días en ${BACKUP_DIR}"
deleted=0
while IFS= read -r -d '' old_dump; do
  rm -f "$old_dump"
  deleted=$((deleted + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'ordena-*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -print0)
ok "Rotación completada (${deleted} dump(s) eliminados)"

ok "Backup finalizado: ${dump_file}"
