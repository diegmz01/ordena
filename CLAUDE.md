# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ordena — monorepo (pnpm + Turborepo) for a single restaurant with multiple branches (`sucursales`). UI text and code comments are in Spanish; keep new user-facing copy in Spanish (`lang="es"`).

Apps:

| App | Port | Description |
| --- | --- | --- |
| `apps/web` | 3000 | Customer PWA (pickup ordering + Stripe checkout + order push notifications) |
| `apps/admin` | 3001 | Backoffice (menu, branches, orders, customers, finance) |
| `apps/branch` | 3002 | Branch-staff PWA (accept/prepare orders, stock, printing, new-order push) |
| `apps/api` | 4000 | Express + Prisma + JWT REST API |

Shared packages:

- `packages/database` — Prisma schema, migrations, seed, exports a singleton `prisma` client
- `packages/shared` — Zod schemas, shared types/constants, the same-origin API proxy helper, and the **design system CSS** (must match the visual language of the sibling RRHH project — see below)

## Commands

```bash
pnpm install
pnpm db:push          # sync Prisma schema to DB (dev)
pnpm db:seed           # demo data (blocked if NODE_ENV=production)
pnpm dev               # turbo: runs api + web + admin + branch together
```

Per-package/app (via turbo filters or `pnpm --filter`):

```bash
pnpm --filter @ordena/api dev        # single app dev server
pnpm build                            # turbo build, all apps/packages
pnpm lint                             # turbo lint, all apps/packages
pnpm --filter @ordena/web lint       # lint one app (Next apps: eslint; api/database/shared: tsc --noEmit)
```

Database (all proxy to `packages/database` via root scripts):

```bash
pnpm db:generate               # prisma generate
pnpm db:migrate                # prisma migrate dev (creates a migration)
pnpm db:migrate:deploy         # prisma migrate deploy (production)
pnpm db:studio                 # Prisma Studio
```

There is no test suite in this repo (no test runner configured, no `*.test.ts`/`*.spec.ts` files) — do not invent test commands. CI (`.github/workflows/ci.yml`) runs `pnpm db:generate`, `pnpm build`, then `pnpm lint` (lint step is `continue-on-error`, i.e. non-blocking).

Local setup requires `.env` (copy from `.env.example`) and Postgres (`docker compose up -d` or local). Generate VAPID keys for web push with `npx web-push generate-vapid-keys`.

## Architecture

### Same-origin API proxy (critical pattern)

Each Next.js app does **not** call the API directly from the browser. Every app has an `app/api-backend/[...path]/route.ts` catch-all Route Handler that calls `proxyApiBackend()` (`packages/shared/src/api-backend-proxy.ts`), which forwards the request server-side to the real API (`NEXT_PUBLIC_API_URL`) and rewrites `Set-Cookie` to strip the `Domain` attribute. This exists so session cookies bind to each Next app's own domain instead of the API's domain (needed for Vercel + Railway deploys with separate domains).

- Client code always calls the browser through `apiFetch()` (`packages/shared/src/constants.ts`), which targets `API_URL` — `/api-backend` in the browser, direct `NEXT_PUBLIC_API_URL`/`DIRECT_API_URL` during SSR.
- `apiFetch` sets `X-Ordena-Client: customer|admin|branch` and always sends `credentials: "include"`.
- Never bypass this proxy by pointing browser `fetch` calls straight at the API — it will break cookie auth in production.

### Auth: three separate sessions, one API

The API issues JWTs for three roles (`CUSTOMER`, `ADMIN`, `BRANCH_STAFF` — `Role` enum in Prisma) but each Next app keeps its **own** cookie so a person can be logged into web/admin/branch simultaneously in the same browser:

- `AUTH_COOKIE_CUSTOMER` = `ordena_token` (web)
- `AUTH_COOKIE_ADMIN` = `ordena_admin_token` (admin)
- `AUTH_COOKIE_BRANCH` = `ordena_branch_token` (branch)
- `AUTH_PRESENCE_COOKIE` = `ordena_auth` — a non-HttpOnly cookie used only so client-side `middleware.ts` can cheaply detect "probably logged in" without reading the HttpOnly token

