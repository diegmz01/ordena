"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  Home,
  LogOut,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { logout } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Inicio", icon: Home, exact: true },
  { href: "/menu", label: "Menú", icon: UtensilsCrossed },
  { href: "/sucursales", label: "Sucursales", icon: Store },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/finanzas", label: "Finanzas", icon: Wallet },
];

const customerUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  function isActive(item: (typeof navItems)[number]) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-col pb-20 lg:pb-0">
      <header className="site-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="shrink-0 text-lg font-semibold tracking-tight text-gray-900 dark:text-white sm:text-xl"
          >
            Ordena Admin
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={customerUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary hidden size-10 p-0 sm:inline-flex"
              aria-label="Abrir sitio de clientes"
              title="Sitio clientes"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary hidden sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary size-10 p-0 sm:hidden"
              aria-label="Salir"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container-admin flex-1">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden dark:border-gray-700 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors",
                  active
                    ? "text-orange-500"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
