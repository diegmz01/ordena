import type { Response } from "express";

const HEARTBEAT_INTERVAL_MS = 20_000;

const branchClients = new Map<string, Set<Response>>();
let heartbeatTimer: NodeJS.Timeout | null = null;

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const clients of branchClients.values()) {
      for (const res of clients) {
        try {
          res.write(": ping\n\n");
        } catch {
          clients.delete(res);
        }
      }
    }
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
