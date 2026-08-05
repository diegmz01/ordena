import { Router } from "express";
import { prisma, type OrderStatus, type Prisma } from "@ordena/database";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import {
  assertStripeConfigured,
  fetchStripeBalance,
  listStripePayouts,
} from "../utils/stripe";

export const financeRouter = Router();

const AUTHORIZED_STATUSES: OrderStatus[] = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
];

function parseDateParam(
  raw: unknown,
  label: string,
  endOfDay: boolean,
): Date {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError(400, `Parámetro ${label} requerido (YYYY-MM-DD)`);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) {
    throw new AppError(400, `${label} inválido; usa YYYY-MM-DD`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (endOfDay) {
    return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Rango por paidAt (o createdAt si aún no hay paidAt). */
function paidAtRangeFilter(from: Date, to: Date): Prisma.OrderWhereInput {
  return {
    OR: [
      { paidAt: { gte: from, lte: to } },
      {
        paidAt: null,
        createdAt: { gte: from, lte: to },
      },
    ],
  };
}

financeRouter.get(
  "/summary",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const from = parseDateParam(req.query.from, "from", false);
      const to = parseDateParam(req.query.to, "to", true);
      if (from.getTime() > to.getTime()) {
        throw new AppError(400, "`from` no puede ser posterior a `to`");
      }

      const branchId =
        typeof req.query.branchId === "string" && req.query.branchId.trim()
          ? req.query.branchId.trim()
          : undefined;

      if (branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { id: true },
        });
        if (!branch) throw new AppError(404, "Sucursal no encontrada");
      }

      const baseWhere: Prisma.OrderWhereInput = {
        AND: [
          paidAtRangeFilter(from, to),
          ...(branchId ? [{ branchId }] : []),
        ],
      };

      const orders = await prisma.order.findMany({
        where: baseWhere,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          paidAt: true,
          createdAt: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      });

      let authorizedCents = 0;
      let capturedCents = 0;
      let cancelledCents = 0;
      let authorizedCount = 0;
      let capturedCount = 0;
      let cancelledCount = 0;
      let pendingCaptureCents = 0;
      let pendingCaptureCount = 0;

      const byBranch = new Map<
        string,
        {
          branchId: string;
          name: string;
          captured: number;
          authorized: number;
          cancelled: number;
          orderCount: number;
          capturedCount: number;
        }
      >();

      const byDay = new Map<
        string,
        { date: string; captured: number; orderCount: number }
      >();

      for (const order of orders) {
        const day = dateKeyUTC(order.paidAt ?? order.createdAt);
        if (!byDay.has(day)) {
          byDay.set(day, { date: day, captured: 0, orderCount: 0 });
        }
        const dayRow = byDay.get(day)!;

        if (!byBranch.has(order.branchId)) {
          byBranch.set(order.branchId, {
            branchId: order.branchId,
            name: order.branch.name,
            captured: 0,
            authorized: 0,
            cancelled: 0,
            orderCount: 0,
            capturedCount: 0,
          });
        }
        const branchRow = byBranch.get(order.branchId)!;

        if (order.status === "CANCELLED") {
          cancelledCents += order.total;
          cancelledCount += 1;
          branchRow.cancelled += order.total;
          branchRow.orderCount += 1;
          dayRow.orderCount += 1;
          continue;
        }

        if (AUTHORIZED_STATUSES.includes(order.status)) {
          authorizedCents += order.total;
          authorizedCount += 1;
          branchRow.authorized += order.total;
          branchRow.orderCount += 1;
          dayRow.orderCount += 1;

          if (order.status === "COMPLETED") {
            capturedCents += order.total;
            capturedCount += 1;
            branchRow.captured += order.total;
            branchRow.capturedCount += 1;
            dayRow.captured += order.total;
          } else {
            pendingCaptureCents += order.total;
            pendingCaptureCount += 1;
          }
        }
      }

      const recentCompleted = orders
        .filter((o) => o.status === "COMPLETED")
        .slice(0, 25)
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          total: o.total,
          /** Sin comisión Ordena: a depositar = capturado. */
          toDeposit: o.total,
          paidAt: (o.paidAt ?? o.createdAt).toISOString(),
          branchName: o.branch.name,
        }));

      // Destination charges sin application_fee: lo capturado liquida a la cuenta Connect.
      const toDepositCents = capturedCents;

      res.json({
        data: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          branchId: branchId ?? null,
          dateBasis: "paidAt_or_createdAt" as const,
          depositNote:
            "Sin comisión Ordena: el monto capturado (COMPLETED) es lo que liquida a la cuenta Connect de la sucursal y luego al banco. El fee de procesamiento Stripe lo paga la plataforma.",
          totals: {
            authorizedCents,
            authorizedCount,
            capturedCents,
            capturedCount,
            toDepositCents,
            pendingCaptureCents,
            pendingCaptureCount,
            cancelledCents,
            cancelledCount,
            averageTicketCents:
              capturedCount > 0
                ? Math.round(capturedCents / capturedCount)
                : 0,
          },
          byBranch: [...byBranch.values()]
            .map((row) => ({
              ...row,
              toDeposit: row.captured,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
          byDay: [...byDay.values()]
            .map((row) => ({
              ...row,
              toDeposit: row.captured,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          recentCompleted,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/stripe",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      assertStripeConfigured();

      const from = parseDateParam(req.query.from, "from", false);
      const to = parseDateParam(req.query.to, "to", true);
      if (from.getTime() > to.getTime()) {
        throw new AppError(400, "`from` no puede ser posterior a `to`");
      }

      const branchId =
        typeof req.query.branchId === "string" && req.query.branchId.trim()
          ? req.query.branchId.trim()
          : undefined;

      let stripeAccount: string | null = null;
      let branchName: string | null = null;
      let note =
        "Sin filtro de sucursal: balance y payouts de la cuenta plataforma. Los fondos de destination charges liquidan en cada cuenta Connect.";

      if (branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
          },
        });
        if (!branch) throw new AppError(404, "Sucursal no encontrada");
        branchName = branch.name;
        if (!branch.stripeAccountId) {
          throw new AppError(
            400,
            "Esta sucursal no tiene cuenta Stripe Connect. Conéctala en Sucursales.",
          );
        }
        stripeAccount = branch.stripeAccountId;
        note = `Balance y payouts de la cuenta Connect de ${branch.name} (dinero en camino o ya enviado al banco).`;
      }

      const [balance, payouts] = await Promise.all([
        fetchStripeBalance(stripeAccount),
        listStripePayouts({ from, to, limit: 50, stripeAccount }),
      ]);

      const payoutsTowardBank = payouts.filter((p) =>
        ["paid", "pending", "in_transit"].includes(p.status),
      );
      const payoutsTotalCents = payoutsTowardBank.reduce(
        (sum, p) => sum + p.amount,
        0,
      );

      res.json({
        data: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          branchId: branchId ?? null,
          branchName,
          stripeAccountId: stripeAccount,
          note,
          depositHint:
            "Sin comisión Ordena: el capturado de pedidos COMPLETED liquida a la cuenta Connect. Los payouts de abajo son lo ya enviado o programado al banco (calendario de Stripe).",
          balance,
          payouts,
          payoutsTotalCents,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
