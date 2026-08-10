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
import { effectiveAvailability } from "../utils/branch-availability";

export const financeRouter = Router();

/** Misma zona horaria del negocio usada en branch-availability.ts. */
const BRANCH_TZ = process.env.TZ?.trim() || "America/Mexico_City";

const AUTHORIZED_STATUSES: OrderStatus[] = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
];

/** El cobro Stripe ocurre al quedar READY (listo para recoger), no al COMPLETED (entrega). */
const CAPTURED_STATUSES: OrderStatus[] = ["READY", "COMPLETED"];

/** Offset (ms) que hay que sumarle a un instante UTC para leer la hora en `timeZone`. */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - utcMs;
}

/** Convierte una hora de pared (y, mo, d, hh:mm:ss.ms) en `timeZone` al instante UTC real. */
function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  ms: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, ss, ms);
  const offset = timeZoneOffsetMs(guess, timeZone);
  return new Date(guess - offset);
}

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
  // Los límites de día se calculan en la zona horaria del negocio, no en UTC,
  // para que "Hoy" cubra el día calendario real de la sucursal (ver bug: antes
  // de esto, pasadas ~18:00 hora de México el rango ya apuntaba al día UTC
  // siguiente).
  if (endOfDay) {
    return zonedTimeToUtc(y, mo, d, 23, 59, 59, 999, BRANCH_TZ);
  }
  return zonedTimeToUtc(y, mo, d, 0, 0, 0, 0, BRANCH_TZ);
}

