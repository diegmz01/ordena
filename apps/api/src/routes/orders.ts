import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "@ordena/database";
import {
  updateOrderStatusSchema,
  updateOrderItemAvailabilitySchema,
  assignPtvTicketSchema,
  startOrderPrepSchema,
  acceptOrderSchema,
  adminCancelOrderSchema,
  orderRefundSchema,
  isValidOrderStatusTransition,
  canAdminCancelOrder,
  canCustomerCancelOrder,
  CUSTOMER_CANCELLATION_REASON,
  PICKUP_CODE_MAX_ATTEMPTS,
  type OrderStatus,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireBranchStaff,
  type AuthenticatedRequest,
} from "../middleware/auth";
import {
  notifyBranchOrderUpdated,
  notifyBranchCustomerCancelledOrder,
} from "../utils/sse";
import {
  notifyCustomerOrderStatus,
  notifyCustomerOrderItemsChanged,
} from "../utils/web-push";
import {
  sendOrderConfirmationEmail,
  sendOrderRefundEmail,
} from "../lib/mailer";
import { sendCancellationEmailIfPossible } from "../utils/send-cancellation-email";
import { flagCaptureFailure } from "../utils/capture-failure-alert";
import { settleStripePayment, getStripe } from "../utils/stripe";
import { getBusinessDate } from "../utils/branch-day-number";
import { recordAdminAction } from "../utils/audit-log";
import { generatePickupCode } from "../utils/pickup-code";
import {
  type MoneyItem,
  itemsSubtotal,
  itemsDiscount,
  chargeableTotal,
  orderTotalWithFee,
} from "../utils/order-money";
import {
  branchOrderInclude,
  promoteDuePreparingOrders,
} from "../utils/promote-ready-orders";
import { escalateUnacceptedOrders } from "../utils/escalate-unaccepted-orders";
import {
  listedBranchProductWhere,
  unavailableModifierIdsForBranch,
  unavailableProductIdsForBranch,
} from "../utils/branch-menu-stock";

export const ordersRouter = Router();

const ACTIVE_BRANCH_STATUSES = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
] as const;

const HISTORY_BRANCH_STATUSES = ["COMPLETED", "CANCELLED"] as const;

/**
 * Include usado por endpoints que devuelven el pedido al detalle de admin
 * (`apps/admin/pedidos/[id]`), que reemplaza el `order` local vía
 * `setOrder(res.data)` — debe traer `refunds` siempre, o el cálculo de
 * `refundedQtyByItem` en el frontend truena con "refunds is not iterable".
 */
const adminOrderDetailInclude = {
  ...branchOrderInclude,
  branch: {
    select: { id: true, name: true, address: true, phone: true },
  },
  refunds: {
    orderBy: { createdAt: "desc" as const },
    include: { items: true },
  },
};

/** Reexportadas (usadas también fuera de este router, ej. al recrear un
 * Order en create-order-from-pending-checkout.ts, y por orders.money.test.ts)
 * — implementación real en utils/order-money.ts. */
export { type MoneyItem, itemsSubtotal, itemsDiscount, chargeableTotal, orderTotalWithFee };

function assertBranchAccess(
  user: NonNullable<AuthenticatedRequest["authUser"]>,
  orderBranchId: string,
) {
  if (user.role === "BRANCH_STAFF" && user.branchId !== orderBranchId) {
    throw new AppError(403, "Pedido de otra sucursal");
  }
}

function assertStatusTransition(from: OrderStatus, to: OrderStatus) {
  if (isValidOrderStatusTransition(from, to)) return;
  throw new AppError(
    400,
    `Transición inválida: no se puede pasar de ${from} a ${to}`,
  );
}

/**
 * Correo de confirmación: se envía cuando la sucursal acepta el pedido e
 * inicia su preparación (no antes, para no duplicar aviso si se cancela
 * entre el pago y la aceptación) — llamado desde /:id/accept y /:id/start-prep.
 */
async function sendOrderConfirmationEmailForOrder(order: {
  id: string;
  orderNumber: string;
  viewToken: string;
  branchId: string;
  total: number;
  currency: string;
  pickupCode: string | null;
  guestEmail: string | null;
  guestName: string | null;
  user: { email: string; name: string | null } | null;
  items: {
    productName: string;
    variantName: string | null;
    quantity: number;
    lineTotal: number;
  }[];
}) {
  const to = order.user?.email ?? order.guestEmail;
  if (!to) return;

  const branch = await prisma.branch.findUnique({
    where: { id: order.branchId },
    select: { name: true, address: true, phone: true },
  });
  if (!branch) return;

  await sendOrderConfirmationEmail({
    to,
    name: order.user?.name ?? order.guestName,
    orderId: order.id,
    orderNumber: order.orderNumber,
    viewToken: order.viewToken,
    branchName: branch.name,
    branchAddress: branch.address,
    branchPhone: branch.phone,
    pickupCode: order.pickupCode,
    items: order.items,
    total: order.total,
    currency: order.currency,
  });
}

