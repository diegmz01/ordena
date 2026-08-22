import { reconcilePendingCheckouts } from "../utils/reconcile-pending-checkouts";

/**
 * No necesita un tick ajustado: el umbral que vigila
 * (RECONCILE_PENDING_CHECKOUT_AFTER_MS) es de 5 min, y el propósito es
 * detectar webhooks perdidos, no competir con la entrega normal (casi
 * instantánea) del webhook.
 */
const INTERVAL_MS = 5 * 60_000;

export function startReconcilePendingCheckoutsJob() {
  const timer = setInterval(() => {
    reconcilePendingCheckouts().catch((error) => {
      console.error("[jobs.reconcile-pending-checkouts]", error);
    });
  }, INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
