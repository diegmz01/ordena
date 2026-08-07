import { prisma } from "@ordena/database";

export type MonthlyConnectivitySummary = {
  hasData: boolean;
  monthStart: string;
  generatedAt: string;
  /** Tiempo (ms) dentro del horario configurado, desde el inicio del mes hasta ahora. */
  scheduledMs: number;
  /** Tiempo (ms) realmente abierta y aceptando pedidos dentro de ese horario. */
  openMs: number;
  /** openMs / scheduledMs, o null si no hubo horario programado en el rango. */
  complianceRate: number | null;
  /** Tiempo (ms) en horario pero sin conexión (red/API sin respuesta). */
  connectivityLossMs: number;
  /** Tiempo (ms) en horario pero con la PWA de staff cerrada. */
  appClosedMs: number;
  /** Tiempo (ms) en horario pero pausada/cerrada manualmente (admin o staff). */
  manualClosedMs: number;
  /** Número de veces que se entró a cada tipo de incidente durante el mes. */
  incidents: {
    connectivityLoss: number;
    appClosed: number;
    manualClosed: number;
  };
  lastEventAt: string | null;
};

type StatusPoint = {
  status: string;
  source: string;
  offlineCause: string | null;
  withinSchedule: boolean;
};

function emptySummary(monthStart: Date, now: Date): MonthlyConnectivitySummary {
  return {
    hasData: false,
    monthStart: monthStart.toISOString(),
    generatedAt: now.toISOString(),
    scheduledMs: 0,
    openMs: 0,
    complianceRate: null,
    connectivityLossMs: 0,
    appClosedMs: 0,
    manualClosedMs: 0,
    incidents: { connectivityLoss: 0, appClosed: 0, manualClosed: 0 },
    lastEventAt: null,
  };
}

/**
 * Reconstruye, a partir de BranchStatusEvent, un resumen del mes en curso
 * (desde monthStart hasta `now`) para la sección "Conectividad" del detalle
 * de sucursal en admin: cuánto tiempo estuvo dentro de su horario, cuánto de
 * ese tiempo estuvo realmente abierta, y cuánto se perdió por falta de
 * conexión, por cierre manual de la app, o por pausa/cierre manual desde
 * admin/staff.
 *
 * Cada fila de BranchStatusEvent es un punto de cambio de estado (solo se
 * inserta cuando algo cambió), así que el estado de un evento se considera
 * vigente hasta el siguiente evento (o hasta `now` si es el último).
 */
export async function getMonthlyConnectivitySummary(
  branchId: string,
  monthStart: Date,
  now: Date = new Date(),
): Promise<MonthlyConnectivitySummary> {
  const [priorEvent, monthEvents] = await Promise.all([
    prisma.branchStatusEvent.findFirst({
      where: { branchId, createdAt: { lt: monthStart } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.branchStatusEvent.findMany({
      where: { branchId, createdAt: { gte: monthStart, lte: now } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!priorEvent && monthEvents.length === 0) {
    return emptySummary(monthStart, now);
  }

  let scheduledMs = 0;
  let openMs = 0;
  let connectivityLossMs = 0;
  let appClosedMs = 0;
  let manualClosedMs = 0;
  const incidents = { connectivityLoss: 0, appClosed: 0, manualClosed: 0 };

  function accumulate(state: StatusPoint, fromMs: number, toMs: number) {
    const durationMs = toMs - fromMs;
    if (durationMs <= 0 || !state.withinSchedule) return;
    scheduledMs += durationMs;
    if (state.status === "OPEN") {
      openMs += durationMs;
    } else if (state.source === "offline" && state.offlineCause === "connection_lost") {
      connectivityLossMs += durationMs;
    } else if (state.source === "offline" && state.offlineCause === "app_closed") {
      appClosedMs += durationMs;
    } else {
      manualClosedMs += durationMs;
    }
  }

  function countIncident(state: StatusPoint) {
    if (!state.withinSchedule) return;
    if (state.source === "offline" && state.offlineCause === "connection_lost") {
      incidents.connectivityLoss += 1;
    } else if (state.source === "offline" && state.offlineCause === "app_closed") {
      incidents.appClosed += 1;
    } else if (state.status !== "OPEN") {
      incidents.manualClosed += 1;
    }
  }

  let currentState: StatusPoint | null = priorEvent
    ? {
        status: priorEvent.status,
        source: priorEvent.source,
        offlineCause: priorEvent.offlineCause,
        withinSchedule: priorEvent.withinSchedule,
      }
    : null;
  let cursorMs = monthStart.getTime();
  const nowMs = now.getTime();

  for (const row of monthEvents) {
    const eventMs = Math.min(row.createdAt.getTime(), nowMs);
    if (currentState) accumulate(currentState, cursorMs, eventMs);
    cursorMs = eventMs;
    countIncident(row);
    currentState = {
      status: row.status,
      source: row.source,
      offlineCause: row.offlineCause,
      withinSchedule: row.withinSchedule,
    };
  }
  if (currentState) accumulate(currentState, cursorMs, nowMs);

  const lastEventAt =
    monthEvents.length > 0
      ? monthEvents[monthEvents.length - 1].createdAt
      : (priorEvent?.createdAt ?? null);

  return {
    hasData: true,
    monthStart: monthStart.toISOString(),
    generatedAt: now.toISOString(),
    scheduledMs,
    openMs,
    complianceRate: scheduledMs > 0 ? openMs / scheduledMs : null,
    connectivityLossMs,
    appClosedMs,
    manualClosedMs,
    incidents,
    lastEventAt: lastEventAt ? lastEventAt.toISOString() : null,
  };
}
