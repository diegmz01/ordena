import Stripe from "stripe";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Falta ${name} en el entorno del E2E (claves de test de Stripe, ver e2e/README o el job "e2e" en CI)`,
    );
  }
  return value;
}

/**
 * Simula la confirmación de pago de Stripe sin pasar por su página hospedada:
 * recupera la Checkout Session real (ya creada por POST /checkout con claves
 * de test) y dispara un evento checkout.session.completed sintético, firmado
 * con el mismo STRIPE_WEBHOOK_SECRET que usa la API, contra el propio
 * endpoint del webhook. Técnica de prueba documentada por Stripe
 * (stripe.webhooks.generateTestHeaderString) — no requiere Stripe CLI ni red
 * hacia el checkout hospedado.
 */
export async function completeCheckoutSessionViaWebhook(
  apiUrl: string,
  sessionId: string,
): Promise<void> {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const stripe = new Stripe(secretKey);

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const payload = JSON.stringify({
    id: `evt_e2e_${session.id}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: session },
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });

  const res = await fetch(`${apiUrl}/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(
      `Webhook sintético de Stripe falló: ${res.status} ${await res.text()}`,
    );
  }
}
