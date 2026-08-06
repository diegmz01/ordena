import { prisma } from "@ordena/database";
import { notifyBranchOrderUpdated } from "./sse";
import { notifyCustomerOrderStatus } from "./web-push";

export const branchOrderInclude = {
  items: true,
  user: {
    select: { id: true, name: true, email: true, phone: true },
  },
} as const;

/**
 * Pasa a READY los pedidos PREPARING cuyo readyAt ya venció.
 * Sin branchId, corre sobre todas las sucursales (usado por el job periódico
 * en index.ts); con branchId, solo esa sucursal (usado por GET /orders/branch
 * como sweep inmediato al abrir el dashboard, para no esperar al próximo tick).
 */
export async function promoteDuePreparingOrders(branchId?: string) {
  const due = await prisma.order.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: "PREPARING",
      readyAt: { lte: new Date() },
    },
    include: branchOrderInclude,
  });

  const promoted = [];
  for (const order of due) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "READY" },
      include: branchOrderInclude,
    });

    await notifyBranchOrderUpdated(order.branchId, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: "READY",
    });

    try {
      await notifyCustomerOrderStatus(updated);
    } catch (pushError) {
      console.error("[orders.auto-ready] web-push", pushError);
    }

    promoted.push(updated);
  }

  return promoted;
}
