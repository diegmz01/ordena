import * as Sentry from "@sentry/nextjs";

/**
 * Opcional, igual que en apps/api: sin NEXT_PUBLIC_SENTRY_DSN, no hace nada.
 */
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
      initialScope: { tags: { app: "web" } },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
