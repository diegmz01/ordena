import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Vuelve al dashboard de pedidos en vivo. */
export function BackToLiveOrders() {
  return (
    <Link
      href="/"
      className="link-action -ml-3 mb-1"
      aria-label="Regresar a Pedidos en vivo"
    >
      <ArrowLeft className="h-4 w-4" />
      Regresar
    </Link>
  );
}
