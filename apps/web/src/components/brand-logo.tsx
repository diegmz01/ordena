"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { cn, useHydrated } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  /** Altura aproximada en px (el SVG es horizontal). */
  height?: number;
  priority?: boolean;
};

export function BrandLogo({
  className,
  height = 28,
  priority = false,
}: BrandLogoProps) {
  const { resolvedTheme, forcedTheme } = useTheme();
  const mounted = useHydrated();

  // forcedTheme (p.ej. /checkout) fuerza la clase del DOM, pero
  // resolvedTheme sigue reflejando la preferencia real del usuario/sistema
  // -- hay que priorizar forcedTheme para que el logo coincida con el fondo.
  const isDark = mounted && (forcedTheme ?? resolvedTheme) === "dark";
  // viewBox 1224 x 456.6 ≈ ratio 2.68
  const width = Math.round(height * 2.68);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <Image
        src={isDark ? "/logos/logo.svg" : "/logos/logo-orange.svg"}
        alt="Ordena"
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto"
        style={{ height, width: "auto" }}
      />
    </span>
  );
}
