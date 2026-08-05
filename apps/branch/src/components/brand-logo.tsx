"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { cn, useHydrated } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  height?: number;
  priority?: boolean;
  /** Logo claro para fondos naranja / oscuros (header de sucursal). */
  onBrand?: boolean;
};

export function BrandLogo({
  className,
  height = 28,
  priority = false,
  onBrand = false,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useHydrated();

  const isDark = mounted && resolvedTheme === "dark";
  const width = Math.round(height * 2.68);
  const src =
    onBrand || isDark ? "/logos/logo.svg" : "/logos/logo-orange.svg";

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <Image
        src={src}
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
