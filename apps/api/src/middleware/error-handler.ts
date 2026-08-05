import type { NextFunction, Request, Response } from "express";
import { captureError } from "../utils/sentry";

export class AppError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    // 4xx son respuestas esperadas (validación, permisos, etc.) — no son
    // "bugs". 5xx (Stripe caído, etc.) sí valen la pena reportar.
    if (err.statusCode >= 500) captureError(err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err && typeof err === "object" && "name" in err && err.name === "ZodError") {
    const zodErr = err as { issues?: { message?: string }[] };
    const first = zodErr.issues?.[0]?.message;
    const payload: { error: string; details?: unknown } = {
      error: first ?? "Datos inválidos",
    };
    if (process.env.NODE_ENV !== "production") {
      payload.details = err;
    }
    return res.status(400).json(payload);
  }

  console.error(err);
  captureError(err);

  if (
    err &&
    typeof err === "object" &&
    ("name" in err || "code" in err) &&
    (String((err as { name?: string }).name ?? "").includes("Prisma") ||
      (err as { code?: string }).code === "P1001" ||
      String((err as { message?: string }).message ?? "").includes(
        "Can't reach database",
      ))
  ) {
    return res.status(503).json({
      error:
        "No se puede conectar a la base de datos. Verifica que Postgres esté corriendo (docker compose up -d).",
    });
  }

  return res.status(500).json({ error: "Error interno del servidor" });
}
