import { promoteDuePreparingOrders } from "../utils/promote-ready-orders";

const INTERVAL_MS = 30_000;

/**
 * Antes, un pedido PREPARING solo pasaba a READY (y el cliente recibía el
 * push de "listo") si alguien hacía GET /orders/branch — es decir, si el
 * dashboard de la sucursal estaba abierto en ese momento. Este job corre en
 * el mismo proceso de la API cada INTERVAL_MS y barre TODAS las sucursales,
 * para que la promoción no dependa de que haya un dashboard con la pestaña
 * abierta y con polling activo.
 *
 * Deploy actual = una sola instancia de la API (Railway, servicio persistente
 * de Node), así que un setInterval en proceso alcanza: no hay coordinación
 * entre réplicas. Si en el futuro se escala horizontalmente, dos instancias
 * podrían correr el sweep en paralelo y notificar el mismo pedido dos veces
 * (la actualización de status en sí es idempotente/inofensiva); si eso pasa,
 * mover esto a un cron externo con lock (o a una sola réplica dedicada).
 */
export function startPromoteReadyOrdersJob() {
  const timer = setInterval(() => {
    promoteDuePreparingOrders().catch((error) => {
      console.error("[jobs.promote-ready-orders]", error);
    });
  }, INTERVAL_MS);

  // No debe mantener vivo el proceso él solo (tests, scripts, shutdown limpio).
  timer.unref?.();

  return () => clearInterval(timer);
}
