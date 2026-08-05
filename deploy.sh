#!/usr/bin/env bash
set -euo pipefail

# Despliegue de Ordena en el VPS.
# Descarga el último commit de main, rebuild y reinicia los 4 servicios PM2.
#
# Uso:
#   ./deploy.sh
#   APP_DIR=/var/www/ordena ./deploy.sh
#   DEPLOY_SSH_KEY=~/.ssh/github_ordena_deploy ./deploy.sh
#   ./deploy.sh --no-pull
#
# Git en el VPS: deploy key SSH (recomendado). Ver ensure_git_for_deploy().
# Ver docs/DEPLOY.md

APP_DIR="${APP_DIR:-/var/www/ordena}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_PULL=0

# En un VPS compartido con otras apps, los puertos suelen reasignarse en el
# .env para evitar choques; si no vienen ya en el entorno, se leen de ahí
# antes de caer al default de este proyecto.
dotenv_value() {
  local key="$1"
  local val=""
  if [[ -f "$APP_DIR/.env" ]]; then
    val="$(grep -E "^${key}=" "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d'=' -f2- || true)"
  fi
  printf '%s' "$val"
}

WEB_PORT="${WEB_PORT:-$(dotenv_value WEB_PORT)}"
WEB_PORT="${WEB_PORT:-3000}"
ADMIN_PORT="${ADMIN_PORT:-$(dotenv_value ADMIN_PORT)}"
ADMIN_PORT="${ADMIN_PORT:-3001}"
BRANCH_PORT="${BRANCH_PORT:-$(dotenv_value BRANCH_PORT)}"
BRANCH_PORT="${BRANCH_PORT:-3002}"
API_PORT="${API_PORT:-$(dotenv_value API_PORT)}"
API_PORT="${API_PORT:-4000}"

# Llave SSH de solo lectura registrada en GitHub → Deploy keys
DEFAULT_DEPLOY_SSH_KEY="${HOME}/.ssh/github_ordena_deploy"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"

PM2_API="ordena-api"
PM2_WEB="ordena-web"
PM2_ADMIN="ordena-admin"
PM2_BRANCH="ordena-branch"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${BLUE}==>${NC} $*"
}

ok() {
  echo -e "${GREEN}✓${NC} $*"
}

warn() {
  echo -e "${YELLOW}!${NC} $*"
}

fail() {
  echo -e "${RED}✗${NC} $*" >&2
  exit 1
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local retries="${3:-30}"
  local delay="${4:-2}"
  local attempt=1

  while [[ "$attempt" -le "$retries" ]]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$attempt" -eq 1 ]]; then
      log "Esperando ${label}..."
    fi
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  return 1
}

usage() {
  cat <<EOF
Despliega Ordena en producción: sincroniza origin/${DEPLOY_BRANCH:-main}, rebuild y reinicia PM2.

Opciones:
  --no-pull     No descarga código del remoto (útil si ya actualizaste manualmente)
  --help        Muestra esta ayuda

Variables de entorno:
  APP_DIR          Ruta del proyecto (default: /var/www/ordena)
  DEPLOY_BRANCH    Rama a desplegar (default: main)
  DEPLOY_SSH_KEY   Ruta a la llave privada SSH para git (default si existe:
                   ~/.ssh/github_ordena_deploy)

Git (primera vez en el VPS):
  ssh-keygen -t ed25519 -C deploy-ordena -f ~/.ssh/github_ordena_deploy -N ""
  cat ~/.ssh/github_ordena_deploy.pub
  → GitHub → Repo → Settings → Deploy keys → Add deploy key (solo lectura)
  ./deploy.sh   # convierte origin a SSH automáticamente si detecta la llave
EOF
}

git_auth_help() {
  cat <<EOF
No se pudo acceder al repositorio remoto (git pull).

Opción recomendada — Deploy key SSH:
  1. ssh-keygen -t ed25519 -C deploy-ordena -f ~/.ssh/github_ordena_deploy -N ""
  2. cat ~/.ssh/github_ordena_deploy.pub
     → GitHub → tu repo → Settings → Deploy keys → Add deploy key (read-only)
  3. DEPLOY_SSH_KEY=~/.ssh/github_ordena_deploy ./deploy.sh

Alternativa — HTTPS con token:
  - Crea un fine-grained token en GitHub (Contents: read-only)
  - Usuario: tu usuario de GitHub; contraseña: el token (no el passkey)

Nota: el passkey de GitHub no funciona para git en terminal.
EOF
}

