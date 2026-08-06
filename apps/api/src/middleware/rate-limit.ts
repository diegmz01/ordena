import rateLimit from "express-rate-limit";

/** Login / register / OAuth exchange — límite por IP. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
});

/**
 * Login — límite por cuenta (independiente de la IP), para contener
 * credential stuffing distribuido contra una cuenta puntual (ej. un admin).
 * No reemplaza authRateLimiter (por IP): se aplican ambos.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email || "unknown";
  },
  message: {
    error: "Demasiados intentos para esta cuenta. Espera unos minutos e inténtalo de nuevo.",
  },
});

/**
 * Forgot-password — límite por email normalizado (mismo patrón que
 * loginRateLimiter), para que no se pueda inundar de correos de reset a una
 * cuenta ajena. Se aplica junto con authRateLimiter (por IP).
 */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email || "unknown";
  },
  message: {
    error: "Demasiadas solicitudes de restablecimiento. Espera unos minutos.",
  },
});

/** Checkout sessions (Stripe) */
export const checkoutRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de pago. Espera un momento." },
});

/**
 * Red de contención por defecto para el resto de la API (menú/sucursales
 * públicos, CRUD admin, etc.) que no tiene un limiter específico. Umbral alto
 * a propósito: no debe afectar uso normal, solo cortar abuso/scraping franco.
 * Se monta después de /health y /stripe/webhook para no afectarlos.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera un momento." },
});
