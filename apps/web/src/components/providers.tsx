"use client";

import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { CartProvider } from "@/lib/cart";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // El embed de Stripe siempre se renderiza en claro; forzamos light aquí para
  // que no se vea desalineado contra un fondo dark.
  const forcedTheme = pathname === "/checkout" ? "light" : undefined;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="ordena-web-theme"
      disableTransitionOnChange
      forcedTheme={forcedTheme}
    >
      <CartProvider>{children}</CartProvider>
    </ThemeProvider>
  );
}
