import { Router } from "express";
import { prisma } from "@ordena/database";
import { AppError } from "../middleware/error-handler";
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
          oauthAccounts: {
            select: { provider: true },
            orderBy: { createdAt: "asc" },
            take: 1,
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
          loginMethod: c.oauthAccounts[0]?.provider ?? "EMAIL",
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

customersRouter.get(
  "/admin/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const customer = await prisma.user.findFirst({
        where: { id: String(req.params.id), role: "CUSTOMER" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          passwordHash: true,
          createdAt: true,
          updatedAt: true,
          oauthAccounts: {
            select: { provider: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
          orders: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
              paidAt: true,
              branch: { select: { id: true, name: true } },
              _count: { select: { items: true } },
            },
          },
        },
      });

      if (!customer) throw new AppError(404, "Cliente no encontrado");

      const { orders, oauthAccounts, passwordHash, ...profile } = customer;

      const loginMethods = [
        ...(passwordHash ? (["EMAIL"] as const) : []),
        ...oauthAccounts.map((a) => a.provider),
      ];

      const completedOrders = orders.filter((o) => o.status === "COMPLETED");
      const totalSpentCents = completedOrders.reduce(
        (sum, o) => sum + o.total,
        0,
      );

      res.json({
        data: {
          ...profile,
          loginMethods,
          hasPassword: !!passwordHash,
          oauthAccounts,
          stats: {
            ordersCount: orders.length,
            completedOrdersCount: completedOrders.length,
            totalSpentCents,
            averageTicketCents:
              completedOrders.length > 0
                ? Math.round(totalSpentCents / completedOrders.length)
                : 0,
          },
          orders: orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            total: o.total,
            createdAt: o.createdAt,
            paidAt: o.paidAt,
            itemsCount: o._count.items,
            branch: o.branch,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