setup_git_ssh() {
  local key="${DEPLOY_SSH_KEY}"
  if [[ -z "$key" && -f "$DEFAULT_DEPLOY_SSH_KEY" ]]; then
    key="$DEFAULT_DEPLOY_SSH_KEY"
  fi

  if [[ -z "$key" ]]; then
    return
  fi

  [[ -f "$key" ]] || fail "No existe la llave SSH de deploy: $key"

  export GIT_SSH_COMMAND="ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  ok "Llave SSH de deploy: $key"
}

ensure_git_remote_for_deploy() {
  local remote_url=""
  remote_url="$(git remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote_url" ]] || fail "No hay remote 'origin' en $APP_DIR"

  if [[ "$remote_url" =~ ^git@github\.com: ]]; then
    return
  fi

  if [[ "$remote_url" =~ ^https://github\.com/([^/]+)/([^/]+?)(\.git)?/?$ ]]; then
    local org="${BASH_REMATCH[1]}"
    local repo="${BASH_REMATCH[2]}"
    repo="${repo%.git}"

    if [[ -n "${GIT_SSH_COMMAND:-}" ]]; then
      log "Configurando origin con SSH (deploy key)"
      git remote set-url origin "git@github.com:${org}/${repo}.git"
      ok "origin → git@github.com:${org}/${repo}.git"
      return
    fi

    warn "origin usa HTTPS; git pedirá usuario y token en cada pull."
    warn "Configura una deploy key y vuelve a ejecutar ./deploy.sh:"
    warn "  ssh-keygen -t ed25519 -C deploy-ordena -f ~/.ssh/github_ordena_deploy -N \"\""
    return
  fi

  warn "Remote origin no es GitHub estándar: $remote_url"
}

verify_git_auth() {
  log "Verificando acceso a origin"
  local key=""
  if [[ "${GIT_SSH_COMMAND:-}" =~ -i[[:space:]]+([^[:space:]]+) ]]; then
    key="${BASH_REMATCH[1]}"
    [[ -f "$key" ]] || fail "No existe la llave SSH: $key"

    local ssh_test=""
    ssh_test="$(ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true)"
    if ! echo "$ssh_test" | grep -qiE 'successfully authenticated|Hi .+!'; then
      echo "$ssh_test" >&2
      echo >&2
      git_auth_help >&2
      echo >&2
      fail "La deploy key no autentica con GitHub (${key}). chmod 600 ${key} y registra la clave pública en GitHub → Deploy keys."
    fi
  fi

  local fetch_output=""
  if fetch_output="$(git fetch origin 2>&1)"; then
    [[ -n "$fetch_output" ]] && echo "$fetch_output"
    ok "Acceso a origin verificado"
    return
  fi

  echo "$fetch_output" >&2
  git_auth_help >&2
  echo >&2
  fail "Autenticación con GitHub fallida (git fetch)"
}

ensure_git_for_deploy() {
  setup_git_ssh
  ensure_git_remote_for_deploy
  if [[ -n "${GIT_SSH_COMMAND:-}" ]]; then
    verify_git_auth
  fi
}

sync_deploy_branch() {
  local branch="$DEPLOY_BRANCH"
  local before_sha=""
  before_sha="$(git rev-parse --short HEAD 2>/dev/null || echo 'none')"

  log "Descargando último commit de origin/${branch}"
  log "Commit actual en el servidor: ${before_sha}"

  local fetch_output=""
  if ! fetch_output="$(git fetch origin "${branch}" 2>&1)"; then
    echo "$fetch_output" >&2
    git_auth_help >&2
    echo >&2
    fail "No se pudo descargar origin/${branch}"
  fi
  [[ -n "$fetch_output" ]] && echo "$fetch_output"

  git rev-parse --verify "origin/${branch}" >/dev/null 2>&1 \
    || fail "No existe origin/${branch} en el remoto"

  local remote_sha=""
  remote_sha="$(git rev-parse --short "origin/${branch}")"
  log "origin/${branch}: ${remote_sha}"

  local dirty=""
  dirty="$(git status --porcelain 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    warn "Descartando cambios locales en archivos versionados (p. ej. deploy.sh editado en el servidor)"
  fi

  git checkout -f -B "$branch" "origin/${branch}"
  chmod +x deploy.sh 2>/dev/null || true

  local after_sha=""
  after_sha="$(git rev-parse --short HEAD)"
  if [[ "$before_sha" != "$after_sha" ]]; then
    ok "Código actualizado: ${before_sha} → ${after_sha}"
  elif [[ "$before_sha" == "$remote_sha" ]]; then
    ok "Ya en el último commit de origin/${branch} (${after_sha})"
  else
    ok "Sincronizado con origin/${branch} (${after_sha})"
  fi
}

for arg in "$@"; do
  case "$arg" in
    --no-pull)
      SKIP_PULL=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Opción desconocida: $arg (usa --help)"
      ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando requerido no encontrado: $1"
}

