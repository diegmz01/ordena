#!/usr/bin/env bash
set -euo pipefail

# Restaura un dump generado por scripts/backup-db.sh en DATABASE_URL.
#
# ADVERTENCIA: sobreescribe los datos existentes en la base de destino
# (--clean --if-exists). Pide confirmación interactiva salvo --yes.
#
# Uso:
#   ./scripts/restore-db.sh /var/backups/ordena/ordena-20260810-030000.dump
#   ./scripts/restore-db.sh --yes ruta/al/dump.dump

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}==>${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

usage() {
  cat <<EOF
Restaura un dump de Postgres (creado con scripts/backup-db.sh) en DATABASE_URL.

Uso:
  ./scripts/restore-db.sh [--yes] <archivo.dump>

Opciones:
  --yes    No pedir confirmación interactiva (útil para scripts/CI)
  --help   Muestra esta ayuda
EOF
}

AUTO_YES=0
DUMP_FILE=""

for arg in "$@"; do
  case "$arg" in
    --yes) AUTO_YES=1 ;;
    --help|-h) usage; exit 0 ;;
    -*) fail "Opción desconocida: $arg (usa --help)" ;;
    *) DUMP_FILE="$arg" ;;
  esac
done

command -v pg_restore >/dev/null 2>&1 || fail "Comando requerido no encontrado: pg_restore"
[[ -n "${DATABASE_URL:-}" ]] || fail "Falta DATABASE_URL en el entorno"
[[ -n "$DUMP_FILE" ]] || { usage; fail "Falta la ruta del archivo .dump"; }
[[ -f "$DUMP_FILE" ]] || fail "No existe el archivo: $DUMP_FILE"

warn "Esto sobreescribirá los datos actuales en la base de datos de DATABASE_URL."
warn "Archivo a restaurar: ${DUMP_FILE}"

if [[ "$AUTO_YES" -ne 1 ]]; then
  read -r -p "¿Continuar? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || fail "Cancelado por el usuario"
fi

log "Restaurando ${DUMP_FILE}"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$DUMP_FILE"
ok "Restauración completada"