All defined in `packages/shared/src/constants.ts`. `apps/admin/src/middleware.ts` and `apps/branch/src/middleware.ts` gate every route except `/login` behind presence of their cookie (redirecting to `/login?next=...`); `apps/web` has no such middleware (guest checkout is allowed).

API-side: `apps/api/src/middleware/auth.ts` exposes `authenticate` (required), `optionalAuth` (used for guest checkout), and `requireRole(...)` → `requireAdmin` / `requireBranchStaff`. Social login (Google/Facebook) goes through `apps/api/src/lib/oauth.ts` + `routes/auth.ts` using `arctic`, landing back on `apps/web` via a one-time code (`OAuthOneTimeCode`) exchanged for the session.

### API structure (`apps/api/src`)

Express app assembled in `index.ts`: `helmet`, `cors` (origins from `utils/env.ts::corsOrigins()`), `morgan`, `cookie-parser`. The Stripe webhook router is mounted **before** `express.json()` because Stripe needs the raw body to verify signatures. Routers are one-per-domain under `routes/` (`auth`, `branches`, `menu`, `checkout`, `orders`, `customers`, `push`, `finance`, `stripe-webhook`, `health`), business logic/helpers under `utils/`. `assertProductionEnv()` makes the API refuse to boot in production if critical secrets are missing.

### Orders: status machine + money flow

`Order.status` (`OrderStatus` enum) transitions are centrally defined in `packages/shared/src/constants.ts` as `ORDER_STATUS_TRANSITIONS` / `isValidOrderStatusTransition()` — consult/extend that table rather than hardcoding transition checks elsewhere:

```
PENDING_PAYMENT → PAID (Stripe webhook only)
PAID            → ACCEPTED | CANCELLED (branch staff; cancel only pre-accept)
ACCEPTED        → PREPARING (via dedicated /orders/:id/start-prep, not the generic status PATCH)
PREPARING       → READY
READY           → COMPLETED
```
Post-accept cancellation (with Stripe refund) is a separate endpoint, `POST /orders/:id/admin-cancel`, gated by `canAdminCancelOrder()`.

Payment uses Stripe Checkout with **manual capture**: `payment_intent_data.capture_method = "manual"`. Funds are authorized at checkout and only captured when the order is marked `COMPLETED` (delivery). There is a single platform Stripe account (`STRIPE_SECRET_KEY`) — every branch's orders capture into the same account/bank account; there is no per-branch Stripe Connect split.

### Branch availability

Whether a branch currently accepts orders is **computed, not stored** — `effectiveAvailability()` in `apps/api/src/utils/branch-availability.ts` merges: the admin's manual override (`AUTO`/`OPEN`/`PAUSED`/`CLOSED`), the branch's configured weekly `hours` JSON (with midnight-crossing support), and a **staff presence heartbeat** (`staffLastSeenAt`, must be fresher than `STAFF_HEARTBEAT_STALE_MS` = 45s) — if staff hasn't pinged recently, the branch is forced into an "offline" paused state (distinguishing `APP_CLOSED` vs `CONNECTION_LOST` via `staffAwayReason`) even if schedule/manual mode would otherwise accept orders. Any change to opening-hours or pause logic should go through this function, not be reimplemented per-route.

### Stock / menu availability

