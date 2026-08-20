"use client";

import { useMemo } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";

const publishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

// loadStripe inyecta el script de Stripe.js; una sola promesa por pestaña.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function StripeEmbeddedCheckout({
  clientSecret,
}: {
  clientSecret: string;
}) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  if (!publishableKey) {
    return (
      <p className="admin-alert-error">
        Falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. No se puede mostrar el
        formulario de pago.
      </p>
    );
  }

  // Sin fondo propio: el formulario de Stripe trae el suyo (definido en la
  // marca del Dashboard) y superponerlo a una .customer-card duplicaría
  // superficies en modo oscuro.
  return (
    <div className="overflow-hidden rounded-2xl">
      <EmbeddedCheckoutProvider stripe={getStripePromise()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
