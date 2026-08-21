import jwt from "jsonwebtoken";
import type { Role } from "@ordena/database";
import { getJwtSecret } from "./jwt";

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * Umbral de sliding session: si a un token autenticado le queda menos de esto
 * antes de expirar, `authenticate` reemite un token/cookie frescos de
 * SESSION_TTL_SEC. Así una sesión usada con regularidad no expira nunca,
 * pero una inactiva por SESSION_TTL_SEC sí lo hace (ver middleware/auth.ts).
 */
export const SESSION_RENEW_THRESHOLD_SEC = 24 * 60 * 60;

export interface SessionTokenUser {
  id: string;
  email: string;
  role: Role;
  branchId: string | null;
}

export function signSessionToken(user: SessionTokenUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    },
    getJwtSecret(),
    { expiresIn: SESSION_TTL_SEC },
  );
}
