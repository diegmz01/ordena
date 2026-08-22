import { prisma } from "@ordena/database";
import { notifyBranchOrderUpdated } from "./sse";
import { notifyCustomerOrderStatus } from "./web-push";
import { generatePickupCode } from "./pickup-code";
import { settleStripePayment } from "./stripe";
import { notifyAdmins } from "./admin-alerts";
import { sendCaptureFailedAlertEmail } from "../lib/mailer";

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
    try {
      // Mismo criterio que el PATCH manual de estado: el cobro Stripe ocurre
      // al quedar listo para recoger, no al entregar.
      if (order.total <= 0) {
        await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
        const cancelled = await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED", discount: order.subtotal, total: 0 },
          include: branchOrderInclude,
        });

        await notifyBranchOrderUpdated(order.branchId, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: "CANCELLED",
        });

        try {
          await notifyCustomerOrderStatus(cancelled);
        } catch (pushError) {
          console.error("[orders.auto-ready] web-push", pushError);
        }

        promoted.push(cancelled);
        continue;
      }

      await settleStripePayment(
        order.stripePaymentIntentId,
        "COMPLETED",
        order.total,
      );

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "READY",
          pickupCode: generatePickupCode(),
          readyReachedAt: new Date(),
        },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "READY",
      });

      try {
        await notifyCustomerOrderStatus(updated, {
          body: `Listo para recoger · Código: ${updated.pickupCode}`,
        });
      } catch (pushError) {
        console.error("[orders.auto-ready] web-push", pushError);
      }

      promoted.push(updated);
    } catch (error) {
      console.error("[orders.auto-ready] settle", order.id, error);

      // Guarda contra reenviar el correo en cada tick del job mientras el
      // pedido siga atorado (settle sigue fallando y reintentando).
      const guard = await prisma.order.updateMany({
        where: { id: order.id, captureFailedAt: null },
        data: { captureFailedAt: new Date() },
      });
      if (guard.count === 0) continue;

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      });

      try {
        const branch = await prisma.branch.findUnique({
          where: { id: order.branchId },
          select: { name: true },
        });
        await notifyAdmins((to) =>
          sendCaptureFailedAlertEmail({
            to,
            orderNumber: order.orderNumber,
            orderId: order.id,
            branchName: branch?.name ?? "Sucursal",
            stripeStatus: error instanceof Error ? error.message : "error desconocido",
          }),
        );
      } catch (alertError) {
        console.error("[orders.auto-ready] admin-alert", order.id, alertError);
      }
    }
  }

  return promoted;
}
