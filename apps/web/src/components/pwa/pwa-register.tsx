"use client";

import { useEffect } from "react";

/**
 * Registers the Serwist service worker in production builds.
 * In development Serwist is disabled (Turbopack/webpack SW generation).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("[pwa] SW register failed", err));
  }, []);

  return null;
}
