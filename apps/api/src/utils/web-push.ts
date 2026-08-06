import webpush from "web-push";
import { prisma } from "@ordena/database";

const STATUS_LABELS: Record<string, string> = {
  PAID: "Pago autorizado",
  ACCEPTED: "Pedido aceptado",
  PREPARING: "En preparación",
  READY: "Listo para recoger",
  COMPLETED: "Pedido recogido",
  CANCELLED: "Pedido cancelado",
};

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@ordena.local";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendToSubscriptions(
  subscriptions: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[],
  payload: string,
) {
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      sent += 1;
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : undefined;

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      } else {
        console.error("[web-push]", error);
      }
    }
  }
  return sent;
}

export async function notifyCustomerOrderStatus(
  order: {
    id: string;
    orderNumber: string;
    status: string;
    userId: string | null;
    guestEmail: string | null;
    viewToken?: string | null;
  },
  options?: { body?: string },
) {
  if (!configureWebPush()) {
    return { sent: 0, skipped: "VAPID keys not configured" as const };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      OR: [
        ...(order.userId ? [{ userId: order.userId }] : []),
        { orderId: order.id },
        ...(order.guestEmail ? [{ guestEmail: order.guestEmail }] : []),
      ],
    },
  });

  if (subscriptions.length === 0) {
    return { sent: 0 };
  }

  const customerUrl = process.env.CUSTOMER_URL ?? "http://localhost:3000";
  const tracking =
    order.viewToken != null && order.viewToken !== ""
      ? `?t=${encodeURIComponent(order.viewToken)}`
      : "";
  const payload = JSON.stringify({
    title: `Pedido ${order.orderNumber}`,
    body:
      options?.body ??
      STATUS_LABELS[order.status] ??
      `Estado: ${order.status}`,
    url: `${customerUrl}/pedido/${order.id}${tracking}`,
  });

  const sent = await sendToSubscriptions(subscriptions, payload);
  return { sent };
}

export async function notifyStaffNewOrder(
  order: {
    branchId: string;
    id: string;
    orderNumber: string;
  },
  options?: { urgent?: boolean },
) {
  if (!configureWebPush()) {
    return { sent: 0, skipped: "VAPID keys not configured" as const };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { branchId: order.branchId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0 };
  }

  const branchUrl = process.env.BRANCH_URL ?? "http://localhost:3002";
  const urgent = options?.urgent === true;
  const payload = JSON.stringify({
    title: urgent ? "Pedido sin aceptar" : "Pedido nuevo",
    body: urgent
      ? `${order.orderNumber} sigue sin aceptar — toca para abrirlo`
      : `${order.orderNumber} — toca para abrirlo`,
    url: `${branchUrl}/`,
    orderId: order.id,
    urgent,
  });

  const sent = await sendToSubscriptions(subscriptions, payload);
  return { sent };
}

export async function notifyCustomerOrderItemsChanged(
  order: {
    id: string;
    orderNumber: string;
    total: number;
    userId: string | null;
    guestEmail: string | null;
    viewToken?: string | null;
  },
  change: {
    productName: string;
    unavailable: boolean;
    allCancelled?: boolean;
  },
) {
  if (!configureWebPush()) {
    return { sent: 0, skipped: "VAPID keys not configured" as const };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      OR: [
        ...(order.userId ? [{ userId: order.userId }] : []),
        { orderId: order.id },
        ...(order.guestEmail ? [{ guestEmail: order.guestEmail }] : []),
      ],
    },
  });

  if (subscriptions.length === 0) {
    return { sent: 0 };
  }

  const customerUrl = process.env.CUSTOMER_URL ?? "http://localhost:3000";
  const body = change.allCancelled
    ? `Todo el pedido se canceló: productos agotados. No se cobró.`
    : change.unavailable
      ? `${change.productName} agotado. Descuento aplicado. A cobrar: $${(order.total / 100).toFixed(2)}`
      : `${change.productName} restaurado. A cobrar: $${(order.total / 100).toFixed(2)}`;

  const tracking =
    order.viewToken != null && order.viewToken !== ""
      ? `?t=${encodeURIComponent(order.viewToken)}`
      : "";
  const payload = JSON.stringify({
    title: `Pedido ${order.orderNumber}`,
    body,
    url: `${customerUrl}/pedido/${order.id}${tracking}`,
  });

  const sent = await sendToSubscriptions(subscriptions, payload);
  return { sent };
}