Two independent unavailability signals per branch, both in Prisma:
- `BranchProduct.available` (admin: is this product part of the branch's catalog at all)
- `BranchProduct.unavailableUntil` / `BranchModifier.unavailableUntil` (staff: temporarily 86'd from the branch PWA — `apps/branch/src/app/menu/page.tsx` / `apps/api/src/utils/branch-menu-stock.ts`), independent of the admin catalog flag.

Cart validation happens both live (`POST /checkout/validate`, used for pre-checkout UI warnings) and again authoritatively at order-creation time (`findUnavailableCartLines`, `apps/api/src/utils/validate-cart-stock.ts`) since stock can change between the two.

### Real-time + push

- **SSE (self-hosted)** drives live UI updates on the branch dashboard (e.g. new order appears without reload) — `GET /branches/me/stream` in `apps/api/src/routes/branches.ts`, backed by an in-memory per-process pub/sub (`branchId` → connected `Response`s) in `apps/api/src/utils/sse.ts`. No external service/Redis; client is a plain browser `EventSource`. Known limitation: this pub/sub does not fan out across multiple `apps/api` instances — fine today since the API runs as a single Railway instance, but would need revisiting if that ever changes.
- **Web Push** (VAPID, `web-push`) sends actual OS/browser notifications: to customers on order status change, to branch staff on new orders. Subscriptions live in `PushSubscription` (nullable `userId` for guests, `branchId` for staff subscriptions). Client opt-in components: `apps/web/src/components/pwa/push-opt-in.tsx`, `apps/branch/src/components/pwa/push-opt-in-staff.tsx`.
- Branch staff presence itself (used by the availability gate above) is pushed via a heartbeat from `apps/branch/src/components/staff-presence.tsx`.

### PWA / service workers

`apps/web` and `apps/branch` are installable PWAs (`app/manifest.ts`, `sw.ts` built with Serwist — `withSerwist` in `next.config.ts`, production only). `apps/admin` is a plain Next app (backoffice, not installable). In local dev, `push-dev-sw.js` is used to test push instead of the production Serwist worker.

### Shared package (`packages/shared`)

- `schemas.ts` — Zod schemas used by **both** API request validation and (implicitly) frontend forms — extend here when adding fields, don't duplicate validation.
- `plate-groups.ts` — groups order items by `plateLabel` (e.g. splitting a shared order into "Persona 1" / "Ana" style plates) for both order-detail UIs (admin, branch, web) and for the printed receipt.
- `receipt-ticket.ts` — builds the printable receipt document; consumed both by the browser print path and by `apps/branch/src/lib/print/escpos.ts` (thermal printer ESC/POS output) / `serial.ts`. Branch has multiple print backends under `apps/branch/src/lib/print/` — check `index.ts` for how they're selected.
- `design-system.css` — the single source of truth for all visual tokens/classes; see UI rules below.

### Repeated per-app structure

`apps/web`, `apps/admin`, `apps/branch` each follow the same internal layout: `src/lib/auth.ts` (login/logout/session helpers for that app's cookie), `src/lib/api.ts`, `src/app/api-backend/[...path]/route.ts` (the proxy), `src/components/providers.tsx`, `src/components/theme-toggle.tsx`. When fixing something in one app's auth/proxy plumbing, check whether the same fix is needed in the other two — they're intentionally parallel, not shared via import (aside from what's in `packages/shared`).

## UI / design system rules

Ordena reuses the same visual language as the sibling "RRHH" project: orange brand, Geist font, PWA header gradients. Source of truth: [`packages/shared/src/design-system.css`](packages/shared/src/design-system.css), imported by each app's `globals.css`:
```css
@import "tailwindcss";
@import "../../../../packages/shared/src/design-system.css";
```

- Brand `#ea5e1f`, primary/accent `#f97316` (orange-500). Don't introduce another palette (no purple, no generic AI cream/terracotta themes, no dark-first-by-default).
- Prefer existing design-system classes over ad-hoc utilities: `btn-primary` / `btn-secondary`, `input-field` (`pwa-input` in PWAs), `field-label`, `admin-panel(-header|-body)`, `page-title` / `page-description`, `login-card(-body)`, `pwa-card` / `pwa-btn-primary`, `pwa-header-gradient`, `admin-alert-error` / `pwa-alert-brand`, `status-badge-brand` / `status-badge-active`, `link-action`, `container-page` / `container-admin` / `container-app`.
- If a needed pattern doesn't exist yet, add it to `design-system.css` rather than one-off CSS in a single app.
- Dark mode is supported via `.dark` class + existing tokens; don't force it by default.

## Deploy

Production target is **Vercel** (web/admin/branch) + **Railway** (API + Postgres); see [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full env-var matrix and go-live checklist. Key point beyond what's above: because each Next app has its own domain in production, the `api-backend` proxy pattern (not a Next rewrite) is what makes session cookies work across domains — don't "simplify" it into a rewrite.
