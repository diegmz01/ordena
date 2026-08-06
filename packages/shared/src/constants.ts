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

/** Servicio externo de facturación (CFDI) de la empresa. */
export const INVOICE_BASE_URL = "https://cfdi.elbajito.com/";
