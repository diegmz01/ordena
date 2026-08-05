import { randomBytes } from "crypto";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

/** Token opaco para ver un pedido sin autenticación (guest tracking). */
export function generateViewToken() {
  return randomBytes(24).toString("base64url");
}

export function generateOrderNumber() {
  const now = new Date();
  const stamp = [
    now.getFullYear().toString().slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `ORD-${stamp}-${rand}`;
}
