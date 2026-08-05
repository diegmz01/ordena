import { Router } from "express";
import { prisma } from "@ordena/database";
import { authenticate, requireAdmin } from "../middleware/auth";

export const customersRouter = Router();

customersRouter.get(
  "/admin",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const customers = await prisma.user.findMany({
        where: { role: "CUSTOMER" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          _count: { select: { orders: true } },
          orders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              orderNumber: true,
              status: true,
              createdAt: true,
              total: true,
            },
          },
        },
      });

      res.json({
        data: customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          createdAt: c.createdAt,
          ordersCount: c._count.orders,
          lastOrder: c.orders[0] ?? null,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);
