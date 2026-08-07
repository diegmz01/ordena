"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { useCart } from "@/lib/cart";

export function HomeHeroCta() {
  const { branchId, branchName, itemCount } = useCart();

  const primary =
    itemCount > 0
      ? { href: "/carrito", label: "Seguir con tu pedido" }
      : branchId
        ? { href: `/menu?branch=${branchId}`, label: `Ver menú · ${branchName}` }
        : { href: "/sucursales", label: "Empezar pedido" };

  const showSecondary = primary.href !== "/sucursales";

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link
        href={primary.href}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-orange-600 shadow-lg transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {primary.label}
        <ArrowRight className="size-4" />
      </Link>
      {showSecondary && (
        <Link
          href="/sucursales"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          <MapPin className="size-4" />
          Cambiar sucursal
        </Link>
      )}
    </div>
  );
}
