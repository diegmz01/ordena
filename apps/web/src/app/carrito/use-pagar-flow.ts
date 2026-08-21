"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  writeUnavailableAlert,
  type CartItem,
  type CartPlate,
} from "@/lib/cart";
import { writePendingPayment } from "@/lib/pending-payment";
import { validateCartStock } from "@/lib/validate-cart-stock";

type SubmitOrderArgs = {
  token: string | null;
  asGuest: boolean;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  turnstileToken?: string;
};

type UsePagarFlowArgs = {
  branchId: string | null;
  items: CartItem[];
  plates: CartPlate[];
  notes: string;
  pruneUnavailableLines: (
    lines: { productId: string; modifierIds: string[] }[],
  ) => string[];
  /** Se llama cuando el stock cambió a mitad de camino, para refrescar la UI de /carrito sin navegar. */
  onUnavailable: (names: string[]) => void;
};

/**
 * Lógica de envío del pedido a Stripe, compartida entre el botón "Ir a
 * pagar" (usuario ya logueado) y el modal de invitado/registro en
 * /carrito. Antes vivía en /checkout; se movió aquí al saltar esa página.
 */
export function usePagarFlow({
  branchId,
  items,
  plates,
  notes,
  pruneUnavailableLines,
  onUnavailable,
}: UsePagarFlowArgs) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Misma key en todos los submits de este intento de pago: si el usuario
  // reenvía (doble clic, retry de red), la API reusa el pedido/Stripe Session
  // en vez de duplicarlos. Se renueva solo tras un intento fallido.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const ensureCartStillAvailable = useCallback(async () => {
    if (!branchId || items.length === 0) return false;
    const result = await validateCartStock(branchId, items);
    if (result.ok) return true;

    const removed = pruneUnavailableLines(
      result.unavailable.map((u) => ({
        productId: u.productId,
        modifierIds: u.modifierIds,
      })),
    );
    const names =
      removed.length > 0
        ? removed
        : [...new Set(result.unavailable.map((u) => u.productName))];
    writeUnavailableAlert(names);
    onUnavailable(names);
    return false;
  }, [branchId, items, pruneUnavailableLines, onUnavailable]);

  const submitOrder = useCallback(
    async (args: SubmitOrderArgs) => {
      if (pending) return;
      if (!branchId) {
        setError("Selecciona una sucursal primero");
        return;
      }
      if (items.length === 0) {
        setError("Tu carrito está vacío");
        return;
      }
      setPending(true);
      setError(null);
      try {
        const stillOk = await ensureCartStillAvailable();
        if (!stillOk) {
          throw new Error(
            "Algunos productos se agotaron. Revisa tu pedido e intenta de nuevo.",
          );
        }

        const result = await apiFetch<{ clientSecret: string | null }>(
          "/checkout",
          args.token,
          {
            method: "POST",
            body: JSON.stringify({
              branchId,
              idempotencyKey: idempotencyKeyRef.current,
              guestName: args.asGuest ? args.guestName || undefined : undefined,
              guestEmail: args.asGuest
                ? args.guestEmail || undefined
                : undefined,
              guestPhone: args.asGuest
                ? args.guestPhone || undefined
                : undefined,
              turnstileToken: args.asGuest
                ? args.turnstileToken ?? undefined
                : undefined,
              notes: notes.trim() || undefined,
              items: items.map((item) => {
                const plate = item.plateId
                  ? plates.find((p) => p.id === item.plateId)
                  : null;
                return {
                  productId: item.productId,
                  productName: item.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  modifierIds: item.modifierIds,
                  variantName:
                    item.modifierLabels.length > 0
                      ? item.modifierLabels.join(", ")
                      : undefined,
                  plateLabel: plate?.name,
                  secondaryProductId: item.secondaryProductId ?? undefined,
                };
              }),
            }),
          },
        );

        if (result.clientSecret) {
          // El formulario de pago se muestra solo, en su propia página, para
          // que la atención se concentre ahí (nada de header/resumen
          // alrededor).
          writePendingPayment(result.clientSecret, branchId);
          router.push("/checkout");
          return;
        }
        throw new Error("Stripe no devolvió la sesión de pago (revisa claves)");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        // Intento fallido (ej. producto agotado): un reintento deliberado del
        // usuario es un pedido nuevo, no debe chocar con la key ya cancelada.
        idempotencyKeyRef.current = crypto.randomUUID();
        throw err;
      } finally {
        setPending(false);
      }
    },
    [pending, branchId, items, plates, notes, router, ensureCartStillAvailable],
  );

  return { submitOrder, pending, error, setError };
}
