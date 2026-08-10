"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@ordena/shared";
import { Home, MapPin, ShoppingBag, UtensilsCrossed, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatMoney, useCart } from "@/lib/cart";
import { useBranchStatus } from "@/lib/use-branch-status";
import { cn } from "@/lib/utils";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { branchId, branchName, itemCount, subtotal } = useCart();
  const [customer, setCustomer] = useState<AuthUser | null>(null);
  const branchStatus = useBranchStatus(branchId);
  // Solo se oculta cuando ya confirmamos que la sucursal elegida no acepta
  // pedidos; mientras carga o no hay sucursal, se muestra por defecto.
  const menuNavAvailable = !branchId || branchStatus?.acceptingOrders !== false;

  const menuHref = branchId ? `/menu?branch=${branchId}` : "/sucursales";
  const hideStickyCart =
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/carrito") ||
    pathname.startsWith("/pedido/");
  const isHome = pathname === "/";

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con el token de auth (localStorage) al montar/cambiar de ruta
      setCustomer(null);
      return;
    }
    let cancelled = false;
    apiFetch<{ user: AuthUser }>("/auth/me", token)
      .then((res) => {
        if (!cancelled) setCustomer(res.user);
      })
      .catch(() => {
        if (!cancelled) setCustomer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const displayName =
    customer?.name?.trim().split(/\s+/)[0] ||
    customer?.email?.split("@")[0] ||
    null;

  return (
    <div className="flex min-h-full flex-col pb-20 md:pb-0">
      <header
        className={cn(
          "sticky top-0 z-40 transition-colors",
          isHome
            ? "border-b border-white/10 bg-orange-500/95 text-white backdrop-blur"
            : "site-header",
        )}
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/" className="shrink-0" aria-label="Ordena inicio">
              {isHome ? (
                <BrandLogo
                  height={45}
                  priority
                  className="[&_img]:brightness-0 [&_img]:invert"
                />
              ) : (
                <BrandLogo height={45} priority />
              )}
            </Link>
            <Link
              href="/sucursales"
              className={cn(
                "flex min-w-0 max-w-[9.5rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition sm:max-w-[14rem]",
                isHome
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300",
              )}
              title={
                branchName
                  ? `Sucursal: ${branchName}. Toca para cambiar.`
                  : "Elegir sucursal"
              }
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {branchName ?? "Elegir sucursal"}
              </span>
            </Link>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {[
              { href: "/sucursales", label: "Sucursales", match: "/sucursales" },
              ...(menuNavAvailable
                ? [{ href: menuHref, label: "Menú", match: "/menu" }]
                : []),
              { href: "/carrito", label: "Pedido", match: "/carrito" },
            ].map((item) => {
              const active = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    isHome
                      ? active
                        ? "bg-white text-orange-600"
                        : "text-white/90 hover:bg-white/15"
                      : active
                        ? "bg-orange-500 text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/carrito"
              className={cn(
                "relative inline-flex size-10 items-center justify-center rounded-full transition",
                isHome
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "btn-secondary p-0",
              )}
              aria-label="Tu pedido"
            >
              <ShoppingBag className="h-4 w-4" />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-orange-600 ring-2 ring-orange-500">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </Link>
            <ThemeToggle
              className={
                isHome
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : undefined
              }
            />
            {displayName ? (
              <Link
                href="/pedidos"
                className={cn(
                  "inline-flex max-w-[9rem] items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold sm:max-w-[12rem]",
                  isHome
                    ? "bg-white text-orange-600"
                    : "btn-primary",
                  pathname.startsWith("/pedidos") && !isHome && "ring-2 ring-orange-300",
                )}
                title="Mis pedidos"
              >
                <User className="hidden h-4 w-4 sm:block" />
                <span className="truncate">{displayName}</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  isHome
                    ? "bg-white text-orange-600"
                    : "btn-primary",
                )}
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />

      {itemCount > 0 && !hideStickyCart && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-30 px-4 md:bottom-6">
          <div className="pointer-events-auto mx-auto max-w-lg">
            <Link href="/carrito" className="sticky-order-bar">
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 opacity-90" />
                Ver pedido · {itemCount}
              </span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </Link>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-gray-700 dark:bg-gray-900/95"
        aria-label="Navegación principal"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
          {[
            { href: "/", label: "Inicio", icon: Home, active: pathname === "/" },
            {
              href: "/sucursales",
              label: "Sucursales",
              icon: MapPin,
              active: pathname.startsWith("/sucursales"),
            },
            ...(menuNavAvailable
              ? [
                  {
                    href: menuHref,
                    label: "Menú",
                    icon: UtensilsCrossed,
                    active: pathname.startsWith("/menu"),
                  },
                ]
              : []),
            {
              href: "/carrito",
              label: "Pedido",
              icon: ShoppingBag,
              active: pathname.startsWith("/carrito"),
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors",
                  item.active
                    ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={item.active ? 2.25 : 2} />
                {item.label}
                {item.href === "/carrito" && itemCount > 0 && (
                  <span className="absolute right-2.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
