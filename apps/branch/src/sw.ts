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

// El lib.webworker.d.ts de esta versión de TypeScript no incluye
// `renotify`/`vibrate` en NotificationOptions, aunque son propiedades
// válidas del spec y soportadas por los navegadores. Se extiende el tipo
// en vez de castear el objeto entero, para no perder el chequeo de las
// demás propiedades.
type StaffNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  vibrate?: number | number[];
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

  const options: StaffNotificationOptions = {
    body: payload.body ?? "Tienes un pedido nuevo",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url ?? "/", orderId: payload.orderId },
    tag,
    renotify: Boolean(tag),
    // Persistente: no se autodescarta, solo se quita si el staff la toca
    // o la cierra manualmente (notificationclick abajo la cierra).
    requireInteraction: true,
    vibrate: payload.urgent ? [300, 150, 300, 150, 300] : [200],
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.title ?? "Ordena Sucursal",
      options,
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as
    | { url?: string; orderId?: string }
    | undefined;
  const targetUrl = data?.url ?? "/";
  const orderId = data?.orderId;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (!("focus" in client)) continue;
        await client.focus();
        // Si la app ya está abierta en el dashboard, no navegamos: un
        // navigate() recargaría la página y perdería la alerta de pantalla
        // completa (o cualquier otro estado en memoria). En vez de eso se
        // avisa por postMessage para que el pedido aparezca sin recargar.
        const clientPath = new URL(client.url).pathname;
        if (clientPath !== "/") {
          if ("navigate" in client) {
            await (client as WindowClient).navigate(targetUrl);
          }
        } else if (orderId) {
          client.postMessage({ type: "ordena:new-order", orderId });
        }
        return;
      }
      // Sin pestañas abiertas: se abre una nueva ya con el pedido marcado
      // en la URL para que la alerta de pantalla completa aparezca en
      // cuanto la app cargue, en vez de aterrizar en el dashboard normal.
      const openUrl = new URL(targetUrl, self.location.origin);
      if (orderId) openUrl.searchParams.set("newOrder", orderId);
      await self.clients.openWindow(openUrl.toString());
    })(),
  );
});
