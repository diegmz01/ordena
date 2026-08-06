import { Router } from "express";
import express from "express";
import { fetchStripeCardSummary, getStripe } from "../utils/stripe";
import { notifyBranchNewOrder } from "../utils/sse";
import { notifyStaffNewOrder } from "../utils/web-push";
import { nextBranchDayNumber } from "../utils/branch-day-number";
import { prisma } from "@ordena/database";

export const stripeWebhookRouter = Router();

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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const order = await prisma.order.findUnique({
        where: { stripeSessionId: session.id },
      });

      if (order && order.status === "PENDING_PAYMENT") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        const paidAt = new Date();
        let dayMeta = await nextBranchDayNumber(
          prisma,
          order.branchId,
          paidAt,
        );
        const card = await fetchStripeCardSummary(paymentIntentId);

        // Claim atómico por estado: si Stripe reentrega/duplica este evento,
        // solo la primera entrega que sigue viendo PENDING_PAYMENT gana la
        // carrera y notifica; las demás se detectan vía count === 0 y salen.
        let claimed = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const result = await prisma.order.updateMany({
              where: { id: order.id, status: "PENDING_PAYMENT" },
              data: {
                status: "PAID",
                paidAt,
                stripePaymentIntentId: paymentIntentId ?? null,
                dayNumber: dayMeta.dayNumber,
                businessDate: dayMeta.businessDate,
                paymentBrand: card.paymentBrand,
                paymentFunding: card.paymentFunding,
                paymentLast4: card.paymentLast4,
              },
            });
            claimed = result.count > 0;
            break;
          } catch (err) {
            const code =
              err && typeof err === "object" && "code" in err
                ? String((err as { code?: string }).code)
                : "";
            if (code !== "P2002" || attempt === 4) throw err;
            dayMeta = await nextBranchDayNumber(prisma, order.branchId, paidAt);
          }
        }

        if (claimed) {
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
        }
      }
    }

    return res.json({ received: true });
  },
);