ordersRouter.get(
  "/",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const orders = await prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          branch: { select: { id: true, name: true, address: true } },
          items: true,
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });
      res.json({ data: orders });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.get(
  "/mine",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.authUser!;
      if (user.role !== "CUSTOMER") {
        throw new AppError(403, "Solo clientes pueden ver su historial");
      }

      const orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          branch: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              productName: true,
              variantName: true,
              secondaryProductName: true,
              quantity: true,
              lineTotal: true,
              unavailable: true,
            },
          },
        },
      });

      res.json({ data: orders });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Cuántas líneas históricas de un mismo grupo (producto + combo + modificadores)
 * se consideran antes de intentar reconstruir cada una contra el catálogo
 * vigente; se piden más de 5 porque algunas pueden quedar descartadas por
 * estar agotadas/descatalogadas o tener modificadores que ya no existen.
 */
const SUGGESTION_CANDIDATE_LIMIT = 20;
const SUGGESTIONS_LIMIT = 5;

ordersRouter.get(
  "/suggestions",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.authUser!;
      if (user.role !== "CUSTOMER") {
        throw new AppError(403, "Solo clientes pueden ver sugerencias");
      }
      const branchId =
        typeof req.query.branchId === "string" && req.query.branchId
          ? req.query.branchId
          : undefined;

      const orders = await prisma.order.findMany({
        where: {
          userId: user.id,
          status: { not: "CANCELLED" },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          items: {
            select: {
              productId: true,
              secondaryProductId: true,
              variantName: true,
              quantity: true,
            },
          },
        },
      });

      // Agrupa por combinación exacta (producto + combo + modificadores) —
      // así "Taco de Pastor + extra queso" se sugiere aparte de "Taco de
      // Pastor" solo.
      const groups = new Map<
        string,
        {
          productId: string;
          secondaryProductId: string | null;
          variantName: string | null;
          timesOrdered: number;
        }
      >();
      for (const order of orders) {
        for (const item of order.items) {
          const key = `${item.productId}::${item.secondaryProductId ?? ""}::${item.variantName ?? ""}`;
          const existing = groups.get(key);
          if (existing) {
            existing.timesOrdered += item.quantity;
          } else {
            groups.set(key, {
              productId: item.productId,
              secondaryProductId: item.secondaryProductId,
              variantName: item.variantName,
              timesOrdered: item.quantity,
            });
          }
        }
      }

      const ranked = [...groups.values()]
        .sort((a, b) => b.timesOrdered - a.timesOrdered)
        .slice(0, SUGGESTION_CANDIDATE_LIMIT);

      const [outProducts, outMods] = branchId
        ? await Promise.all([
            unavailableProductIdsForBranch(branchId),
            unavailableModifierIdsForBranch(branchId),
          ])
        : [new Set<string>(), new Set<string>()];

      const suggestions: {
        productId: string;
        name: string;
        imageUrl: string | null;
        unitPrice: number;
        modifierIds: string[];
        modifierLabels: string[];
        secondaryProductId: string | null;
        secondaryName: string | null;
        timesOrdered: number;
      }[] = [];

      for (const group of ranked) {
        if (suggestions.length >= SUGGESTIONS_LIMIT) break;

        const product = await prisma.product.findFirst({
          where: {
            id: group.productId,
            isActive: true,
            ...(branchId
              ? { branches: { some: listedBranchProductWhere(branchId) } }
              : {}),
          },
          include: { modifiers: { include: { modifier: true } } },
        });
        if (!product || (branchId && outProducts.has(product.id))) continue;

        let secondaryProduct: { id: string; name: string; basePrice: number } | null =
          null;
        if (group.secondaryProductId) {
          if (!product.allowCombo) continue;
          secondaryProduct = await prisma.product.findFirst({
            where: {
              id: group.secondaryProductId,
              isActive: true,
              allowCombo: true,
              ...(branchId
                ? { branches: { some: listedBranchProductWhere(branchId) } }
                : {}),
            },
            select: { id: true, name: true, basePrice: true },
          });
          if (!secondaryProduct || (branchId && outProducts.has(secondaryProduct.id)))
            continue;
        }

        const activeMods = product.modifiers
          .map((pm) => pm.modifier)
          .filter((m) => m.isActive && !(branchId && outMods.has(m.id)));

        const historicLabels = group.variantName
          ? group.variantName
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const matchedMods = activeMods.filter((m) =>
          historicLabels.includes(m.name),
        );

        // Si algún modificador de la línea original ya no existe, cambió de
        // nombre o está agotado, no reconstruimos "a medias": se omite para
        // no sugerir una combinación distinta a la que el cliente pidió.
        if (matchedMods.length !== historicLabels.length) continue;

        const basePrice = secondaryProduct
          ? Math.max(product.basePrice, secondaryProduct.basePrice)
          : product.basePrice;
        const unitPrice =
          basePrice + matchedMods.reduce((sum, m) => sum + m.priceDelta, 0);

        suggestions.push({
          productId: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          unitPrice,
          modifierIds: matchedMods.map((m) => m.id),
          modifierLabels: matchedMods.map((m) => m.name),
          secondaryProductId: secondaryProduct?.id ?? null,
          secondaryName: secondaryProduct?.name ?? null,
          timesOrdered: group.timesOrdered,
        });
      }

      res.json({ data: suggestions });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.get(
  "/branch",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.authUser!;
      const branchId =
        user.role === "ADMIN"
          ? (typeof req.query.branchId === "string"
              ? req.query.branchId
              : user.branchId)
          : user.branchId;

      if (!branchId) {
        throw new AppError(400, "Sucursal no asignada");
      }

      await promoteDuePreparingOrders(branchId);
      await escalateUnacceptedOrders(branchId);

      const [orders, branch] = await Promise.all([
        prisma.order.findMany({
          where: {
            branchId,
            OR: [
              { status: { in: [...ACTIVE_BRANCH_STATUSES] } },
              // Cancelado por el cliente y aún no reconocido por staff:
              // sigue en "pedidos en vivo" hasta que marquen "Entendido".
              {
                status: "CANCELLED",
                cancelledByCustomer: true,
                customerCancelAckedAt: null,
              },
            ],
          },
          orderBy: { createdAt: "desc" },
          include: branchOrderInclude,
        }),
        prisma.branch.findUnique({
          where: { id: branchId },
          select: { prepTimeMinutes: true },
        }),
      ]);

      res.json({
        data: orders,
        branchId,
        prepTimeMinutes: branch?.prepTimeMinutes ?? 20,
      });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.get(
  "/branch/history",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.authUser!;
      const branchId =
        user.role === "ADMIN"
          ? typeof req.query.branchId === "string"
            ? req.query.branchId
            : user.branchId
          : user.branchId;

      if (!branchId) {
        throw new AppError(400, "Sucursal no asignada");
      }

      const businessDate = getBusinessDate();

      const [orders, receivedCount] = await Promise.all([
        prisma.order.findMany({
          where: {
            branchId,
            businessDate,
            status: { in: [...HISTORY_BRANCH_STATUSES] },
          },
          orderBy: { updatedAt: "desc" },
          include: branchOrderInclude,
        }),
        // Recibidos hoy = cualquier estado, incluye los que aún siguen
        // activos (PAID/ACCEPTED/PREPARING/READY) al momento de consultar.
        // businessDate solo se asigna al quedar PAID, así que ya excluye
        // intentos de checkout que nunca se pagaron. Se excluyen los
        // cancelados ANTES de aceptar (nunca tuvieron ptvTicket ni
        // prepMinutes, que solo se asignan en /accept o /start-prep): esos
        // nunca llegaron a cocina y solo liberaron la autorización de
        // Stripe, no representan un pedido realmente atendido.
        prisma.order.count({
          where: {
            branchId,
            businessDate,
            NOT: { status: "CANCELLED", ptvTicket: null, prepMinutes: null },
          },
        }),
      ]);

      let salesTotal = 0;
      let salesCount = 0;
      let cancelledCount = 0;
      let cancelledTotal = 0;
      let refundCount = 0;
      let refundTotal = 0;

      for (const order of orders) {
        if (order.status === "COMPLETED") {
          salesCount += 1;
          salesTotal += order.total;
          // Devoluciones = solo pedidos entregados con algo no cobrado del
          // todo: artículos agotados (discount) o reembolsos parciales de
          // Stripe ya hechos (refundedTotal). Un cancelado no es una
          // devolución (ver /branch/history arriba: pre-aceptar nunca se
          // cobró, post-aceptar es un caso distinto no rastreado aquí).
          const orderRefunded = order.discount + order.refundedTotal;
          if (orderRefunded > 0) {
            refundCount += 1;
            refundTotal += orderRefunded;
          }
        } else if (order.status === "CANCELLED") {
          cancelledCount += 1;
          cancelledTotal += order.total;
        }
      }

      res.json({
        data: orders,
        branchId,
        businessDate: businessDate.toISOString().slice(0, 10),
        summary: {
          receivedCount,
          salesCount,
          salesTotal,
          cancelledCount,
          cancelledTotal,
          refundCount,
          refundTotal,
          currency: "mxn",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.get(
  "/:id",
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
        include: {
          items: true,
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              slug: true,
              latitude: true,
              longitude: true,
            },
          },
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          refunds: {
            orderBy: { createdAt: "desc" },
            include: { items: true },
          },
        },
      });
      if (!order) {
        // El pago puede estar recién autorizado y el webhook de Stripe
        // todavía no convirtió el PendingCheckout en un Order real — el
        // cliente ya fue redirigido acá (return_url) así que en vez de un
        // 404 devolvemos "pending" para que la página siga esperando/
        // sondeando en vez de mostrar un error.
        const pending = await prisma.pendingCheckout.findUnique({
          where: { id: String(req.params.id) },
        });
        const pendingViewToken =
          typeof req.query.t === "string" ? req.query.t.trim() : "";
        if (
          pending &&
          pendingViewToken &&
          pendingViewToken === pending.viewToken
        ) {
          return res.json({ data: null, pending: true });
        }
        throw new AppError(404, "Pedido no encontrado");
      }

      const user = req.authUser;
      const viewToken =
        typeof req.query.t === "string" ? req.query.t.trim() : "";
      const isStaff =
        user?.role === "ADMIN" ||
        (user?.role === "BRANCH_STAFF" && user.branchId === order.branchId);
      const isOwner = Boolean(user && order.userId && user.id === order.userId);
      const hasViewToken = Boolean(
        viewToken && viewToken === order.viewToken,
      );

      if (!isStaff && !isOwner && !hasViewToken) {
        throw new AppError(404, "Pedido no encontrado");
      }

      if (isStaff || isOwner) {
        const { viewToken: _vt, ...safe } = order;
        return res.json({ data: safe });
      }

      // Tracking con viewToken: sin PII de contacto ni IDs de Stripe;
      // sí se muestra marca/últimos 4 (como en el comprobante del cliente).
      const {
        viewToken: _vt,
        guestEmail,
        guestPhone,
        user: _user,
        stripeSessionId: _session,
        stripePaymentIntentId: _pi,
        ...publicOrder
      } = order;
      return res.json({
        data: {
          ...publicOrder,
          guestEmail: null,
          guestPhone: null,
          user: null,
          stripeSessionId: null,
          stripePaymentIntentId: null,
          refunds: publicOrder.refunds.map(
            ({ stripeRefundId: _srid, actorId: _aid, ...safeRefund }) =>
              safeRefund,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Cliente: cancela su propio pedido, solo mientras la sucursal no lo haya
 * aceptado (PAID). Libera/reembolsa el hold en Stripe y avisa a la sucursal
 * por SSE para que no proceda con el pedido (mismo mecanismo que admin-cancel
 * / la cancelación de staff, que ya hace desaparecer el pedido de la cola).
 */
ordersRouter.post(
  "/:id/cancel",
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      const user = req.authUser;
      const viewToken =
        typeof req.query.t === "string" ? req.query.t.trim() : "";
      const isOwner = Boolean(
        user && order.userId && user.id === order.userId,
      );
      const hasViewToken = Boolean(
        viewToken && viewToken === order.viewToken,
      );

      if (!isOwner && !hasViewToken) {
        throw new AppError(404, "Pedido no encontrado");
      }

      const currentStatus = order.status as OrderStatus;

      // Idempotente: si ya está cancelado (doble click / retry), no falla.
      if (currentStatus === "CANCELLED") {
        return res.json({ data: { id: order.id, status: order.status } });
      }

      if (!canCustomerCancelOrder(currentStatus)) {
        throw new AppError(
          400,
          "Ya no se puede cancelar: la sucursal ya está preparando tu pedido",
        );
      }

      // Guarda optimista: reclama la cancelación antes de tocar Stripe para
      // no pisar una aceptación concurrente de staff (ver /:id/accept).
      const guard = await prisma.order.updateMany({
        where: { id: order.id, status: currentStatus },
        data: {
          status: "CANCELLED",
          cancellationReason: CUSTOMER_CANCELLATION_REASON,
          cancelledByCustomer: true,
        },
      });
      if (guard.count === 0) {
        throw new AppError(
          409,
          "El pedido cambió de estado, actualiza la página e intenta de nuevo",
        );
      }

      try {
        await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
      } catch (error) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: currentStatus,
            cancellationReason: order.cancellationReason,
            cancelledByCustomer: order.cancelledByCustomer,
          },
        });
        throw error;
      }

      await notifyBranchCustomerCancelledOrder(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      await sendCancellationEmailIfPossible(
        {
          orderNumber: order.orderNumber,
          cancellationReason: CUSTOMER_CANCELLATION_REASON,
          total: order.total,
          currency: order.currency,
          guestEmail: order.guestEmail,
          guestName: order.guestName,
          user: isOwner && user ? { email: user.email, name: user.name ?? null } : null,
        },
        "orders.cancel",
      );

      res.json({ data: { id: order.id, status: "CANCELLED" } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Staff: reconoce ("Entendido") una cancelación hecha por el cliente. Recién
 * ahí el pedido deja de aparecer en "pedidos en vivo" (GET /orders/branch).
 */
ordersRouter.post(
  "/:id/ack-customer-cancel",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.authUser!;
      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      if (order.status !== "CANCELLED" || !order.cancelledByCustomer) {
        throw new AppError(
          400,
          "Este pedido no es una cancelación de cliente pendiente",
        );
      }

      const acked =
        order.customerCancelAckedAt != null
          ? order
          : await prisma.order.update({
              where: { id: order.id },
              data: { customerCancelAckedAt: new Date() },
            });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "CANCELLED",
      });

      res.json({ data: { id: acked.id, customerCancelAckedAt: acked.customerCancelAckedAt } });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.patch(
  "/:id/status",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { status, pickupCode, cancellationReason } =
        updateOrderStatusSchema.parse(req.body);
      const user = req.authUser!;

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
        include: { items: true },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      const currentStatus = order.status as OrderStatus;

      // Idempotente: evita doble captura/cancelación Stripe en retries.
      if (currentStatus === status) {
        const current = await prisma.order.findUnique({
          where: { id: order.id },
          include: branchOrderInclude,
        });
        return res.json({ data: current });
      }

      assertStatusTransition(currentStatus, status);

      if (status === "COMPLETED") {
        if (!order.pickupCode || pickupCode !== order.pickupCode) {
          if (order.pickupAttempts >= PICKUP_CODE_MAX_ATTEMPTS) {
            throw new AppError(
              429,
              "Demasiados intentos con código incorrecto — pide a un admin que verifique el pedido desde el backoffice.",
            );
          }
          await prisma.order.update({
            where: { id: order.id },
            data: { pickupAttempts: { increment: 1 } },
          });
          throw new AppError(400, "Código de entrega incorrecto");
        }
      }

      // READY con total <= 0 (todo agotado antes de aceptar): en realidad
      // se cancela, no se pasa a READY.
      const zeroTotalCancel = status === "READY" && order.total <= 0;
      const finalStatus: OrderStatus = zeroTotalCancel ? "CANCELLED" : status;

      const data: Record<string, unknown> = { status: finalStatus };
      if (finalStatus === "ACCEPTED") data.acceptedAt = new Date();
      if (zeroTotalCancel) {
        data.discount = order.subtotal;
        data.total = 0;
        data.cancellationReason =
          "Cancelado automáticamente: todos los productos del pedido se agotaron antes de que la sucursal lo aceptara.";
      } else if (finalStatus === "READY") {
        data.pickupCode = generatePickupCode();
        data.readyReachedAt = new Date();
      } else if (finalStatus === "COMPLETED") {
        data.completedAt = new Date();
      } else if (finalStatus === "CANCELLED") {
        data.cancellationReason = cancellationReason;
      }

      // Guarda optimista: reclama la transición antes de tocar Stripe para
      // no pisar una actualización concurrente (ej. cliente cancela justo
      // cuando staff marca "Listo").
      const guard = await prisma.order.updateMany({
        where: { id: order.id, status: currentStatus },
        data,
      });
      if (guard.count === 0) {
        throw new AppError(
          409,
          "El pedido cambió de estado, actualiza la página e intenta de nuevo",
        );
      }

      const revert = () =>
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: currentStatus,
            pickupCode: order.pickupCode,
            readyReachedAt: order.readyReachedAt,
            discount: order.discount,
            total: order.total,
            cancellationReason: order.cancellationReason,
            completedAt: order.completedAt,
            acceptedAt: order.acceptedAt,
          },
        });

      // El cobro (captura Stripe) ocurre al quedar listo para recoger, no
      // al entregar: aquí se retiene el hold, en COMPLETED ya no se toca
      // Stripe.
      if (finalStatus === "CANCELLED") {
        try {
          await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
        } catch (error) {
          await revert();
          throw error;
        }
      } else if (finalStatus === "READY") {
        try {
          await settleStripePayment(
            order.stripePaymentIntentId,
            "COMPLETED",
            order.total,
          );
        } catch (error) {
          await revert();
          // A diferencia del job automático, este fallo lo ve staff al
          // instante (502 acá abajo) — pero igual avisamos a admin por
          // correo, porque staff puede no saber qué hacer con el error.
          await flagCaptureFailure(order, error);
          throw error;
        }
      }

      const updated = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: finalStatus,
      });

      try {
        await notifyCustomerOrderStatus(
          updated,
          finalStatus === "READY" && updated.pickupCode
            ? { body: `Listo para recoger · Código: ${updated.pickupCode}` }
            : undefined,
        );
      } catch (pushError) {
        console.error("[orders.status] web-push", pushError);
      }

      if (finalStatus === "CANCELLED") {
        await sendCancellationEmailIfPossible(updated, "orders.status");
      }

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

/** Admin: cancelar en cualquier etapa activa/cobrada y liberar o reembolsar Stripe. */
ordersRouter.post(
  "/:id/admin-cancel",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { cancellationReason } = adminCancelOrderSchema.parse(req.body);

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
        include: adminOrderDetailInclude,
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      const currentStatus = order.status as OrderStatus;

      if (currentStatus === "CANCELLED") {
        return res.json({ data: order });
      }

      if (!canAdminCancelOrder(currentStatus)) {
        throw new AppError(
          400,
          `No se puede cancelar un pedido en estado ${currentStatus}`,
        );
      }

      // Guarda optimista: reclama la cancelación antes de tocar Stripe para
      // no pisar una transición concurrente (ej. el pedido justo pasó a
      // READY, o el cliente lo canceló él mismo un instante antes).
      const guard = await prisma.order.updateMany({
        where: { id: order.id, status: currentStatus },
        data: { status: "CANCELLED", cancellationReason },
      });
      if (guard.count === 0) {
        throw new AppError(
          409,
          "El pedido cambió de estado, actualiza la página e intenta de nuevo",
        );
      }

      try {
        await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
      } catch (error) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: currentStatus,
            cancellationReason: order.cancellationReason,
          },
        });
        throw error;
      }

      const cancelled = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: adminOrderDetailInclude,
      });

      await recordAdminAction({
        actorId: req.authUser!.id,
        action: "order.admin_cancel",
        entityType: "Order",
        entityId: order.id,
        metadata: {
          from: currentStatus,
          orderNumber: order.orderNumber,
          cancellationReason,
        },
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "CANCELLED",
      });

      try {
        await notifyCustomerOrderStatus(cancelled);
      } catch (pushError) {
        console.error("[orders.admin-cancel] web-push", pushError);
      }

      await sendCancellationEmailIfPossible(cancelled, "orders.admin-cancel");

      res.json({ data: cancelled });
    } catch (error) {
      next(error);
    }
  },
);

