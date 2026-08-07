/** Sesión PWA clientes */
export const AUTH_COOKIE_CUSTOMER = "ordena_token";
/** Sesión admin (backoffice) */
export const AUTH_COOKIE_ADMIN = "ordena_admin_token";
/** Sesión staff / sucursal */
export const AUTH_COOKIE_BRANCH = "ordena_branch_token";

/** Cookie no-HttpOnly solo para UI (presencia de sesión) */
export const AUTH_PRESENCE_COOKIE = "ordena_auth";

/** @deprecated Usar AUTH_COOKIE_CUSTOMER */
export const AUTH_COOKIE_NAME = AUTH_COOKIE_CUSTOMER;

export const ROLES = ["CUSTOMER", "ADMIN", "BRANCH_STAFF"] as const;

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

/**
 * Transiciones permitidas vía `PATCH /orders/:id/status` (staff / cocina).
 * Cancelación staff solo desde PAID (antes de aceptar).
 * `ACCEPTED → PREPARING` va por `PATCH /orders/:id/start-prep`.
 * `PENDING_PAYMENT → PAID` lo hace el webhook de Stripe.
 * Cancelación post-aceptación (con devolución) → `POST /orders/:id/admin-cancel`.
 */
export const ORDER_STATUS_TRANSITIONS = {
  PENDING_PAYMENT: [],
  PAID: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: [],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies Record<
  (typeof ORDER_STATUSES)[number],
  readonly (typeof ORDER_STATUSES)[number][]
>;

/** Estados desde los que admin puede cancelar y liberar/reembolsar Stripe. */
export const ADMIN_ORDER_CANCEL_FROM = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
] as const satisfies readonly (typeof ORDER_STATUSES)[number][];

export function isValidOrderStatusTransition(
  from: (typeof ORDER_STATUSES)[number],
  to: (typeof ORDER_STATUSES)[number],
): boolean {
  if (from === to) return true;
  const allowed = ORDER_STATUS_TRANSITIONS[from] as readonly string[];
  return allowed.includes(to);
}

export function canAdminCancelOrder(
  status: (typeof ORDER_STATUSES)[number],
): boolean {
  return (ADMIN_ORDER_CANCEL_FROM as readonly string[]).includes(status);
}

/**
 * Umbral para avisarle al cliente (una sola vez) que su pedido PAID se está
 * demorando en ser aceptado. Ver apps/api/src/utils/handle-stale-paid-orders.ts.
 */
export const PAID_ORDER_DELAY_ALERT_MS = 5 * 60_000;

/**
 * Umbral para auto-cancelar y reembolsar un pedido PAID sin aceptar cuya
 * sucursal está offline (heartbeat de staff vencido). Compartido con el
 * dashboard admin para pintar el badge de "en riesgo" con el mismo criterio
 * que el backend usa para actuar.
 */
export const PAID_ORDER_AUTO_CANCEL_MS = 20 * 60_000;

export type PaidOrderWaitTone = "warning" | "danger";

/**
 * Cuánto lleva esperando aceptación un pedido PAID y qué tono usar para
 * mostrarlo (dashboard admin). `null` si el pedido no está en riesgo.
 */
export function getPaidOrderWaitStatus(
  status: string,
  paidAt: string | Date | null,
  now: number = Date.now(),
): { tone: PaidOrderWaitTone; elapsedMs: number } | null {
  if (status !== "PAID" || !paidAt) return null;
  const elapsedMs = now - new Date(paidAt).getTime();
  if (elapsedMs < PAID_ORDER_DELAY_ALERT_MS) return null;
  return {
    tone: elapsedMs >= PAID_ORDER_AUTO_CANCEL_MS ? "danger" : "warning",
    elapsedMs,
  };
}

/** Servicio externo de facturación (CFDI) de la empresa. */
export const INVOICE_BASE_URL = "https://cfdi.elbajito.com/";
