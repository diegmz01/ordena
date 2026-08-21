"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { clearPendingPayment, readPendingPayment } from "@/lib/pending-payment";

export default function PagarClient() {
  const router = useRouter();
  const [pending, setPending] = useState<
    ReturnType<typeof readPendingPayment> | undefined
  >(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el hand-off de /checkout tras montar (sessionStorage, SSR-safe)
    setPending(readPendingPayment());
  }, []);

  // undefined: todavía no leímos sessionStorage (evita flash de redirect en SSR/hidratación)
  if (pending === undefined) return null;

  if (!pending) {
    router.replace("/carrito");
    return null;
  }

  return (
    <div className="container-page max-w-xl py-8">
      <StripeEmbeddedCheckout clientSecret={pending.clientSecret} />
      <div className="mt-4 text-center">
        <button
          type="button"
          className="link-action"
          onClick={() => {
            clearPendingPayment();
            router.push(
              pending.branchId
                ? `/checkout?branch=${pending.branchId}`
                : "/checkout",
            );
          }}
        >
          Volver al resumen
        </button>
      </div>
    </div>
  );
}
