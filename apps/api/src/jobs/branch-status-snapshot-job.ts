import { recordBranchStatusChanges } from "../utils/branch-status-events";

const INTERVAL_MS = 60_000;

/**
 * Muestrea el estado efectivo de cada sucursal cada INTERVAL_MS y solo
 * persiste un evento en BranchStatusEvent cuando cambia, para poder
 * reconstruir después (ver getMonthlyConnectivitySummary) cuánto tiempo
 * estuvo abierta, si respetó su horario, y si tuvo problemas de conexión —
 * usado por la sección "Conectividad" del detalle de sucursal en admin.
 *
 * Mismo patrón/limitación que promote-ready-orders-job.ts: un solo proceso
 * de API en el VPS, así que un setInterval en proceso alcanza.
 */
export function startBranchStatusSnapshotJob() {
  const timer = setInterval(() => {
    recordBranchStatusChanges().catch((error) => {
      console.error("[jobs.branch-status-snapshot]", error);
    });
  }, INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
