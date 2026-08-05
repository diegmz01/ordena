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
 * Es solo un hint de "desde qué app llama el browser" — hoy únicamente se usa
 * para decidir qué cookie limpiar en /auth/logout. NO debe usarse para decidir
 * qué cookie de sesión emitir en login/oauth-exchange: eso sale siempre del
 * rol real en DB (ver audienceForRole en routes/auth.ts), porque el header
 * lo controla el cliente y un usuario puede llamar la API con cualquier valor.
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

export function readBearerOrCookieToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  if (!cookies) return null;

  return (
    cookies[AUTH_COOKIE_CUSTOMER] ||
    cookies[AUTH_COOKIE_ADMIN] ||
    cookies[AUTH_COOKIE_BRANCH] ||
    null
  );
}