const REFUNDABLE_STATUSES: OrderStatus[] = ["READY", "COMPLETED"];

/**
 * Admin: reembolso parcial de uno o varios productos de un pedido ya cobrado
 * (READY o COMPLETED), sin cancelarlo. Para cancelar y devolver el total
 * completo, usar `POST /orders/:id/admin-cancel`.
 */
ordersRouter.post(
  "/:id/refund",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { reason, items } = orderRefundSchema.parse(req.body);
      const orderId = String(req.params.id);

      // Todo el bloque (validar cantidades restantes, llamar Stripe,
      // persistir) corre bajo un advisory lock de Postgres por pedido, para
      // que dos reembolsos parciales concurrentes sobre el mismo pedido
      // (doble clic, dos pestañas/admins) no lean el mismo "restante" antes
      // de que el primero se persista y terminen sumando más de lo que
      // existía. `_xact_lock` libera el lock solo al terminar la tx.
      const { updated, amount, stripeRefundId, refundItemsData } =
        await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;

            const order = await tx.order.findUnique({
              where: { id: orderId },
              include: { items: true },
            });
            if (!order) {
              throw new AppError(404, "Pedido no encontrado");
            }

            const currentStatus = order.status as OrderStatus;
            if (!REFUNDABLE_STATUSES.includes(currentStatus)) {
              throw new AppError(
                400,
                `Solo se puede reembolsar un pedido cobrado (listo o entregado); estado actual: ${currentStatus}`,
              );
            }
            if (!order.stripePaymentIntentId) {
              throw new AppError(
                400,
                "El pedido no tiene un pago registrado en Stripe",
              );
            }

            const alreadyRefunded = await tx.refundItem.findMany({
              where: { orderItem: { orderId: order.id } },
            });
            const refundedQtyByItem = new Map<string, number>();
            for (const ri of alreadyRefunded) {
              refundedQtyByItem.set(
                ri.orderItemId,
                (refundedQtyByItem.get(ri.orderItemId) ?? 0) + ri.quantity,
              );
            }

            const seen = new Set<string>();
            let amount = 0;
            const refundItemsData: {
              orderItemId: string;
              quantity: number;
              amount: number;
            }[] = [];

            for (const requested of items) {
              if (seen.has(requested.orderItemId)) {
                throw new AppError(
                  400,
                  "Producto repetido en la solicitud de devolución",
                );
              }
              seen.add(requested.orderItemId);

              const item = order.items.find(
                (i) => i.id === requested.orderItemId,
              );
              if (!item) {
                throw new AppError(400, "Artículo no encontrado en el pedido");
              }
              if (item.unavailable) {
                throw new AppError(
                  400,
                  `${item.productName} ya fue descontado por agotado, no se puede reembolsar`,
                );
              }

              const alreadyQty = refundedQtyByItem.get(item.id) ?? 0;
              const remainingQty = item.quantity - alreadyQty;
              if (requested.quantity > remainingQty) {
                throw new AppError(
                  400,
                  `Solo quedan ${remainingQty} de "${item.productName}" por devolver`,
                );
              }

              const unitAmount = Math.round(item.lineTotal / item.quantity);
              const itemAmount = unitAmount * requested.quantity;
              amount += itemAmount;
              refundItemsData.push({
                orderItemId: item.id,
                quantity: requested.quantity,
                amount: itemAmount,
              });
            }

            if (amount <= 0) {
              throw new AppError(400, "El monto a devolver debe ser mayor a 0");
            }

            const maxRefundable = order.total - order.refundedTotal;
            if (amount > maxRefundable) {
              throw new AppError(
                400,
                "El monto a devolver excede lo disponible en este pedido",
              );
            }

            let stripeRefundId: string | null = null;
            try {
              const stripeRefund = await getStripe().refunds.create({
                payment_intent: order.stripePaymentIntentId,
                amount,
                metadata: {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  reason,
                },
              });
              stripeRefundId = stripeRefund.id;
            } catch (error) {
              if (error instanceof Stripe.errors.StripeError) {
                throw new AppError(502, `Error de Stripe: ${error.message}`);
              }
              throw error;
            }

            await tx.refund.create({
              data: {
                orderId: order.id,
                amount,
                reason,
                stripeRefundId,
                actorId: req.authUser!.id,
                items: { create: refundItemsData },
              },
            });

            const updated = await tx.order.update({
              where: { id: order.id },
              data: { refundedTotal: { increment: amount } },
              include: {
                items: true,
                branch: {
                  select: { id: true, name: true, address: true, phone: true },
                },
                user: {
                  select: { id: true, name: true, email: true, phone: true },
                },
                refunds: {
                  orderBy: { createdAt: "desc" },
                  include: { items: true },
                },
              },
            });

            return { updated, amount, stripeRefundId, refundItemsData };
          },
          // Holgura extra: la llamada a Stripe ocurre dentro de la tx (para
          // que el lock cubra todo el ciclo validar→cobrar→persistir).
          { timeout: 20_000, maxWait: 10_000 },
        );

      await recordAdminAction({
        actorId: req.authUser!.id,
        action: "order.refund",
        entityType: "Order",
        entityId: updated.id,
        metadata: { amount, reason, items: refundItemsData, stripeRefundId },
      });

      try {
        await notifyCustomerOrderStatus(updated, {
          body: `Reembolso de ${(amount / 100).toFixed(2)} ${updated.currency.toUpperCase()} · ${reason}`,
        });
      } catch (pushError) {
        console.error("[orders.refund] web-push", pushError);
      }

      try {
        const to = updated.user?.email ?? updated.guestEmail;
        if (to) {
          await sendOrderRefundEmail({
            to,
            name: updated.user?.name ?? updated.guestName,
            orderNumber: updated.orderNumber,
            reason,
            amount,
            isFullRefund: updated.refundedTotal >= updated.total,
            currency: updated.currency,
          });
        }
      } catch (mailError) {
        console.error("[orders.refund] mailer", mailError);
      }

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Aceptar pedido nuevo: exige ticket PTV + minutos de prep.
 * Pasa de PAID → PREPARING en un solo paso (ACCEPTED es transitorio).
 */
