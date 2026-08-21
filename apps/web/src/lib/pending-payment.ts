/**
 * Handoff entre /carrito y /checkout: el client_secret de Stripe no viaja en
 * la URL (queda en el historial/referrer) ni en el estado de React (se
 * pierde al navegar a otra página) — se guarda en sessionStorage, mismo
 * patrón que readUnavailableAlert/writeUnavailableAlert en lib/cart.tsx.
 */

const PENDING_PAYMENT_KEY = "ordena-pending-payment";

type PendingPayment = {
  clientSecret: string;
  branchId: string | null;
};

export function readPendingPayment(): PendingPayment | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as PendingPayment).clientSecret === "string"
    ) {
      return parsed as PendingPayment;
    }
    return null;
  } catch {
    return null;
  }
}

export function writePendingPayment(
  clientSecret: string,
  branchId: string | null,
) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    PENDING_PAYMENT_KEY,
    JSON.stringify({ clientSecret, branchId } satisfies PendingPayment),
  );
}

export function clearPendingPayment() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_PAYMENT_KEY);
}
