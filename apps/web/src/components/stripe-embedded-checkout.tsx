"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // El SDK de Stripe no expone un callback público de "listo": detectamos el
  // iframe que inyecta dentro del contenedor y esperamos a que termine de
  // cargar su contenido para saber cuándo ocultar el indicador.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let iframe: HTMLIFrameElement | null = null;
    const handleIframeLoad = () => setIsLoading(false);

    const attachToIframe = (node: HTMLIFrameElement) => {
      iframe = node;
      iframe.addEventListener("load", handleIframeLoad);
    };

    const existingIframe = container.querySelector("iframe");
    if (existingIframe) attachToIframe(existingIframe);

    const observer = new MutationObserver(() => {
      if (iframe) return;
      const found = container.querySelector("iframe");
      if (found) attachToIframe(found);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      iframe?.removeEventListener("load", handleIframeLoad);
    };
  }, [clientSecret]);

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
    <div>
      <div ref={containerRef} className="overflow-hidden rounded-2xl">
        <EmbeddedCheckoutProvider
          stripe={getStripePromise()}
          options={options}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
          <svg
            className="h-5 w-5 animate-spin text-orange-500"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
            />
          </svg>
          <span>Cargando el formulario de pago…</span>
        </div>
      )}
    </div>
  );
}