ordersRouter.patch(
  "/:id/accept",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { ptvTicket, prepMinutes } = acceptOrderSchema.parse(req.body);
      const user = req.authUser!;

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      if (order.status !== "PAID") {
        throw new AppError(400, "Solo se pueden aceptar pedidos nuevos");
      }

      const now = new Date();
      const readyAt = new Date(now.getTime() + prepMinutes * 60_000);

      // Guarda optimista: no toca Stripe, pero sin esto un accept concurrente
      // con /:id/cancel podría sobrescribir una cancelación (y su reembolso)
      // dejando el pedido en PREPARING como si nada.
      const guard = await prisma.order.updateMany({
        where: { id: order.id, status: "PAID" },
        data: {
          status: "PREPARING",
          ptvTicket,
          prepMinutes,
          readyAt,
          acceptedAt: now,
          preparingAt: now,
        },
      });
      if (guard.count === 0) {
        throw new AppError(
          409,
          "El pedido cambió de estado, actualiza la página e intenta de nuevo",
        );
      }

      const updated = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "PREPARING",
      });

      try {
        await notifyCustomerOrderStatus(updated, {
          body: "Pedido aceptado · En preparación",
        });
        const unavailableProductNames = updated.items
          .filter((i) => i.unavailable)
          .map((i) => i.productName);
        if (unavailableProductNames.length > 0) {
          await notifyCustomerOrderItemsChanged(updated, {
            unavailableProductNames,
          });
        }
      } catch (pushError) {
        console.error("[orders.accept] web-push", pushError);
      }

      try {
        await sendOrderConfirmationEmailForOrder(updated);
      } catch (mailError) {
        console.error("[orders.accept] mailer", mailError);
      }

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.patch(
  "/:id/start-prep",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { prepMinutes } = startOrderPrepSchema.parse(req.body);
      const user = req.authUser!;

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      if (order.status !== "ACCEPTED") {
        throw new AppError(
          400,
          "Solo se puede iniciar preparación en pedidos aceptados",
        );
      }
      if (order.ptvTicket == null) {
        throw new AppError(
          400,
          "Asigna el número de ticket PTV antes de iniciar preparación",
        );
      }

      const readyAt = new Date(Date.now() + prepMinutes * 60_000);

      // Guarda optimista contra un admin-cancel concurrente sobre el mismo
      // pedido ACCEPTED.
      const guard = await prisma.order.updateMany({
        where: { id: order.id, status: "ACCEPTED" },
        data: {
          status: "PREPARING",
          prepMinutes,
          readyAt,
          preparingAt: new Date(),
        },
      });
      if (guard.count === 0) {
        throw new AppError(
          409,
          "El pedido cambió de estado, actualiza la página e intenta de nuevo",
        );
      }

      const updated = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "PREPARING",
      });

      try {
        await notifyCustomerOrderStatus(updated);
        const unavailableProductNames = updated.items
          .filter((i) => i.unavailable)
          .map((i) => i.productName);
        if (unavailableProductNames.length > 0) {
          await notifyCustomerOrderItemsChanged(updated, {
            unavailableProductNames,
          });
        }
      } catch (pushError) {
        console.error("[orders.start-prep] web-push", pushError);
      }

      try {
        await sendOrderConfirmationEmailForOrder(updated);
      } catch (mailError) {
        console.error("[orders.start-prep] mailer", mailError);
      }

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.patch(
  "/:id/items/:itemId",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { unavailable } = updateOrderItemAvailabilitySchema.parse(req.body);
      const user = req.authUser!;
      const orderId = String(req.params.id);
      const itemId = String(req.params.itemId);

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      // Solo antes de aceptar: verificar disponibilidad en PAID
      if (order.status !== "PAID") {
        throw new AppError(
          400,
          "Solo se pueden marcar agotados antes de aceptar el pedido",
        );
      }

      const item = order.items.find((i) => i.id === itemId);
      if (!item) {
        throw new AppError(404, "Artículo no encontrado en el pedido");
      }

      const nextItems = order.items.map((i) =>
        i.id === itemId ? { ...i, unavailable } : i,
      );
      const subtotal = itemsSubtotal(nextItems);
      const discount = itemsDiscount(nextItems);
      const total = orderTotalWithFee(nextItems, order.serviceFee);

      // Nunca se cancela automáticamente: aunque el total quede en $0 porque
      // todos los productos están agotados, el pedido sigue en PAID y es el
      // staff quien decide (y confirma con motivo) si lo cancela vía
      // PATCH /orders/:id/status. Tampoco se notifica al cliente aquí — eso
      // se hace de forma consolidada al aceptar el pedido (ver /accept y
      // /start-prep), no en cada toggle mientras el staff sigue revisando.
      await prisma.orderItem.update({
        where: { id: itemId },
        data: { unavailable },
      });

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { subtotal, discount, total },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

ordersRouter.patch(
  "/:id/ptv-ticket",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { ptvTicket } = assignPtvTicketSchema.parse(req.body);
      const user = req.authUser!;

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!order) {
        throw new AppError(404, "Pedido no encontrado");
      }

      assertBranchAccess(user, order.branchId);

      // Admin no asigna el ticket inicial: eso lo hace staff en sucursal.
      // Solo puede editarlo si ya existe, o en pedidos COMPLETED.
      if (
        user.role === "ADMIN" &&
        order.ptvTicket == null &&
        order.status !== "COMPLETED"
      ) {
        throw new AppError(
          403,
          "El ticket PTV lo asigna el staff de la sucursal",
        );
      }

      if (order.status === "ACCEPTED" && ptvTicket == null) {
        throw new AppError(400, "El número de ticket PTV es obligatorio");
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { ptvTicket },
        include: adminOrderDetailInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);
