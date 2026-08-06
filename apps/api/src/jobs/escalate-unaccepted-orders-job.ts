import { escalateUnacceptedOrders } from "../utils/escalate-unaccepted-orders";

/**
 * Tick del sweep. Debe ser menor a STAFF_ALERT_REPEAT_MS (60s, en
 * escalate-unaccepted-orders.ts) para que el retraso entre "vencido" y
 * "reenviado" no se acumule; 20s deja margen sin generar carga excesiva.
 */
const INTERVAL_MS = 20_000;

/**
 * Igual que promote-ready-orders-job.ts: corre en el mismo proceso de la
 * API cada INTERVAL_MS y barre todas las sucursales para reenviar el push
 * "urgente" a pedidos PAID que llevan STAFF_ALERT_REPEAT_MS sin aceptar,
 * sin depender de que el dashboard de sucursal esté abierto.
 *
 * Deploy actual = una sola instancia de la API, así que un setInterval en
 * proceso alcanza; ver el comentario en promote-ready-orders-job.ts sobre
 * qué hacer si algún día se escala horizontalmente.
 */
export function startEscalateUnacceptedOrdersJob() {
  const timer = setInterval(() => {
    escalateUnacceptedOrders().catch((error) => {
      console.error("[jobs.escalate-unaccepted-orders]", error);
    });
  }, INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