function dateKeyLocal(date: Date, timeZone: string = BRANCH_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
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
          refundedTotal: true,
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
        /// Neto de reembolsos parciales (no de la cancelación total, que ya
        /// se excluye vía el bucket `cancelledCents` de abajo).
        const netTotal = order.total - order.refundedTotal;
        const day = dateKeyLocal(order.paidAt ?? order.createdAt);
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
          authorizedCents += netTotal;
          authorizedCount += 1;
          branchRow.authorized += netTotal;
          branchRow.orderCount += 1;
          dayRow.orderCount += 1;

          if (CAPTURED_STATUSES.includes(order.status)) {
            capturedCents += netTotal;
            capturedCount += 1;
            branchRow.captured += netTotal;
            branchRow.capturedCount += 1;
            dayRow.captured += netTotal;
          } else {
            pendingCaptureCents += order.total;
            pendingCaptureCount += 1;
          }
        }
      }

      const recentCompleted = orders
        .filter((o) => CAPTURED_STATUSES.includes(o.status))
        .slice(0, 25)
        .map((o) => {
          const netTotal = o.total - o.refundedTotal;
          return {
            id: o.id,
            orderNumber: o.orderNumber,
            total: netTotal,
            /** Sin comisión Ordena: a depositar = capturado neto de reembolsos. */
            toDeposit: netTotal,
            paidAt: (o.paidAt ?? o.createdAt).toISOString(),
            branchName: o.branch.name,
          };
        });

      // Sin application_fee: lo capturado liquida íntegro a la cuenta principal.
      const toDepositCents = capturedCents;

      res.json({
        data: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          branchId: branchId ?? null,
          dateBasis: "paidAt_or_createdAt" as const,
          depositNote:
            "Sin comisión Ordena: el monto capturado (pedidos READY o COMPLETED) es lo que liquida a la cuenta bancaria principal. El fee de procesamiento Stripe lo paga la plataforma.",
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
  "/products",
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

      // Mismo criterio que "capturado" en /summary: solo pedidos que
      // realmente cobraron (READY o COMPLETED), sin líneas "unavailable"
      // (marcadas por sucursal como no cobradas, ver itemsDiscount en
      // routes/orders.ts).
      const grouped = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          unavailable: false,
          order: {
            status: { in: CAPTURED_STATUSES },
            AND: [
              paidAtRangeFilter(from, to),
              ...(branchId ? [{ branchId }] : []),
            ],
          },
        },
        _sum: { quantity: true, lineTotal: true },
        _max: { productName: true },
      });

      const products = grouped
        .map((row) => ({
          productId: row.productId,
          productName: row._max.productName ?? "(producto eliminado)",
          quantity: row._sum.quantity ?? 0,
          revenueCents: row._sum.lineTotal ?? 0,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents);

      res.json({
        data: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          branchId: branchId ?? null,
          products,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/dashboard",
  authenticate,
  requireAdmin,
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BRANCH_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const map: Record<string, string> = {};
      for (const p of parts) map[p.type] = p.value;
      const y = Number(map.year);
      const mo = Number(map.month);
      const d = Number(map.day);

      const startOfToday = zonedTimeToUtc(y, mo, d, 0, 0, 0, 0, BRANCH_TZ);
      const startOfWeek = new Date(
        startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000,
      );
      const startOfMonth = zonedTimeToUtc(y, mo, 1, 0, 0, 0, 0, BRANCH_TZ);
      const queryFrom =
        startOfWeek.getTime() < startOfMonth.getTime()
          ? startOfWeek
          : startOfMonth;

      const [orders, branches, activeOrdersCount, awaitingAcceptCount] =
        await Promise.all([
          prisma.order.findMany({
            where: paidAtRangeFilter(queryFrom, now),
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              refundedTotal: true,
              paidAt: true,
              createdAt: true,
              branchId: true,
              branch: { select: { id: true, name: true } },
            },
            orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          }),
          prisma.branch.findMany({
            select: {
              id: true,
              name: true,
              isActive: true,
              availability: true,
              pausedUntil: true,
              hours: true,
              staffLastSeenAt: true,
              staffAwayReason: true,
            },
          }),
          prisma.order.count({
            where: {
              status: { in: ["PAID", "ACCEPTED", "PREPARING", "READY"] },
            },
          }),
          prisma.order.count({ where: { status: "PAID" } }),
        ]);

      function effectiveDate(o: { paidAt: Date | null; createdAt: Date }) {
        return o.paidAt ?? o.createdAt;
      }

      function bucket(from: Date) {
        const rows = orders.filter(
          (o) => effectiveDate(o).getTime() >= from.getTime(),
        );
        const captured = rows.filter((o) => CAPTURED_STATUSES.includes(o.status));
        const nonCancelled = rows.filter((o) => o.status !== "CANCELLED");
        const capturedCents = captured.reduce(
          (sum, o) => sum + (o.total - o.refundedTotal),
          0,
        );
        return {
          ordersCount: nonCancelled.length,
          capturedCents,
          capturedCount: captured.length,
          averageTicketCents:
            captured.length > 0
              ? Math.round(capturedCents / captured.length)
              : 0,
        };
      }

      const last7Days: {
        date: string;
        capturedCents: number;
        ordersCount: number;
      }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(
          startOfToday.getTime() - i * 24 * 60 * 60 * 1000,
        );
        last7Days.push({
          date: dateKeyLocal(dayStart),
          capturedCents: 0,
          ordersCount: 0,
        });
      }
      const last7ByKey = new Map(last7Days.map((row) => [row.date, row]));
      for (const o of orders) {
        const eff = effectiveDate(o);
        if (eff.getTime() < startOfWeek.getTime()) continue;
        const row = last7ByKey.get(dateKeyLocal(eff));
        if (!row) continue;
        if (o.status !== "CANCELLED") row.ordersCount += 1;
        if (CAPTURED_STATUSES.includes(o.status))
          row.capturedCents += o.total - o.refundedTotal;
      }

      const byBranchMonth = new Map<
        string,
        {
          branchId: string;
          name: string;
          capturedCents: number;
          ordersCount: number;
        }
      >();
      for (const o of orders) {
        if (effectiveDate(o).getTime() < startOfMonth.getTime()) continue;
        if (o.status === "CANCELLED") continue;
        if (!byBranchMonth.has(o.branchId)) {
          byBranchMonth.set(o.branchId, {
            branchId: o.branchId,
            name: o.branch.name,
            capturedCents: 0,
            ordersCount: 0,
          });
        }
        const row = byBranchMonth.get(o.branchId)!;
        row.ordersCount += 1;
        if (CAPTURED_STATUSES.includes(o.status))
          row.capturedCents += o.total - o.refundedTotal;
      }
      const topBranches = [...byBranchMonth.values()]
        .sort((a, b) => b.capturedCents - a.capturedCents)
        .slice(0, 5);

      const branchesOpenNow = branches.filter(
        (b) => effectiveAvailability(b).acceptingOrders,
      ).length;

      const recentOrders = orders.slice(0, 8).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        branchName: o.branch.name,
      }));

      res.json({
        data: {
          generatedAt: now.toISOString(),
          today: bucket(startOfToday),
          week: bucket(startOfWeek),
          month: bucket(startOfMonth),
          trend: last7Days,
          topBranches,
          operational: {
            activeOrders: activeOrdersCount,
            awaitingAccept: awaitingAcceptCount,
            branchesTotal: branches.length,
            branchesActive: branches.filter((b) => b.isActive).length,
            branchesOpenNow,
          },
          recentOrders,
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

      const [balance, payouts] = await Promise.all([
        fetchStripeBalance(),
        listStripePayouts({ from, to, limit: 50 }),
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
          note: "Balance y payouts de la cuenta bancaria principal vinculada a Stripe (todas las sucursales).",
          depositHint:
            "Sin comisión Ordena: el capturado de pedidos READY o COMPLETED liquida a la cuenta principal. Los payouts de abajo son lo ya enviado o programado al banco (calendario de Stripe).",
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
