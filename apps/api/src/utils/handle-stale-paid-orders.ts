import { prisma } from "@ordena/database";
import { PAID_ORDER_DELAY_ALERT_MS, PAID_ORDER_AUTO_CANCEL_MS } from "@ordena/shared";
import { notifyBranchOrderUpdated } from "./sse";
import { notifyCustomerOrderStatus } from "./web-push";
import { settleStripePayment } from "./stripe";

const AUTO_CANCEL_REASON =
  "Cancelado automáticamente: pedido sin aceptar por más de 20 minutos.";

/**
 * Avisa una sola vez al cliente cuando su pedido PAID lleva
 * PAID_ORDER_DELAY_ALERT_MS sin ser aceptado, para que no se quede sin
 * señal mientras staff reacciona. No repite el aviso (customerDelayAlertSentAt).
 */
export async function notifyCustomersOfDelay(branchId?: string) {
  const threshold = new Date(Date.now() - PAID_ORDER_DELAY_ALERT_MS);

  const due = await prisma.order.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: "PAID",
      paidAt: { lte: threshold },
      customerDelayAlertSentAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      userId: true,
      guestEmail: true,
      viewToken: true,
    },
  });

  const notified: string[] = [];
  for (const order of due) {
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { customerDelayAlertSentAt: new Date() },
      });
      await notifyCustomerOrderStatus(order, {
        body: "Tu pedido está tardando más de lo esperado en ser confirmado. Ya avisamos a la sucursal, gracias por tu paciencia.",
      });
      notified.push(order.id);
    } catch (error) {
      console.error("[handle-stale-paid-orders] delay-alert", order.id, error);
    }
  }

  return notified;
}

/**
 * Cancela y reembolsa automáticamente cualquier pedido PAID que lleve
 * PAID_ORDER_AUTO_CANCEL_MS sin aceptar — sin importar si la sucursal está
 * online o no. Antes esto solo aplicaba con sucursal genuinamente offline
 * (heartbeat de staff vencido); se quitó esa condición porque un pedido
 * ignorado con la sucursal online (dashboard abierto, push llegando, pero
 * nadie le da aceptar) es el mismo riesgo para el cliente y no tenía
 * ningún mecanismo automático de rescate.
 * Usa una guarda optimista (updateMany where status=PAID) antes de tocar
 * Stripe para no pisar una aceptación concurrente; si Stripe falla tras
 * marcar CANCELLED, revierte a PAID para no dejar el pedido en un estado
 * inconsistente con el dinero.
 */
export async function autoCancelOrphanedOrders(branchId?: string) {
  const threshold = new Date(Date.now() - PAID_ORDER_AUTO_CANCEL_MS);

  const due = await prisma.order.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: "PAID",
      paidAt: { lte: threshold },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      branchId: true,
      userId: true,
      guestEmail: true,
      viewToken: true,
      stripePaymentIntentId: true,
    },
  });

  const cancelled: string[] = [];
  for (const order of due) {
    const guard = await prisma.order.updateMany({
      where: { id: order.id, status: "PAID" },
      data: { status: "CANCELLED", cancellationReason: AUTO_CANCEL_REASON },
    });
    if (guard.count === 0) continue; // staff acaba de aceptarlo, no tocar Stripe

    try {
      await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
    } catch (error) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", cancellationReason: null },
      });
      console.error("[handle-stale-paid-orders] auto-cancel settle", order.id, error);
      continue;
    }

    console.info(
      "[handle-stale-paid-orders] auto-cancelled",
      order.id,
      order.orderNumber,
      "branch",
      order.branchId,
    );

    await notifyBranchOrderUpdated(order.branchId, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: "CANCELLED",
    });

    try {
      await notifyCustomerOrderStatus({ ...order, status: "CANCELLED" });
    } catch (pushError) {
      console.error("[handle-stale-paid-orders] web-push", order.id, pushError);
    }

    cancelled.push(order.id);
  }

  return cancelled;
}
