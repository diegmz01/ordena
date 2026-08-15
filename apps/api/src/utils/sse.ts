import type { Response } from "express";
import { prisma } from "@ordena/database";

const HEARTBEAT_INTERVAL_MS = 20_000;

const branchClients = new Map<string, Set<Response>>();
let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Marca presencia de staff a partir de una conexión SSE viva. A diferencia
 * del heartbeat por POST de la PWA (staff-presence.tsx), esto corre en el
 * servidor: no depende de que el `setInterval` del navegador siga corriendo
 * a tiempo, así que no le afecta el throttling de timers de Chrome para
 * pestañas/ventanas en segundo plano (el navegador sigue recibiendo datos
 * de una conexión SSE abierta aunque estrangule los callbacks de JS de la
 * página). Mientras el stream siga conectado, la sucursal se sigue viendo
 * "presente" sin importar si la PWA está en foreground o no.
 */
function markBranchesPresent(branchIds: Iterable<string>) {
  const ids = [...branchIds];
  if (ids.length === 0) return;
  void prisma.branch
    .updateMany({
      where: { id: { in: ids } },
      data: { staffLastSeenAt: new Date(), staffAwayReason: null },
    })
    .catch(() => undefined);
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const connectedBranchIds: string[] = [];
    for (const [branchId, clients] of branchClients) {
      if (clients.size === 0) continue;
      connectedBranchIds.push(branchId);
      for (const res of clients) {
        try {
          res.write(": ping\n\n");
        } catch {
          clients.delete(res);
        }
      }
    }
    markBranchesPresent(connectedBranchIds);
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

/** Registra una conexión SSE para una sucursal. Devuelve función de limpieza. */
export function registerBranchClient(
  branchId: string,
  res: Response,
): () => void {
  let clients = branchClients.get(branchId);
  if (!clients) {
    clients = new Set();
    branchClients.set(branchId, clients);
  }
  clients.add(res);
  ensureHeartbeat();
  markBranchesPresent([branchId]);

  return () => {
    clients?.delete(res);
    if (clients && clients.size === 0) branchClients.delete(branchId);
  };
}

function broadcast(branchId: string, event: string, payload: unknown) {
  const clients = branchClients.get(branchId);
  if (!clients || clients.size === 0) return;
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(chunk);
    } catch {
      clients.delete(res);
    }
  }
}

export function notifyBranchNewOrder(
  branchId: string,
  payload: { orderId: string; orderNumber: string },
) {
  broadcast(branchId, "order:new", payload);
}

export function notifyBranchOrderUpdated(
  branchId: string,
  payload: { orderId: string; orderNumber: string; status: string },
) {
  broadcast(branchId, "order:updated", payload);
}

/**
 * El cliente canceló su propio pedido: interrumpe al staff con una alerta
 * a pantalla completa (además del reload normal), ya que no debe seguir
 * preparándolo. Distinto de `order:updated` para no confundirse con el
 * resto de transiciones de estado.
 */
export function notifyBranchCustomerCancelledOrder(
  branchId: string,
  payload: { orderId: string; orderNumber: string },
) {
  broadcast(branchId, "order:customer_cancelled", payload);
}
