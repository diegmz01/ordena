import { prisma } from "@ordena/database";
import { notifyAdmins } from "./admin-alerts";
import { sendCaptureFailedAlertEmail } from "../lib/mailer";

/**
 * Marca Order.captureFailedAt (una sola vez) y avisa a admin por correo
 * cuando settleStripePayment falla al intentar capturar. Compartido entre
 * el job automático (promoteDuePreparingOrders) y el marcado manual de
 * READY (PATCH /orders/:id/status) — antes solo el job lo cubría, dejando
 * sin alerta el mismo fallo si staff marca "Listo" a mano.
 *
 * Devuelve true si esta llamada fue la que disparó la alerta (para que el
 * caller decida si vale la pena un aviso adicional, ej. SSE).
 */
export async function flagCaptureFailure(
  order: { id: string; orderNumber: string; branchId: string },
  error: unknown,
): Promise<boolean> {
  const guard = await prisma.order.updateMany({
    where: { id: order.id, captureFailedAt: null },
    data: { captureFailedAt: new Date() },
  });
  if (guard.count === 0) return false;

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
    console.error("[capture-failure-alert]", order.id, alertError);
  }

  return true;
}
