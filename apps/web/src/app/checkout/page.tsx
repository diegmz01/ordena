import { Suspense } from "react";
import CheckoutClient from "./checkout-client";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm">Cargando checkout…</div>}>
      <CheckoutClient />
    </Suspense>
  );
}
