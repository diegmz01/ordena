import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error-handler";
import { verifyTurnstileToken } from "../utils/turnstile";

interface RequireTurnstileOptions {
  /** Si retorna true, se omite la verificación para esta request (ej. usuario ya autenticado). */
  skip?: (req: Request) => boolean;
}

/**
 * Exige y verifica un token de Cloudflare Turnstile (`req.body.turnstileToken`)
 * antes de continuar. Sin TURNSTILE_SECRET_KEY: en producción aborta el
 * arranque (ver assertProductionEnv), en desarrollo deja pasar con warning
 * para no bloquear a quien no configuró Turnstile localmente.
 */
export function requireTurnstile(options: RequireTurnstileOptions = {}) {
  return async function turnstileMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    try {
      if (options.skip?.(req)) {
        return next();
      }

      const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
      if (!secret) {
        console.warn(
          "[turnstile] TURNSTILE_SECRET_KEY no definido; se omite verificación (solo dev).",
        );
        return next();
      }

      const token =
        typeof req.body?.turnstileToken === "string"
          ? req.body.turnstileToken.trim()
          : "";
      if (!token) {
        throw new AppError(400, "Verificación anti-bot requerida");
      }

      const result = await verifyTurnstileToken(token, secret, req.ip);
      if (!result.success) {
        throw new AppError(
          400,
          "No pudimos verificar que eres humano. Intenta de nuevo.",
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
