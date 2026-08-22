import { Router } from "express";
import express from "express";
import { getStripe } from "../utils/stripe";
import { createOrderFromPendingCheckout } from "../utils/create-order-from-pending-checkout";
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
    // El pedido no existe todavía en este punto (ver PendingCheckout en
    // checkout.ts) — acá es donde se crea de verdad, ya con el pago
    // confirmado. Antes de esto solo hay un PendingCheckout, que no es un
    // Order ni aparece en el admin. `createOrderFromPendingCheckout` hace el
    // claim atómico contra reentregas/duplicados de Stripe (si dos entregas
    // del mismo evento llegan, solo la primera encuentra el PendingCheckout).
    //
    // async_payment_succeeded cubre el mismo caso para métodos de pago
    // asíncronos (ej. si algún día se habilita OXXO/SPEI) — hoy con tarjeta
    // no debería dispararse nunca, pero comparte el mismo manejador por si
    // acaso cambia la config de Stripe.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      const order = await createOrderFromPendingCheckout({
        stripeSessionId: session.id,
        paymentIntentId,
      });

      if (!order) {
        console.error(
          "[stripe.webhook] pending checkout not found for session (ya convertido, o sesión desconocida)",
          session.id,
        );
      }
    }

    // Sesión de Checkout expirada, o pago asíncrono que terminó fallando
    // (ej. SPEI/OXXO no pagado a tiempo): el cliente no completó el pago.
    // No hay pedido que cancelar — nunca se creó ninguno, así que basta con
    // borrar el intento pendiente. El PaymentIntent no confirmado ya fue
    // cancelado automáticamente por Stripe.
    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
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
