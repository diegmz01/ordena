# Deploy Ordena (producción)

Stack: **Vercel** (web / admin / branch) + **Railway** (API + Postgres).

## Arquitectura

```
Cliente → apps/web (Vercel)  ──/api-backend──┐
Admin   → apps/admin (Vercel) ──/api-backend──┼→ API (Railway) → Postgres
Staff   → apps/branch (Vercel)──/api-backend──┘
Stripe webhook ───────────────────────────────→ https://<api>/stripe/webhook
OAuth callbacks ──────────────────────────────→ https://<api>/auth/oauth/...
```

Las cookies de sesión se setean vía el **Route Handler** `app/api-backend/[...path]` (no rewrite), para que `Set-Cookie` quede ligado al dominio de cada app Next.

## Variables de entorno

### API (Railway)

| Variable | Requerida | Notas |
| --- | --- | --- |
| `NODE_ENV` | sí | `production` |
| `JWT_SECRET` | sí | ≥32 chars; no usar el de `.env.example` |
| `DATABASE_URL` | sí | Postgres Railway |
| `API_PORT` | no | default `4000` |
| `TZ` | sí | `America/Mexico_City` |
| `CUSTOMER_URL` | sí | URL pública web |
| `ADMIN_URL` | sí | URL pública admin |
| `BRANCH_URL` | sí | URL pública staff |
| `STRIPE_SECRET_KEY` | sí | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | sí | del endpoint live |
| `PUSHER_APP_ID` | recomendado | pedidos en vivo |
| `PUSHER_SECRET` | recomendado | |
| `NEXT_PUBLIC_PUSHER_KEY` | recomendado | misma key que en front |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | recomendado | ej. `us2` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | sí (clientes + staff) | push web |
| `VAPID_PRIVATE_KEY` | sí | misma pareja |
| `VAPID_SUBJECT` | sí | `mailto:ops@tudominio.com` |
| `OAUTH_REDIRECT_BASE` | si OAuth | URL pública de la **API** |
| Google/Apple/Facebook secrets | si OAuth | |

En production la API **falla al arrancar** si faltan secretos críticos (`assertProductionEnv`).

### Next (Vercel × 3)

