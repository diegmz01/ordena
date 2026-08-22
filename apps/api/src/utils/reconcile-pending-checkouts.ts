import Stripe from "stripe";
import { prisma } from "@ordena/database";
import { RECONCILE_PENDING_CHECKOUT_AFTER_MS } from "@ordena/shared";
import { getStripe } from "./stripe";
import { createOrderFromPendingCheckout } from "./create-order-from-pending-checkout";
import { notifyAdmins } from "./admin-alerts";
import { sendMissedWebhookAlertEmail } from "../lib/mailer";

/**
 * Reconcilia `PendingCheckout` que llevan más de
 * RECONCILE_PENDING_CHECKOUT_AFTER_MS sin resolverse — cubre el caso en que
 * el webhook de Stripe nunca llegó (endpoint caído, mal configurado, o
 * Stripe agotó sus reintentos) para una sesión que el cliente sí pagó: sin
 * esto, el cliente queda con el cargo autorizado/retenido y ningún Order en
 * Ordena, sin que nadie se entere, hasta que Stripe libera el hold solo a
 * los ~7 días.
 *
 * De paso hace la limpieza de `PendingCheckout` huérfanos (sesión expirada
 * sin pagar) que el webhook `checkout.session.expired` tampoco haya
 * procesado — no hace falta un job de housekeeping aparte.
 */
export async function reconcilePendingCheckouts() {
  const threshold = new Date(
    Date.now() - RECONCILE_PENDING_CHECKOUT_AFTER_MS,
  );

  const stale = await prisma.pendingCheckout.findMany({
    where: { createdAt: { lte: threshold } },
    select: { stripeSessionId: true },
  });

  for (const pc of stale) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(
        pc.stripeSessionId,
      );

      if (session.payment_status === "paid") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);

        const order = await createOrderFromPendingCheckout({
          stripeSessionId: pc.stripeSessionId,
          paymentIntentId,
        });

        if (order) {
          console.warn(
            "[reconcile-pending-checkouts] recuperado sin webhook",
            order.id,
            order.orderNumber,
          );
          await notifyAdmins((to) =>
            sendMissedWebhookAlertEmail({
              to,
              orderNumber: order.orderNumber,
              orderId: order.id,
            }),
          );
        }
        continue;
      }

      if (session.status === "expired") {
        await prisma.pendingCheckout
          .delete({ where: { stripeSessionId: pc.stripeSessionId } })
          .catch(() => {}); // ya convertido/borrado por otra vía, no-op
        continue;
      }

      // status "open" y sin pagar: sesión legítimamente aún en curso (poco
      // probable pasado el umbral, pero posible) o abandonada sin expirar
      // todavía — se revisa de nuevo en el próximo tick.
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeError &&
        error.code === "resource_missing"
      ) {
        // La sesión ya no existe del lado de Stripe: fila basura, sin
        // dinero de por medio.
        await prisma.pendingCheckout
          .delete({ where: { stripeSessionId: pc.stripeSessionId } })
          .catch(() => {});
        continue;
      }
      console.error(
        "[reconcile-pending-checkouts]",
        pc.stripeSessionId,
        error,
      );
    }
  }
}
