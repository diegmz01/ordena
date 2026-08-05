import { clsx, type ClassValue } from "clsx";
import { useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function subscribeNoop() {
  return () => {};
}

/** True solo tras hidratar en el cliente; evita mismatches de SSR sin setState en un efecto. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
