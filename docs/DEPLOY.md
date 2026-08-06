# Deploy Ordena (producción)

Stack: **VPS único (Hostinger)** corriendo las 4 apps (web / admin / branch / API) + Postgres, cada servicio en su propio subdominio detrás de HTTPS.

## Arquitectura

```
Cliente → apps/web    (subdominio propio) ──/api-backend──┐
Admin   → apps/admin  (subdominio propio) ──/api-backend──┼→ API (subdominio propio) → Postgres
Staff   → apps/branch (subdominio propio) ──/api-backend──┘
Stripe webhook ────────────────────────────────────────────→ https://<api>/stripe/webhook
OAuth callbacks ───────────────────────────────────────────→ https://<api>/auth/oauth/...
```

Las cookies de sesión se setean vía el **Route Handler** `app/api-backend/[...path]` (no rewrite), para que `Set-Cookie` quede ligado al dominio de cada app Next — necesario porque cada app corre en su propio subdominio.

## Variables de entorno

### API

| Variable | Requerida | Notas |
| --- | --- | --- |
| `NODE_ENV` | sí | `production` |
| `JWT_SECRET` | sí | ≥32 chars; no usar el de `.env.example` |
| `DATABASE_URL` | sí | Postgres del VPS |
| `API_PORT` | no | default `4000` |
| `TZ` | sí | `America/Mexico_City` |
| `CUSTOMER_URL` | sí | URL pública web |
| `ADMIN_URL` | sí | URL pública admin |
| `BRANCH_URL` | sí | URL pública staff |
| `STRIPE_SECRET_KEY` | sí | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | sí | del endpoint live |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | sí (clientes + staff) | push web |
| `VAPID_PRIVATE_KEY` | sí | misma pareja |
| `VAPID_SUBJECT` | sí | `mailto:ops@tudominio.com` |
| `OAUTH_REDIRECT_BASE` | si OAuth | URL pública de la **API** |
| Google/Facebook secrets | si OAuth | |

En production la API **falla al arrancar** si faltan secretos críticos (`assertProductionEnv`).

### Next (web / admin / branch)

