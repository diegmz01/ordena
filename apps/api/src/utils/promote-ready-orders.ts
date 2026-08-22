import { prisma } from "@ordena/database";
import { notifyBranchOrderUpdated } from "./sse";
import { notifyCustomerOrderStatus } from "./web-push";
import { generatePickupCode } from "./pickup-code";
import { settleStripePayment } from "./stripe";
import { flagCaptureFailure } from "./capture-failure-alert";
import { sendCancellationEmailIfPossible } from "./send-cancellation-email";

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
          data: {
            status: "CANCELLED",
            discount: order.subtotal,
            total: 0,
            cancellationReason:
              "Cancelado automáticamente: todos los productos del pedido se agotaron antes de que la sucursal lo aceptara.",
          },
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
        await sendCancellationEmailIfPossible(cancelled, "orders.auto-ready");

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

      // flagCaptureFailure ya trae su propia guarda para no reenviar el
      // correo en cada tick mientras el pedido siga atorado.
      const isFirstAlert = await flagCaptureFailure(order, error);
      if (isFirstAlert) {
        await notifyBranchOrderUpdated(order.branchId, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        });
      }
    }
  }

  return promoted;
}
