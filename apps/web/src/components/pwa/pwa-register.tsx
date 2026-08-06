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

    // El SW usa skipWaiting + clientsClaim: en cuanto haya una versión nueva
    // toma control de las pestañas abiertas, pero eso no recarga el bundle
    // JS ya cargado en memoria. Sin este listener, una pestaña que se queda
    // abierta mucho tiempo puede seguir corriendo código viejo tras un deploy.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    let interval: number | undefined;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        interval = window.setInterval(() => {
          void registration.update();
        }, 60_000);
      })
      .catch((err) => console.error("[pwa] SW register failed", err));

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (interval != null) window.clearInterval(interval);
    };
  }, []);

  return null;
}
