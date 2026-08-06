import { randomInt } from "node:crypto";

/** Código de 4 dígitos que el cliente debe dar en sucursal para recoger su pedido. */
export function generatePickupCode(): string {
  return String(randomInt(1000, 10000));
}
