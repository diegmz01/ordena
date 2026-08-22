import { prisma } from "@ordena/database";
import { fetchStripeCardSummary, settleStripePayment } from "./stripe";
import { nextBranchDayNumber } from "./branch-day-number";
import { effectiveAvailability } from "./branch-availability";
import { findUnavailableCartLines } from "./validate-cart-stock";
import { notifyBranchNewOrder } from "./sse";
import { notifyStaffNewOrder } from "./web-push";
import { sendCancellationEmailIfPossible } from "./send-cancellation-email";
import { itemsDiscount, orderTotalWithFee } from "./order-money";

/** Snapshot guardado en PendingCheckout.itemsJson — misma forma que espera items.create. */
export type PendingItemSnapshot = {
  productId: string;
  productName: string;
  variantName?: string;
  secondaryProductId?: string;
  secondaryProductName?: string;
  plateLabel: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

const CLOSED_BRANCH_CANCEL_REASON =
  "Cancelado automáticamente: la sucursal cerró o se agotó el producto mientras se procesaba el pago.";

/**
 * Reclama un PendingCheckout (delete atómico, protege contra reentregas
 * duplicadas del webhook) y crea el Order real ya pagado.
 *
 * Antes de crear el pedido, revalida stock y disponibilidad de sucursal
 * "en caliente" — la sesión de Stripe vive hasta 30 min
 * (checkout.ts: expires_at), y sin esto un producto agotado o una sucursal
 * pausada/cerrada entre el inicio del checkout y la confirmación del pago
 * entraban igual como si nada:
 * - Productos que ya no están disponibles se marcan `unavailable` desde la
 *   creación (mismo mecanismo que cuando staff los marca agotados a mano),
 *   recalculando discount/total.
 * - Si la sucursal ya no acepta pedidos, el Order se crea directo en
 *   CANCELLED y se libera el hold en Stripe (nunca se capturó, con
 *   capture_method manual) — no se le muestra a staff un pedido "vivo" en
 *   una sucursal cerrada.
 *
 * Compartida entre el webhook (`stripe-webhook.ts`, camino normal) y el job
 * de reconciliación (`reconcile-pending-checkouts.ts`, cuando el webhook
 * nunca llegó) para no duplicar esta lógica en dos lugares.
 */
export async function createOrderFromPendingCheckout(params: {
  stripeSessionId: string;
  paymentIntentId: string | null;
}) {
  const pendingPreview = await prisma.pendingCheckout.findUnique({
    where: { stripeSessionId: params.stripeSessionId },
    select: { branchId: true, itemsJson: true },
  });
  if (!pendingPreview) return null; // ya convertido, o sesión desconocida

  const branch = await prisma.branch.findFirst({
    where: { id: pendingPreview.branchId, isActive: true },
  });
  const branchClosed = !branch || !effectiveAvailability(branch).acceptingOrders;

  let unavailableProductIds = new Set<string>();
  if (!branchClosed) {
    const previewItems =
      pendingPreview.itemsJson as unknown as PendingItemSnapshot[];
    const uniqueLines = [
      ...new Map(
        previewItems.map((i) => [
          i.productId,
          { productId: i.productId, productName: i.productName },
        ]),
      ).values(),
    ];
    const unavailable = await findUnavailableCartLines(
      pendingPreview.branchId,
      uniqueLines,
    );
    unavailableProductIds = new Set(unavailable.map((l) => l.productId));
  }

  const paidAt = new Date();
  const card = await fetchStripeCardSummary(params.paymentIntentId);

  let order = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      order = await prisma.$transaction(async (tx) => {
        const pc = await tx.pendingCheckout
          .delete({ where: { stripeSessionId: params.stripeSessionId } })
          .catch((err) => {
            const code =
              err && typeof err === "object" && "code" in err
                ? String((err as { code?: string }).code)
                : "";
            if (code === "P2025") return null;
            throw err;
          });
        if (!pc) return null;

        const dayMeta = await nextBranchDayNumber(tx, pc.branchId, paidAt);

        const itemsData = (
          pc.itemsJson as unknown as PendingItemSnapshot[]
        ).map((item) => ({
          ...item,
          unavailable: unavailableProductIds.has(item.productId),
        }));
        const discount = branchClosed
          ? pc.subtotal
          : itemsDiscount(itemsData);
        const total = branchClosed
          ? 0
          : orderTotalWithFee(itemsData, pc.serviceFee);

        return tx.order.create({
          data: {
            id: pc.id,
            orderNumber: pc.orderNumber,
            viewToken: pc.viewToken,
            idempotencyKey: pc.idempotencyKey,
            status: branchClosed ? "CANCELLED" : "PAID",
            ...(branchClosed
              ? { cancellationReason: CLOSED_BRANCH_CANCEL_REASON }
              : {}),
            branchId: pc.branchId,
            userId: pc.userId,
            guestName: pc.guestName,
            guestEmail: pc.guestEmail,
            guestPhone: pc.guestPhone,
            subtotal: pc.subtotal,
            discount,
            serviceFee: pc.serviceFee,
            total,
            notes: pc.notes,
            stripeSessionId: params.stripeSessionId,
            stripePaymentIntentId: params.paymentIntentId,
            paidAt,
            lastStaffAlertAt: paidAt,
            dayNumber: dayMeta.dayNumber,
            businessDate: dayMeta.businessDate,
            paymentBrand: card.paymentBrand,
            paymentFunding: card.paymentFunding,
            paymentLast4: card.paymentLast4,
            items: { create: itemsData },
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        });
      });
      break;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      // Choque en (branchId, businessDate, dayNumber): toda la tx hizo
      // rollback (incluido el delete), así que el PendingCheckout sigue
      // ahí y reintentar desde cero es seguro.
      if (code !== "P2002" || attempt === 4) throw err;
    }
  }

  if (!order) return null;

  if (branchClosed) {
    try {
      await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
    } catch (error) {
      console.error(
        "[create-order-from-pending-checkout] release hold",
        order.id,
        error,
      );
    }
    await sendCancellationEmailIfPossible(
      order,
      "create-order-from-pending-checkout",
    );
    return order;
  }

  try {
    await notifyBranchNewOrder(order.branchId, {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (sseError) {
    console.error("[create-order-from-pending-checkout] sse", sseError);
  }

  try {
    await notifyStaffNewOrder({
      branchId: order.branchId,
      id: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (pushError) {
    console.error("[create-order-from-pending-checkout] web-push", pushError);
  }

  return order;
}