| Variable | web | admin | branch |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL pública de la API (https://…) | igual | igual |
| `NEXT_PUBLIC_CUSTOMER_URL` | sí | opcional | — |
| `NEXT_PUBLIC_ADMIN_URL` | — | sí | — |
| `NEXT_PUBLIC_BRANCH_URL` | — | — | sí |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | — | — |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | sí | — | sí (pedidos nuevos) |

`NEXT_PUBLIC_API_URL` es la base que usa el proxy server-side; el browser llama a `/api-backend/...` same-origin.

## VPS

1. Cada app (`apps/web`, `apps/admin`, `apps/branch`, `apps/api`) corre como proceso persistente de Node (vía el gestor de procesos que se use en el servidor — PM2, systemd, Docker, etc.) detrás de un reverse proxy (Nginx u otro) que enruta cada subdominio HTTPS a su puerto interno correspondiente.
2. API: build vía `apps/api/Dockerfile` o `pnpm --filter @ordena/api build`, arranque con `pnpm --filter @ordena/api start` (`CMD` del Dockerfile si se usa contenedor).
3. **Migraciones en cada deploy:** `pnpm db:migrate:deploy` (o `pnpm --filter @ordena/database exec prisma migrate deploy`) antes de levantar la nueva versión del API.
4. Healthcheck del API: `GET /health` (incluye ping a DB).
5. Next apps: build estándar (`pnpm --filter <app> build`), arranque con `pnpm --filter <app> start` o el server que corresponda según cómo esté configurado el proceso.
6. Local: `pnpm start:api` desde la raíz del monorepo.

**Nunca** ejecutes `pnpm db:seed` en production (el seed aborta si `NODE_ENV=production`).

## Stripe

1. Webhooks → endpoint `https://<api-host>/stripe/webhook`, creado como destino tipo **Webhook endpoint** con carga útil **"Instantánea"** (snapshot) — el estilo "Breve" (thin payload) no es compatible con `checkout.session.completed`.
2. Evento: `checkout.session.completed`. Ver [`stripe-webhook.ts`](../apps/api/src/routes/stripe-webhook.ts).
3. Copiar signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Una sola `STRIPE_SECRET_KEY` de la cuenta de la plataforma; todos los pedidos de todas las sucursales cobran ahí — no hay cuentas separadas por sucursal.

### Captura manual → cuenta principal

- El checkout crea el pago con `capture_method: manual`: al pagar solo se autorizan (congelan) los fondos.
- Al pasar el pedido a **READY** (listo para recoger) se captura el monto real, ya sea porque el staff lo marca manualmente o porque el temporizador de preparación lo promueve automáticamente (`promoteDuePreparingOrders`); el dinero liquida a la cuenta bancaria vinculada a la cuenta Stripe de la plataforma (misma cuenta para todas las sucursales). `COMPLETED` (entrega) ya no toca Stripe, solo verifica el código de entrega.
- Cancelar antes de `READY` libera el hold sin cobrar nada; cancelar después de capturado emite un reembolso normal (`settleStripePayment` en [`utils/stripe.ts`](../apps/api/src/utils/stripe.ts)).

### Finanzas (Admin)

- Página `/finanzas`: cobrado vs **a depositar** por sucursal y fechas (Hoy / 7 días / etc.) — desglose interno desde Postgres, no cambia el destino del dinero en Stripe.
- **A depositar** = capturado (al quedar `READY`); sin comisión Ordena, son el mismo monto.
- Ventas desde Postgres; balance y payouts desde Stripe (siempre la única cuenta de la plataforma).
- Requiere `STRIPE_SECRET_KEY` válida; si no hay liquidaciones aún, la tabla de payouts estará vacía.

### Smoke test

1. Pedido a cualquier sucursal → autorizar en Checkout → marcar listo (o esperar al temporizador) en staff → captura OK.
2. Dashboard Stripe (cuenta plataforma): el cargo aparece capturado, sin ningún transfer a otra cuenta.
3. Cancelar pedido autorizado antes de marcarlo listo: hold liberado.

## VAPID

```bash
npx web-push generate-vapid-keys
```

Misma key pública en API, `apps/web` y `apps/branch` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`).

- **Cliente:** opt-in en la página del pedido → push al aceptar (preparación), listo y recogido.
- **Staff:** Configuración → “Activar notificaciones” → push al pagar un pedido nuevo (además del SSE en vivo, que no requiere configuración — ver `GET /branches/me/stream`).

## Cuentas iniciales

Tras migrate, crea admin y staff reales (email/password) desde un script one-off o insertando en DB — **no** uses `admin@ordena.local` / `OrdenaDev2026!`.

## Checklist por servicio (go-live)

Orden: Backend (API + Postgres) → Frontend (web/admin/branch) → Stripe → smoke.

### Backend (API + Postgres)

- [ ] Postgres provisionado y accesible desde el proceso de la API
- [ ] Build/arranque del API configurado en el VPS (Docker o proceso Node vía PM2/systemd)
- [ ] Env: `NODE_ENV=production`, `JWT_SECRET` nuevo (≥32, no el de `.env.example`), `DATABASE_URL`, `TZ=America/Mexico_City`
- [ ] Env: `CUSTOMER_URL` / `ADMIN_URL` / `BRANCH_URL` = HTTPS finales
- [ ] Env: `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET` del endpoint live
- [ ] Env: VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- [ ] Migraciones: `pnpm db:migrate:deploy` — **nunca** `db:seed`
- [ ] Healthcheck `GET /health` OK
- [ ] Crear admin/staff reales (no `admin@ordena.local`)

### Frontend (web / admin / branch)

| | web (`apps/web`) | admin (`apps/admin`) | branch (`apps/branch`) |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL de la API | igual | igual |
| URL propia | `NEXT_PUBLIC_CUSTOMER_URL` | `NEXT_PUBLIC_ADMIN_URL` | `NEXT_PUBLIC_BRANCH_URL` |
| Stripe | `pk_live_…` | — | — |
| VAPID public | sí | — | sí |

- [ ] Cada app buildeada y corriendo como proceso propio, subdominio + HTTPS propio
- [ ] Reverse proxy (Nginx u otro) enrutando cada subdominio a su puerto interno
- [ ] `Set-Cookie` en `POST /api-backend/auth/login` (`HttpOnly`, `Secure`, dominio Next)

### Stripe

- [ ] Webhook `https://<api>/stripe/webhook` → `checkout.session.completed`, carga útil "Instantánea"
- [ ] `STRIPE_SECRET_KEY=sk_live_…` de la cuenta plataforma (una sola, para todas las sucursales)
- [ ] Smoke test (ver arriba)

### Smoke test pre-go-live

1. Login admin, staff y cliente.
2. En staff PWA: Configuración → activar notificaciones push; minimiza o deja la app en background.
3. Pedido con Stripe → webhook → push nativo “Pedido nuevo” en staff + aparece en branch (SSE en vivo).
4. Cliente con push activado: al aceptar → “Pedido aceptado · En preparación”; listo → “Listo para recoger”; completar → “Pedido recogido”.
5. Agotar producto en staff → no aparece en menú cliente.
6. Cambiar sucursal con carrito → alert y poda de ítems no disponibles.
7. Confirmar cookie de sesión en DevTools (dominio de la app Next, `HttpOnly`, `Secure`).
8. Admin `/finanzas` con key live (payouts pueden estar vacíos al inicio).

## Verificación de cookies

Tras el primer deploy:

1. Abrir login de admin/web/branch.
2. Network → `POST /api-backend/auth/login` → Response Headers debe incluir `Set-Cookie`.
3. Requests siguientes deben enviar esa cookie.

Si falla, revisar que exista `app/api-backend/[...path]/route.ts` y que `NEXT_PUBLIC_API_URL` apunte a la API (no a un rewrite antiguo).
