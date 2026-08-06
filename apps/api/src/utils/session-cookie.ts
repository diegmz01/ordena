import type { CookieOptions, Request, Response } from "express";
import {
  AUTH_COOKIE_ADMIN,
  AUTH_COOKIE_BRANCH,
  AUTH_COOKIE_CUSTOMER,
} from "@ordena/shared";

export type AuthAudience = "customer" | "admin" | "branch";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieNameForAudience(audience: AuthAudience): string {
  if (audience === "admin") return AUTH_COOKIE_ADMIN;
  if (audience === "branch") return AUTH_COOKIE_BRANCH;
  return AUTH_COOKIE_CUSTOMER;
}

/**
 * Lee X-Ordena-Client, el header que cada app Next manda en toda request.
 * Es solo un hint de "desde qué app llama el browser" — se usa para decidir
 * qué cookie de sesión leer/limpiar (readBearerOrCookieToken, /auth/logout).
 * NO debe usarse para decidir qué cookie de sesión EMITIR en login/oauth-
 * exchange: eso sale siempre del rol real en DB (ver audienceForRole en
 * routes/auth.ts), porque el header lo controla el cliente. Usarlo solo para
 * decidir qué cookie *leer* es seguro: si alguien manda un valor falso, en el
 * peor caso no encuentra su propia cookie válida y falla el auth — no puede
 * usarse para hacerse pasar por otro rol, porque igual necesita el JWT firmado
 * correspondiente.
 */
export function resolveAudience(req: Request): AuthAudience {
  const raw = req.headers["x-ordena-client"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "admin" || value === "branch" || value === "customer") {
    return value;
  }
  return "customer";
}

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  audience: AuthAudience,
) {
  res.cookie(cookieNameForAudience(audience), token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response, audience: AuthAudience) {
  res.clearCookie(cookieNameForAudience(audience), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

/**
 * `forcedAudience` es para rutas que no pueden mandar X-Ordena-Client (p. ej.
 * un EventSource nativo del browser, que no permite headers custom) pero cuya
 * audiencia es inequívoca por diseño de la ruta misma — evita caer al default
 * "customer" de `resolveAudience` y leer la cookie equivocada.
 */
export function readBearerOrCookieToken(
  req: Request,
  forcedAudience?: AuthAudience,
): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  if (!cookies) return null;

  // Antes leía las 3 cookies en orden fijo (customer > admin > branch) sin
  // importar qué app llamó: si el browser traía más de una (p. ej. localhost
  // comparte cookies entre puertos 3000/3001/3002 en dev, o cualquier futuro
  // caso de dominios compartidos), la API autenticaba con la cuenta
  // equivocada — ej. staff logueado en branch quedaba "logueado" como cliente
  // en web. Cada request de las 3 apps manda X-Ordena-Client, así que solo
  // debe mirarse la cookie de esa audiencia.
  return cookies[cookieNameForAudience(forcedAudience ?? resolveAudience(req))] ?? null;
}