require_cmd git
require_cmd node
require_cmd pm2
require_cmd curl

ensure_pnpm() {
  local expected_version=""
  expected_version="$(node -p "require('./package.json').packageManager?.replace('pnpm@','') || ''")"

  if [[ -z "$expected_version" ]]; then
    require_cmd pnpm
    warn "No hay packageManager en package.json; usando pnpm del sistema"
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    log "Activando pnpm ${expected_version} con Corepack"
    corepack enable
    corepack prepare "pnpm@${expected_version}" --activate
  else
    require_cmd pnpm
    warn "Corepack no disponible; verifica que pnpm sea ${expected_version}"
  fi

  ok "pnpm $(pnpm --version)"
}

[[ -d "$APP_DIR" ]] || fail "No existe APP_DIR: $APP_DIR"
[[ -f "$APP_DIR/.env" ]] || fail "Falta el archivo .env en $APP_DIR"

cd "$APP_DIR"

ensure_pnpm

log "Desplegando Ordena en $APP_DIR"

if [[ "$SKIP_PULL" -eq 0 ]]; then
  ensure_git_for_deploy
  sync_deploy_branch
else
  warn "Omitiendo sincronización con origin/${DEPLOY_BRANCH}"
fi

log "Instalando dependencias"
pnpm install
ok "Dependencias instaladas"

log "Verificando symlinks de .env para Next.js y API"
ln -sf "$APP_DIR/.env" "$APP_DIR/apps/web/.env.local"
ln -sf "$APP_DIR/.env" "$APP_DIR/apps/admin/.env.local"
ln -sf "$APP_DIR/.env" "$APP_DIR/apps/branch/.env.local"
ln -sf "$APP_DIR/.env" "$APP_DIR/apps/api/.env"
ok "Symlinks de entorno listos"

# turbo calcula el hash de caché del build a partir de las variables ya
# presentes en el entorno del shell (ver turbo.json "env"); Next.js carga
# .env.local dentro del proceso hijo, así que si no las exportamos aquí
# turbo no detecta cambios en NEXT_PUBLIC_* y sirve un build cacheado
# desactualizado.
log "Exportando variables de $APP_DIR/.env para el build"
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a
ok "Variables cargadas"

log "Generando cliente Prisma"
pnpm db:generate
ok "Cliente Prisma generado"

log "Aplicando migraciones de base de datos"
pnpm db:migrate:deploy
ok "Migraciones aplicadas"

log "Compilando aplicaciones (web, admin, branch, api)"
pnpm build
ok "Build completado"

log "Reiniciando servicios PM2"
pm2 restart "$PM2_API" "$PM2_WEB" "$PM2_ADMIN" "$PM2_BRANCH" --update-env
ok "Servicios reiniciados (api, web, admin, branch)"

log "Verificando salud local"
wait_for_http "http://127.0.0.1:${API_PORT}/health" "API en puerto ${API_PORT}" \
  || fail "La API no responde en el puerto ${API_PORT} (revisa: pm2 logs ${PM2_API} --lines 50)"

web_status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/")"
admin_status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${ADMIN_PORT}/")"
branch_status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${BRANCH_PORT}/")"

[[ "$web_status" =~ ^(200|307|308)$ ]] \
  || fail "Web no responde correctamente en el puerto ${WEB_PORT} (HTTP ${web_status})"
[[ "$admin_status" =~ ^(200|307|308)$ ]] \
  || fail "Admin no responde correctamente en el puerto ${ADMIN_PORT} (HTTP ${admin_status})"
[[ "$branch_status" =~ ^(200|307|308)$ ]] \
  || fail "Branch no responde correctamente en el puerto ${BRANCH_PORT} (HTTP ${branch_status})"

ok "API OK (${API_PORT})"
ok "Web OK (${WEB_PORT}, HTTP ${web_status})"
ok "Admin OK (${ADMIN_PORT}, HTTP ${admin_status})"
ok "Branch OK (${BRANCH_PORT}, HTTP ${branch_status})"

echo
pm2 status
echo
ok "Despliegue finalizado correctamente"
