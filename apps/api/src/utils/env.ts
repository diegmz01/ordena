const DEV_JWT_PLACEHOLDERS = new Set([
  "dev-jwt-secret-change-me-ordena",
  "change-me",
  "secret",
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[env] Falta variable requerida: ${name}`);
  }
  return value;
}

function warn(message: string) {
  console.warn(`[env] ${message}`);
}

/**
 * Fail-fast en production; en desarrollo solo avisa lo crítico suave.
 */
export function assertProductionEnv() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    if (!process.env.JWT_SECRET?.trim()) {
      warn("JWT_SECRET no definido; login fallará.");
    }
    if (!process.env.DATABASE_URL?.trim()) {
      warn("DATABASE_URL no definido.");
    }
    return;
  }

  const jwt = required("JWT_SECRET");
  if (DEV_JWT_PLACEHOLDERS.has(jwt) || jwt.length < 32) {
    throw new Error(
      "[env] JWT_SECRET de producción inválido (placeholder o demasiado corto)",
    );
  }

  required("DATABASE_URL");
  required("CUSTOMER_URL");
  required("ADMIN_URL");
  required("BRANCH_URL");

  const stripeKey = required("STRIPE_SECRET_KEY");
  if (
    stripeKey.includes("placeholder") ||
    (!stripeKey.startsWith("sk_live_") && !stripeKey.startsWith("sk_test_"))
  ) {
    throw new Error(
      "[env] STRIPE_SECRET_KEY debe ser una clave sk_live_… o sk_test_…",
    );
  }
  if (!stripeKey.startsWith("sk_live_")) {
    warn("STRIPE_SECRET_KEY no es sk_live_ (¿entorno de staging?).");
  }

  required("STRIPE_WEBHOOK_SECRET");

  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    !process.env.VAPID_PRIVATE_KEY?.trim()
  ) {
    warn("VAPID incompleto: push a clientes deshabilitado.");
  }
}

export function corsOrigins(): string[] {
  const isProd = process.env.NODE_ENV === "production";
  const fromEnv = [
    process.env.CUSTOMER_URL,
    process.env.ADMIN_URL,
    process.env.BRANCH_URL,
  ]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));

  if (isProd) return fromEnv;

  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    ...fromEnv,
  ];
}
