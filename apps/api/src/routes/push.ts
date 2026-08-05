import { Router } from "express";
import { prisma } from "@ordena/database";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@ordena/shared";
import {
  optionalAuth,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { AppError } from "../middleware/error-handler";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return res.status(503).json({ error: "VAPID public key not configured" });
  }
  return res.json({ publicKey: key });
});

pushRouter.post(
  "/subscribe",
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = pushSubscribeSchema.parse(req.body);
      const user = req.authUser;

      let orderId: string | null = null;
      let userId: string | null = user?.id ?? null;
      let guestEmail: string | null = null;
      let branchId: string | null = null;

      const isStaff =
        user?.role === "BRANCH_STAFF" || user?.role === "ADMIN";
      const wantsStaffBranch =
        body.staffBranch === true ||
        (isStaff && !body.orderId && Boolean(user?.branchId));

      if (wantsStaffBranch) {
        if (!user) {
          throw new AppError(401, "Sesión de sucursal requerida");
        }
        if (!isStaff) {
          throw new AppError(403, "Solo staff puede suscribir la sucursal");
        }
        if (!user.branchId) {
          throw new AppError(
            400,
            "Tu cuenta no está vinculada a una sucursal",
          );
        }
        branchId = user.branchId;
        userId = user.id;
        orderId = null;
        guestEmail = null;
      } else if (body.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: body.orderId },
          select: {
            id: true,
            userId: true,
            guestEmail: true,
            viewToken: true,
          },
        });
        if (!order) {
          throw new AppError(404, "Pedido no encontrado");
        }

        const isOwner = Boolean(
          user && order.userId && user.id === order.userId,
        );
        const hasViewToken = Boolean(
          body.viewToken && body.viewToken === order.viewToken,
        );

        if (!isOwner && !hasViewToken) {
          throw new AppError(403, "No autorizado para suscribir este pedido");
        }

        orderId = order.id;
        guestEmail = order.guestEmail?.toLowerCase() ?? null;
        if (!userId && order.userId) {
          userId = order.userId;
        }
      } else if (!user) {
        throw new AppError(
          401,
          "Sesión o pedido requerido para suscribir notificaciones",
        );
      }

      await prisma.pushSubscription.upsert({
        where: { endpoint: body.endpoint },
        update: {
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userId,
          branchId,
          orderId,
          guestEmail,
          userAgent: req.headers["user-agent"]?.slice(0, 500),
        },
        create: {
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userId,
          branchId,
          orderId,
          guestEmail,
          userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        },
      });

      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

pushRouter.delete(
  "/subscribe",
  optionalAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = pushUnsubscribeSchema.parse(req.body);
      const user = req.authUser;

      const subscription = await prisma.pushSubscription.findUnique({
        where: { endpoint: body.endpoint },
      });

      // Idempotente: si ya no existe, no hay nada que autorizar ni borrar.
      if (!subscription) {
        res.json({ ok: true });
        return;
      }

      const isOwner = Boolean(
        subscription.userId && user && user.id === subscription.userId,
      );
      const isBranchStaff = Boolean(
        subscription.branchId &&
          user &&
          (user.role === "ADMIN" ||
            (user.role === "BRANCH_STAFF" &&
              user.branchId === subscription.branchId)),
      );

      // orderId no tiene relación Prisma (columna suelta): resolver aparte.
      let isOrderOwner = false;
      if (subscription.orderId && !isOwner && !isBranchStaff) {
        const order = await prisma.order.findUnique({
          where: { id: subscription.orderId },
          select: { userId: true, viewToken: true },
        });
        isOrderOwner = Boolean(
          order &&
            ((user && order.userId && user.id === order.userId) ||
              (body.viewToken && body.viewToken === order.viewToken)),
        );
      }

      if (!isOwner && !isBranchStaff && !isOrderOwner) {
        throw new AppError(
          403,
          "No autorizado para eliminar esta suscripción",
        );
      }

      await prisma.pushSubscription.delete({
        where: { endpoint: body.endpoint },
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);
