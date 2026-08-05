"use client";

import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa/pwa-register";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="ordena-branch-theme"
      disableTransitionOnChange
    >
      <PwaRegister />
      {children}
    </ThemeProvider>
  );
}