| Variable | web | admin | branch |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL pública Railway (https://…) | igual | igual |
| `NEXT_PUBLIC_CUSTOMER_URL` | sí | opcional | — |
| `NEXT_PUBLIC_ADMIN_URL` | — | sí | — |
| `NEXT_PUBLIC_BRANCH_URL` | — | — | sí |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | — | — |
| `NEXT_PUBLIC_PUSHER_KEY` / `CLUSTER` | sí | sí | sí |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | sí | — | sí (pedidos nuevos) |

`NEXT_PUBLIC_API_URL` es la base que usa el proxy server-side; el browser llama a `/api-backend/...` same-origin.

## Railway

1. Crear proyecto + Postgres.
2. Servicio API: Dockerfile `apps/api/Dockerfile` (ver [`railway.toml`](../railway.toml)).
3. **Release command:** `pnpm db:migrate:deploy` (o `pnpm --filter @ordena/database exec prisma migrate deploy`).
4. Start: `pnpm --filter @ordena/api start` (ya en Dockerfile `CMD`).
5. Healthcheck: `GET /health` (incluye ping a DB).
6. Local: `pnpm start:api` desde la raíz del monorepo.

**Nunca** ejecutes `pnpm db:seed` en production (el seed aborta si `NODE_ENV=production`).

## Vercel

1. Tres proyectos, Root Directory:
   - `apps/web`
   - `apps/admin`
   - `apps/branch`
2. Build: default Next (`pnpm` detectado en monorepo; configurar “Include source files outside root” / turbo según plantilla Vercel monorepo).
3. Env por proyecto (tabla arriba).
4. Dominios custom + HTTPS.

## Stripe

1. Dashboard live → activar **Connect** (Express).
2. Webhooks → endpoint `https://<api-host>/stripe/webhook`.
3. Eventos: `checkout.session.completed` y `account.updated` (sincroniza flags Connect por sucursal). Ver [`stripe-webhook.ts`](../apps/api/src/routes/stripe-webhook.ts).
4. Copiar signing secret → `STRIPE_WEBHOOK_SECRET`.
5. Misma `STRIPE_SECRET_KEY` de plataforma para todo; **no** hay una key por sucursal.

### Connect por sucursal (destination charges)

- En Admin → **Sucursales** → **Conectar Stripe**: crea una cuenta Express y abre el Account Link de onboarding.
- Cuando `charges_enabled` esté activo, el checkout usa `on_behalf_of` + `transfer_data.destination` hacia esa cuenta.
- Al marcar el pedido **COMPLETED**, la captura dispara el transfer a la connected account; Stripe hace el payout a su banco.
- Si la sucursal no tiene Connect listo, el checkout se rechaza (no hay fallback a la cuenta plataforma).
- **Ordena no cobra comisión** (`application_fee`): el monto capturado liquida íntegro a la cuenta Connect de la sucursal. El fee de procesamiento Stripe (p.ej. 3.6% + $3 MXN) lo absorbe la **cuenta plataforma**.

### Finanzas (Admin)

- Página `/finanzas`: cobrado vs **a depositar** por sucursal y fechas (Hoy / 7 días / etc.).
- **A depositar** = capturado (`COMPLETED`); sin comisión Ordena, son el mismo monto.
- Ventas desde Postgres; balance y payouts desde Stripe.
- **Sin** filtro de sucursal → balance/payouts de la cuenta plataforma.
- **Con** filtro → cuenta Connect de esa sucursal (requiere onboarding): disponible/pendiente + payouts ya enviados o en camino al banco.
- Requiere `STRIPE_SECRET_KEY` válida; si no hay liquidaciones aún, la tabla de payouts estará vacía.

### Smoke test Connect

1. Admin → sucursal → Conectar Stripe → completar onboarding (test).
2. Pedido a esa sucursal → autorizar → completar en staff → captura OK.
3. Dashboard Connect / Express: transfer hacia `acct_…`.
4. Sucursal sin Connect: checkout rechazado con mensaje claro.
5. Cancelar pedido autorizado: hold liberado (sin transfer).

## Pusher / VAPID

```bash
npx web-push generate-vapid-keys
```

Misma key pública en API, `apps/web` y `apps/branch` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`).

- **Cliente:** opt-in en la página del pedido → push al aceptar (preparación), listo y recogido.
- **Staff:** Configuración → “Activar notificaciones” → push al pagar un pedido nuevo (además de Pusher en vivo).

## Cuentas iniciales

Tras migrate, crea admin y staff reales (email/password) desde un script one-off o insertando en DB — **no** uses `admin@ordena.local` / `OrdenaDev2026!`.

## Checklist por servicio (go-live)

Orden: Railway → Vercel ×3 → Stripe Connect → smoke.

### Railway (API + Postgres)

- [ ] Proyecto + add-on Postgres
- [ ] Dockerfile `apps/api/Dockerfile` (`railway.toml`)
- [ ] Env: `NODE_ENV=production`, `JWT_SECRET` nuevo (≥32, no el de `.env.example`), `DATABASE_URL`, `TZ=America/Mexico_City`
- [ ] Env: `CUSTOMER_URL` / `ADMIN_URL` / `BRANCH_URL` = HTTPS finales
- [ ] Env: `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET` del endpoint live
- [ ] Env: VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) + Pusher (recomendado)
- [ ] Release: `pnpm db:migrate:deploy` — **nunca** `db:seed`
- [ ] Healthcheck `GET /health` OK
- [ ] Crear admin/staff reales (no `admin@ordena.local`)

### Vercel ×3

| | web (`apps/web`) | admin (`apps/admin`) | branch (`apps/branch`) |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL Railway | igual | igual |
| URL propia | `NEXT_PUBLIC_CUSTOMER_URL` | `NEXT_PUBLIC_ADMIN_URL` | `NEXT_PUBLIC_BRANCH_URL` |
| Stripe | `pk_live_…` | — | — |
| Pusher | key + cluster | key + cluster | key + cluster |
| VAPID public | sí | — | sí |

- [ ] Tres proyectos, Root Directory correcto, monorepo con packages fuera del root
- [ ] Dominios custom + HTTPS
- [ ] `Set-Cookie` en `POST /api-backend/auth/login` (`HttpOnly`, `Secure`, dominio Next)

### Stripe

- [ ] Connect Express activo (live)
- [ ] Webhook `https://<api>/stripe/webhook` → `checkout.session.completed` + `account.updated`
- [ ] Cada sucursal: Admin → Conectar Stripe → `charges_enabled`
- [ ] Smoke Connect (ver abajo)

### Smoke test pre-go-live

1. Login admin, staff y cliente.
2. En staff PWA: Configuración → activar notificaciones push; minimiza o deja la app en background.
3. Pedido con Stripe → webhook → push nativo “Pedido nuevo” en staff + aparece en branch (Pusher).
4. Cliente con push activado: al aceptar → “Pedido aceptado · En preparación”; listo → “Listo para recoger”; completar → “Pedido recogido”.
5. Agotar producto en staff → no aparece en menú cliente.
6. Cambiar sucursal con carrito → alert y poda de ítems no disponibles.
7. Confirmar cookie de sesión en DevTools (dominio de la app Next, `HttpOnly`, `Secure`).
8. Admin `/finanzas` con key live (payouts pueden estar vacíos al inicio).

## Verificación de cookies

Tras el primer deploy de preview:

1. Abrir login de admin/web/branch.
2. Network → `POST /api-backend/auth/login` → Response Headers debe incluir `Set-Cookie`.
3. Requests siguientes deben enviar esa cookie.

Si falla, revisar que exista `app/api-backend/[...path]/route.ts` y que `NEXT_PUBLIC_API_URL` apunte a la API (no a un rewrite antiguo).
