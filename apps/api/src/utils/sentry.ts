import * as Sentry from "@sentry/node";

/**
 * Opcional, igual que Stripe/VAPID en este proyecto: sin SENTRY_DSN
 * configurada, esto no hace nada (ni intenta conectar a nada). Definir
 * SENTRY_DSN activa la captura de errores no manejados — ver captureError().
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}

/**
 * Reporta un error real a Sentry si está configurado; si no, no hace nada
 * (el error ya se logueó por console.error en el error-handler, como antes).
 */
export function captureError(error: unknown) {
  if (!process.env.SENTRY_DSN?.trim()) return;
  Sentry.captureException(error);
}
