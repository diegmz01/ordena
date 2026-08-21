#!/usr/bin/env bash
set -euo pipefail

# Borra definitivamente todos los pedidos con status CANCELLED.
#
# Pide pegar el DATABASE_URL (input oculto, no se imprime ni queda en el
# historial de la shell), lo guarda en una variable local y lo inyecta en
# psql. Muestra el conteo antes de borrar y pide confirmación explícita.
#
# OrderItem y Refund tienen onDelete: Cascade hacia Order (ver
# packages/database/prisma/schema.prisma), así que borrar el Order limpia
# también sus líneas y reembolsos asociados.
#
# Uso:
#   ./scripts/purge-cancelled-orders.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}==>${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || fail "Comando requerido no encontrado: psql"

read -rsp "Pega el DATABASE_URL: " DB_URL
echo
[[ -n "$DB_URL" ]] || fail "DATABASE_URL vacío"

count="$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM \"Order\" WHERE status = 'CANCELLED';")"
log "Pedidos CANCELLED encontrados: ${count}"

if [[ "$count" -eq 0 ]]; then
  ok "Nada que borrar"
  exit 0
fi

read -rp "Escribe BORRAR para eliminar definitivamente estos ${count} pedidos: " confirm
[[ "$confirm" == "BORRAR" ]] || fail "Cancelado (no se escribió BORRAR)"

deleted="$(psql "$DB_URL" -tAc "WITH d AS (DELETE FROM \"Order\" WHERE status = 'CANCELLED' RETURNING id) SELECT COUNT(*) FROM d;")"
ok "Pedidos eliminados: ${deleted}"
