import { Router } from "express";
import express from "express";
import { fetchStripeCardSummary, getStripe } from "../utils/stripe";
import { notifyBranchNewOrder } from "../utils/sse";
import { notifyStaffNewOrder } from "../utils/web-push";
import { nextBranchDayNumber } from "../utils/branch-day-number";
import { prisma } from "@ordena/database";

export const stripeWebhookRouter = Router();

/** Snapshot guardado en PendingCheckout.itemsJson — misma forma que espera items.create. */
type PendingItemSnapshot = {
  productId: string;
  productName: string;
  variantName?: string;
  secondaryProductId?: string;
  secondaryProductName?: string;
  plateLabel: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

stripeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || typeof signature !== "string" || !webhookSecret) {
      return res.status(400).json({ error: "Missing signature or secret" });
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error("[stripe.webhook]", err);
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Con capture_method: manual, session completed = fondos autorizados
    // (congelados), no cobrados aún. El cobro ocurre al marcar COMPLETED.
    // El pedido no existe todavía en este punto (ver PendingCheckout en
    // checkout.ts) — acá es donde se crea de verdad, ya con el pago
    // confirmado. Antes de esto solo hay un PendingCheckout, que no es un
    // Order ni aparece en el admin.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      const paidAt = new Date();
      const card = await fetchStripeCardSummary(paymentIntentId);

      // Claim atómico: si Stripe reentrega/duplica este evento, solo la
      // primera entrega que todavía encuentra el PendingCheckout gana la
      // carrera (delete lo consume) y notifica; las demás ven pc === null
      // (ya sea porque otra entrega ganó, o porque la sesión es desconocida)
      // y no hacen nada.
      let order = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          order = await prisma.$transaction(async (tx) => {
            const pc = await tx.pendingCheckout
              .delete({ where: { stripeSessionId: session.id } })
              .catch((err) => {
                const code =
                  err && typeof err === "object" && "code" in err
                    ? String((err as { code?: string }).code)
                    : "";
                if (code === "P2025") return null;
                throw err;
              });
            if (!pc) return null;

            const dayMeta = await nextBranchDayNumber(tx, pc.branchId, paidAt);

            return tx.order.create({
              data: {
                id: pc.id,
                orderNumber: pc.orderNumber,
                viewToken: pc.viewToken,
                idempotencyKey: pc.idempotencyKey,
                status: "PAID",
                branchId: pc.branchId,
                userId: pc.userId,
                guestName: pc.guestName,
                guestEmail: pc.guestEmail,
                guestPhone: pc.guestPhone,
                subtotal: pc.subtotal,
                serviceFee: pc.serviceFee,
                total: pc.total,
                notes: pc.notes,
                stripeSessionId: session.id,
                stripePaymentIntentId: paymentIntentId ?? null,
                paidAt,
                lastStaffAlertAt: paidAt,
                dayNumber: dayMeta.dayNumber,
                businessDate: dayMeta.businessDate,
                paymentBrand: card.paymentBrand,
                paymentFunding: card.paymentFunding,
                paymentLast4: card.paymentLast4,
                items: {
                  create: pc.itemsJson as unknown as PendingItemSnapshot[],
                },
              },
            });
          });
          break;
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: string }).code)
              : "";
          // Choque en (branchId, businessDate, dayNumber): toda la tx hizo
          // rollback (incluido el delete), así que el PendingCheckout sigue
          // ahí y reintentar desde cero es seguro.
          if (code !== "P2002" || attempt === 4) throw err;
        }
      }

      if (order) {
        try {
          await notifyBranchNewOrder(order.branchId, {
            orderId: order.id,
            orderNumber: order.orderNumber,
          });
        } catch (sseError) {
          console.error("[stripe.webhook] sse", sseError);
        }

        try {
          await notifyStaffNewOrder({
            branchId: order.branchId,
            id: order.id,
            orderNumber: order.orderNumber,
          });
        } catch (pushError) {
          console.error("[stripe.webhook] web-push", pushError);
        }
      } else {
        console.error(
          "[stripe.webhook] pending checkout not found for session (ya convertido, o sesión desconocida)",
          session.id,
        );
      }
    }

    // Sesión de Checkout expirada sin completar el pago: el cliente
    // abandonó el flujo. No hay pedido que cancelar — nunca se creó ninguno,
    // así que basta con borrar el intento pendiente. El PaymentIntent no
    // confirmado ya fue cancelado automáticamente por Stripe.
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      // count === 0 es normal si ya se había convertido en Order (otra
      // entrega del webhook .completed ganó la carrera) — no-op.
      await prisma.pendingCheckout.deleteMany({
        where: { stripeSessionId: session.id },
      });
    }

    return res.json({ received: true });
  },
);
