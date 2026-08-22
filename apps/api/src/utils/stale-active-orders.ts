import { prisma } from "@ordena/database";
import { STALE_ACTIVE_ORDER_ALERT_MS } from "@ordena/shared";
import { notifyAdmins } from "./admin-alerts";
import { sendStaleActiveOrderAlertEmail } from "../lib/mailer";

const STALE_ACTIVE_STATUSES = ["PAID", "ACCEPTED", "PREPARING"] as const;

/**
 * Avisa a admin (una sola vez por pedido, por correo) cuando un pedido
 * activo lleva más de STALE_ACTIVE_ORDER_ALERT_MS desde que se pagó sin
 * llegar a READY. Cubre pedidos abandonados operativamente (nadie los
 * aceptó, o se quedaron en preparación) que de otro modo pasan
 * inadvertidos hasta que Stripe expira el hold de autorización (~7 días) —
 * ver también promote-ready-orders.ts para el caso de una captura que ya
 * falló explícitamente.
 */
export async function alertStaleActiveOrders() {
  const threshold = new Date(Date.now() - STALE_ACTIVE_ORDER_ALERT_MS);

  const due = await prisma.order.findMany({
    where: {
      status: { in: [...STALE_ACTIVE_STATUSES] },
      paidAt: { lte: threshold },
      staleOrderAlertSentAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paidAt: true,
      branch: { select: { name: true } },
    },
  });

  const alerted: string[] = [];
  for (const order of due) {
    // Guarda optimista: si dos ticks del job se solapan, solo uno gana y
    // envía el correo.
    const guard = await prisma.order.updateMany({
      where: { id: order.id, staleOrderAlertSentAt: null },
      data: { staleOrderAlertSentAt: new Date() },
    });
    if (guard.count === 0) continue;

    const hoursStuck = order.paidAt
      ? Math.floor((Date.now() - order.paidAt.getTime()) / (60 * 60_000))
      : 0;

    try {
      await notifyAdmins((to) =>
        sendStaleActiveOrderAlertEmail({
          to,
          orderNumber: order.orderNumber,
          orderId: order.id,
          branchName: order.branch.name,
          status: order.status,
          hoursStuck,
        }),
      );
      alerted.push(order.id);
    } catch (error) {
      console.error("[stale-active-orders]", order.id, error);
    }
  }

  return alerted;
}
