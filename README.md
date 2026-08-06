# Ordena

Monorepo (estilo RRHH) para pedidos de un restaurante con múltiples sucursales.

## Stack

| App | Puerto | Descripción |
| --- | --- | --- |
| `apps/web` | 3000 | PWA clientes (pickup + Stripe + push de pedidos) |
| `apps/admin` | 3001 | Backoffice |
| `apps/branch` | 3002 | PWA sucursal |
| `apps/api` | 4000 | Express + Prisma + JWT |

Paquetes compartidos:

- `packages/database` — Prisma
- `packages/shared` — Zod schemas, tipos y **design system CSS** (misma línea visual que RRHH)

## Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL (Docker o local)

## Setup

```bash
cp .env.example .env
docker compose up -d   # requiere Docker Desktop
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Si Docker no está activo, inicia Postgres local y ajusta `DATABASE_URL` en `.env`.

## URLs

| Sitio | URL |
| --- | --- |
| Clientes (PWA) | http://localhost:3000 |
| Admin | http://localhost:3001 |
| Sucursal PWA | http://localhost:3002 |
| API | http://localhost:4000/health |

## PWA clientes

- Manifest + iconos + `themeColor` naranja (instalable desde el navegador)
- Service worker Serwist en producción (`apps/web`); en local usa `push-dev-sw.js` para probar push
- Tras un pedido, el cliente puede activar notificaciones (`PushOptIn`)
- API: `POST /push/subscribe` y envío al cambiar estado del pedido (`VAPID_*` en `.env`)

## PWA sucursal

- Service worker + push de **pedidos nuevos** (Configuración → Activar notificaciones)
- Mismas claves VAPID que el cliente; Pusher sigue para la UI en vivo

Generar claves VAPID:

```bash
npx web-push generate-vapid-keys
```

## Credenciales de desarrollo

| Rol | Email | Password |
| --- | --- | --- |
| Admin | `admin@ordena.local` | `OrdenaDev2026!` |
| Sucursal | `sucursal@ordena.local` | `OrdenaDev2026!` |
| Cliente | `cliente@ordena.local` | `OrdenaDev2026!` |

## Deploy

Ver runbook completo: [`docs/DEPLOY.md`](docs/DEPLOY.md) (VPS, env, Stripe, smoke test).

```bash
pnpm start:api   # API en producción local / contenedor
pnpm db:migrate:deploy
```

## Scripts

| Script | Descripción |
| --- | --- |
| `pnpm dev` | Turbo: api + web + admin + branch |
| `pnpm build` | Build de todos los paquetes |
| `pnpm start:api` | Arranca la API |
| `pnpm db:migrate:deploy` | Migraciones (producción) |
| `pnpm db:push` | Sync schema (dev) |
| `pnpm db:seed` | Datos demo (bloqueado si `NODE_ENV=production`) |
| `pnpm db:studio` | Prisma Studio |

