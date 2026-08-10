# E2E — flujo crítico de pedidos

Playwright, un solo spec (`tests/critical-order-flow.spec.ts`) que recorre el flujo completo:

1. Staff inicia sesión en `apps/branch` (el heartbeat de presencia abre la sucursal a pedidos nuevos).
2. Cliente elige sucursal, agrega "Hamburguesa clásica" al carrito y paga como invitado en `apps/web` — checkout real contra Stripe (modo test).
3. En vez de completar el pago en la página hospedada de Stripe, se dispara un evento `checkout.session.completed` sintético firmado con `STRIPE_WEBHOOK_SECRET` (`lib/stripe-webhook.ts`) directo al endpoint del webhook — técnica de prueba documentada por Stripe, evita depender de la UI de un tercero en el test.
4. Staff acepta (ticket TPV + tiempo de preparación), inicia preparación, marca listo.
5. Cliente ve su código de entrega en `/pedido/[id]`.
6. Staff entrega el pedido con ese código → `COMPLETED`.

## Correrlo localmente

Necesitas Postgres, y la API + `apps/web` + `apps/branch` corriendo con datos del seed:

```bash
docker compose up -d          # Postgres local
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter @ordena/api dev &
pnpm --filter @ordena/web dev &
pnpm --filter @ordena/branch dev &
```

Necesitas una `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` de **test** reales (no hace falta Stripe CLI corriendo — el spec dispara el webhook directamente). Con eso en tu `.env`:

```bash
pnpm --filter @ordena/e2e exec playwright install chromium   # solo la primera vez
pnpm --filter @ordena/e2e test
```

Variables opcionales (defaults asumen `pnpm dev` local con el seed de siempre): `E2E_WEB_URL`, `E2E_BRANCH_URL`, `E2E_API_URL`, `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`.

## CI

El job `e2e` en `.github/workflows/ci.yml` corre este mismo spec contra un Postgres efímero. Requiere los secrets del repo (Settings → Secrets and variables → Actions):

- `E2E_STRIPE_SECRET_KEY` (`sk_test_…` real, para crear la Checkout Session)
- `E2E_STRIPE_WEBHOOK_SECRET` — no necesita ser el de un endpoint real registrado en Stripe (el evento nunca sale a la red de Stripe): alcanza con cualquier string estable tipo `whsec_…`, ya que la API y el test firman/verifican contra el mismo valor
- `E2E_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`, solo para que el build de `apps/web` no falle)

Sin `E2E_STRIPE_SECRET_KEY` configurado, el job se salta (no falla) — ver la condición `if:` del job.
