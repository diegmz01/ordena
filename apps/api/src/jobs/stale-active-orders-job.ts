import { alertStaleActiveOrders } from "../utils/stale-active-orders";

/**
 * A diferencia de los otros jobs del proceso (promote-ready-orders,
 * escalate-unaccepted-orders, handle-stale-paid-orders), el umbral que
 * vigila este job es de 24h (STALE_ACTIVE_ORDER_ALERT_MS), así que no
 * necesita un tick tan ajustado — cada 10 min es más que suficiente para
 * no acumular retraso perceptible frente a esa ventana.
 */
const INTERVAL_MS = 10 * 60_000;

export function startStaleActiveOrdersJob() {
  const timer = setInterval(() => {
    alertStaleActiveOrders().catch((error) => {
      console.error("[jobs.stale-active-orders]", error);
    });
  }, INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
