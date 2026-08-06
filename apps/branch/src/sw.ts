/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // El proxy same-origin usa /api-backend/ (no /api/), así que sin esta
    // regla cae en el catch-all NetworkFirst de defaultCache — eso rompe el
    // EventSource de /branches/me/stream (el SW espera a que la respuesta
    // "termine" para cachearla, y un stream SSE nunca termina).
    {
      matcher: ({ url }) => url.pathname.startsWith("/api-backend/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data?.json() as {
        title?: string;
        body?: string;
        url?: string;
        orderId?: string;
        urgent?: boolean;
      };
    } catch {
      return {
        title: "Ordena Sucursal",
        body: event.data?.text() ?? "Nuevo pedido",
      };
    }
  })();

  // tag por pedido + renotify: los reenvíos de escalamiento (urgent)
  // colapsan en la misma notificación del sistema en vez de amontonarse.
  const tag = payload.orderId ? `order-${payload.orderId}` : undefined;

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Ordena Sucursal", {
      body: payload.body ?? "Tienes un pedido nuevo",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
      tag,
      renotify: Boolean(tag),
      // Persistente: no se autodescarta, solo se quita si el staff la toca
      // o la cierra manualmente (notificationclick abajo la cierra).
      requireInteraction: true,
      vibrate: payload.urgent ? [300, 150, 300, 150, 300] : [200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await (client as WindowClient).navigate(targetUrl);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
