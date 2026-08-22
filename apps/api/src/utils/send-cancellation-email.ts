import { sendOrderCancelledEmail } from "../lib/mailer";

/**
 * Envía el correo de "pedido cancelado" si el pedido tiene un email de
 * contacto, sin tronar el caller si el correo falla. Antes solo se
 * invocaba desde admin-cancel; los demás caminos de cancelación (cliente,
 * staff, auto-cancel por sucursal ignorando el pedido, $0 por agotados)
 * solo mandaban push — si el cliente no tenía push activo, se quedaba sin
 * ningún registro escrito del reembolso.
 */
export async function sendCancellationEmailIfPossible(
  order: {
    orderNumber: string;
    cancellationReason: string | null;
    total: number;
    currency: string;
    guestEmail: string | null;
    guestName: string | null;
    user: { email: string; name: string | null } | null;
  },
  context: string,
) {
  const to = order.user?.email ?? order.guestEmail;
  if (!to) return;

  try {
    await sendOrderCancelledEmail({
      to,
      name: order.user?.name ?? order.guestName,
      orderNumber: order.orderNumber,
      cancellationReason: order.cancellationReason,
      total: order.total,
      currency: order.currency,
    });
  } catch (error) {
    console.error(`[${context}] mailer`, error);
  }
}
