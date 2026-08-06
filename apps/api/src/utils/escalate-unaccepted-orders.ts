import { prisma } from "@ordena/database";
import { notifyStaffNewOrder } from "./web-push";

/**
 * Cada cuánto se reenvía el push "urgente" a un pedido PAID sin aceptar,
 * mientras siga sin aceptarse. En el cliente, apps/branch/src/app/page.tsx
 * usa ALARM_REARM_MS con el mismo valor para re-armar la sirena tras un
 * "Ya lo vi", así push y sirena quedan aproximadamente sincronizados.
 */
export const STAFF_ALERT_REPEAT_MS = 60_000;

/**
 * Reenvía el push "urgente" a los pedidos PAID (sin aceptar) cuyo último
 * aviso a staff (lastStaffAlertAt) ya pasó STAFF_ALERT_REPEAT_MS. Sin
 * branchId, corre sobre todas las sucursales (usado por el job periódico
 * en index.ts); con branchId, solo esa sucursal (usado por GET
 * /orders/branch como sweep inmediato al abrir el dashboard, mismo patrón
 * que promoteDuePreparingOrders).
 *
 * El primer push (al momento del pago) lo sigue enviando
 * stripe-webhook.ts, que también fija lastStaffAlertAt = paidAt en ese
 * momento para que este sweep no reenvíe antes de tiempo.
 */
export async function escalateUnacceptedOrders(branchId?: string) {
  const threshold = new Date(Date.now() - STAFF_ALERT_REPEAT_MS);

  const due = await prisma.order.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: "PAID",
      paidAt: { not: null },
      OR: [
        { lastStaffAlertAt: null, paidAt: { lte: threshold } },
        { lastStaffAlertAt: { lte: threshold } },
      ],
    },
    select: { id: true, branchId: true, orderNumber: true },
  });

  const escalated: string[] = [];
  for (const order of due) {
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { lastStaffAlertAt: new Date() },
      });
      await notifyStaffNewOrder(order, { urgent: true });
      escalated.push(order.id);
    } catch (error) {
      console.error("[escalate-unaccepted-orders]", order.id, error);
    }
  }

  return escalated;
}
