/* Minimal SW for local push testing when Serwist is disabled in development */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Ordena Sucursal",
    body: "Nuevo pedido",
    url: "/",
  };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data?.text() || payload.body;
  }
  const tag = payload.orderId ? `order-${payload.orderId}` : undefined;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
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
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
