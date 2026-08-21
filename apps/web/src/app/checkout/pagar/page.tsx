import { Suspense } from "react";
import PagarClient from "./pagar-client";

export default function PagarPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm">Cargando pago…</div>}>
      <PagarClient />
    </Suspense>
  );
}
