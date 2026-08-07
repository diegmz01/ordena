import {
  notifyCustomersOfDelay,
  autoCancelOrphanedOrders,
} from "../utils/handle-stale-paid-orders";

/**
 * Tick del sweep. Menor a PAID_ORDER_DELAY_ALERT_MS (5 min) y
 * PAID_ORDER_AUTO_CANCEL_MS (20 min, en handle-stale-paid-orders.ts) para
 * no acumular retraso entre "vencido" y "procesado".
 */
const INTERVAL_MS = 30_000;

/**
 * Igual que los otros jobs del proceso (promote-ready-orders,
 * escalate-unaccepted-orders): setInterval en el mismo proceso de la API,
 * barre todas las sucursales cada INTERVAL_MS para avisar al cliente de
 * pedidos PAID demorados y auto-cancelar/reembolsar los que quedaron
 * huérfanos por sucursal offline.
 */
export function startHandleStalePaidOrdersJob() {
  const timer = setInterval(() => {
    notifyCustomersOfDelay().catch((error) => {
      console.error("[jobs.handle-stale-paid-orders] delay-alert", error);
    });
    autoCancelOrphanedOrders().catch((error) => {
      console.error("[jobs.handle-stale-paid-orders] auto-cancel", error);
    });
  }, INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
