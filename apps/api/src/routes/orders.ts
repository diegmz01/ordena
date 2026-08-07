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
import { notifyBranchOrderUpdated } from "../utils/sse";
import {
  notifyCustomerOrderStatus,
  notifyCustomerOrderItemsChanged,
} from "../utils/web-push";
import { settleStripePayment, getStripe } from "../utils/stripe";
import { getBusinessDate } from "../utils/branch-day-number";
import { recordAdminAction } from "../utils/audit-log";
import { generatePickupCode } from "../utils/pickup-code";
import {
  branchOrderInclude,
  promoteDuePreparingOrders,
} from "../utils/promote-ready-orders";
import { escalateUnacceptedOrders } from "../utils/escalate-unaccepted-orders";

export const ordersRouter = Router();

const ACTIVE_BRANCH_STATUSES = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
] as const;

const HISTORY_BRANCH_STATUSES = ["COMPLETED", "CANCELLED"] as const;

export type MoneyItem = { unavailable: boolean; lineTotal: number };

/** Exportadas (no solo usadas acá) para poder testearlas directamente. */
export function itemsSubtotal(items: MoneyItem[]) {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

export function itemsDiscount(items: MoneyItem[]) {
  return items
    .filter((item) => item.unavailable)
    .reduce((sum, item) => sum + item.lineTotal, 0);
}

export function chargeableTotal(items: MoneyItem[]) {
  return itemsSubtotal(items) - itemsDiscount(items);
}

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
            status: { in: [...ACTIVE_BRANCH_STATUSES] },
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

      for (const order of orders) {
        if (order.status === "COMPLETED") {
          salesCount += 1;
          salesTotal += order.total;
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
          /** En este flujo, cancelar libera/reembolsa → igual a cancelaciones */
          refundCount: cancelledCount,
          refundTotal: cancelledTotal,
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

      if (status === "READY") {
        // El cobro (captura Stripe) ocurre al quedar listo para recoger,
        // no al entregar: aquí se retiene el hold, en COMPLETED ya no se toca Stripe.
        const amount = order.total;
        if (amount <= 0) {
          await settleStripePayment(
            order.stripePaymentIntentId,
            "CANCELLED",
          );
          const cancelled = await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "CANCELLED",
              discount: order.subtotal,
              total: 0,
            },
            include: branchOrderInclude,
          });

          await notifyBranchOrderUpdated(order.branchId, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: "CANCELLED",
          });

          try {
            await notifyCustomerOrderStatus(cancelled);
          } catch (pushError) {
            console.error("[orders.status] web-push", pushError);
          }

          return res.json({ data: cancelled });
        }

        await settleStripePayment(
          order.stripePaymentIntentId,
          "COMPLETED",
          amount,
        );
      } else if (status === "COMPLETED") {
        if (!order.pickupCode || pickupCode !== order.pickupCode) {
          throw new AppError(400, "Código de entrega incorrecto");
        }
      } else if (status === "CANCELLED") {
        await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === "READY" ? { pickupCode: generatePickupCode() } : {}),
          ...(status === "CANCELLED" ? { cancellationReason } : {}),
        },
        include: branchOrderInclude,
      });

      await notifyBranchOrderUpdated(order.branchId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
      });

      try {
        await notifyCustomerOrderStatus(
          updated,
          status === "READY" && updated.pickupCode
            ? { body: `Listo para recoger · Código: ${updated.pickupCode}` }
            : undefined,
        );
      } catch (pushError) {
        console.error("[orders.status] web-push", pushError);
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
        include: {
          ...branchOrderInclude,
          branch: {
            select: { id: true, name: true, address: true, phone: true },
          },
        },
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

      await settleStripePayment(order.stripePaymentIntentId, "CANCELLED");

      const cancelled = await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", cancellationReason },
        include: {
          ...branchOrderInclude,
          branch: {
            select: { id: true, name: true, address: true, phone: true },
          },
        },
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

      const order = await prisma.order.findUnique({
        where: { id: String(req.params.id) },
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

      const alreadyRefunded = await prisma.refundItem.findMany({
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

        const item = order.items.find((i) => i.id === requested.orderItemId);
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

      const [, updatedOrder] = await prisma.$transaction([
        prisma.refund.create({
          data: {
            orderId: order.id,
            amount,
            reason,
            stripeRefundId,
            actorId: req.authUser!.id,
            items: { create: refundItemsData },
          },
        }),
        prisma.order.update({
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
        }),
      ]);

      await recordAdminAction({
        actorId: req.authUser!.id,
        action: "order.refund",
        entityType: "Order",
        entityId: order.id,
        metadata: { amount, reason, items: refundItemsData, stripeRefundId },
      });

      try {
        await notifyCustomerOrderStatus(updatedOrder, {
          body: `Reembolso de ${(amount / 100).toFixed(2)} ${order.currency.toUpperCase()} · ${reason}`,
        });
      } catch (pushError) {
        console.error("[orders.refund] web-push", pushError);
      }

      res.json({ data: updatedOrder });
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

      const readyAt = new Date(Date.now() + prepMinutes * 60_000);
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PREPARING",
          ptvTicket,
          prepMinutes,
          readyAt,
        },
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
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PREPARING",
          prepMinutes,
          readyAt,
        },
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
      const total = chargeableTotal(nextItems);

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
