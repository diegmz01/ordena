import { Prisma, prisma } from "@ordena/database";
import { isWithinBranchHours } from "./branch-availability";

const BRANCH_TZ = process.env.TZ?.trim() || "America/Mexico_City";

/** Agotado hasta reactivar manualmente (no lo limpia restoreExpiredBranchStock). */
export const MANUAL_UNAVAILABLE_UNTIL = new Date("9999-12-31T00:00:00.000Z");

export function isManualUnavailable(
  unavailableUntil: Date | null | undefined,
): boolean {
  if (!unavailableUntil) return false;
  return unavailableUntil.getTime() >= MANUAL_UNAVAILABLE_UNTIL.getTime();
}

/**
 * UTC instant for 00:00:00 of the next calendar day in `timeZone`.
 */
export function startOfNextDayInTimeZone(
  now: Date = new Date(),
  timeZone: string = BRANCH_TZ,
): Date {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const nextUtc = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = `${nextUtc.getUTCFullYear()}-${String(nextUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(nextUtc.getUTCDate()).padStart(2, "0")}`;

  let guess = new Date(`${nextStr}T06:00:00.000Z`);
  for (let i = 0; i < 6; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    const localAsUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const desired = Date.UTC(
      Number(nextStr.slice(0, 4)),
      Number(nextStr.slice(5, 7)) - 1,
      Number(nextStr.slice(8, 10)),
      0,
      0,
      0,
    );
    guess = new Date(guess.getTime() + (desired - localAsUtc));
  }
  return guess;
}

/** Limpia agotados temporales vencidos (no toca `available` del admin ni manual). */
export async function restoreExpiredBranchStock(
  branchId: string,
  now = new Date(),
) {
  await prisma.branchProduct.updateMany({
    where: {
      branchId,
      unavailableUntil: { lte: now },
    },
    data: {
      unavailableUntil: null,
    },
  });

  await prisma.branchModifier.updateMany({
    where: {
      branchId,
      unavailableUntil: { lte: now },
    },
    data: {
      unavailableUntil: null,
    },
  });

  // Corrige datos de la etapa en que "agotar" ponía available=false.
  await prisma.branchProduct.updateMany({
    where: {
      branchId,
      available: false,
      unavailableUntil: { not: null, gt: now },
    },
    data: { available: true },
  });
}

/** Estado de horario por producto (solo los que tienen `schedule` configurado). */
export async function scheduleStatusForBranch(
  branchId: string,
  now: Date = new Date(),
): Promise<Map<string, { inSchedule: boolean; scheduleLabel: string | null }>> {
  const rows = await prisma.branchProduct.findMany({
    where: {
      branchId,
      available: true,
      schedule: { not: Prisma.JsonNull },
    },
    select: { productId: true, schedule: true },
  });
  const map = new Map<
    string,
    { inSchedule: boolean; scheduleLabel: string | null }
  >();
  for (const row of rows) {
    const { within, todayHoursLabel } = isWithinBranchHours(row.schedule, now);
    map.set(row.productId, { inSchedule: within, scheduleLabel: todayHoursLabel });
  }
  return map;
}

/** Ids de productos fuera de su horario configurado en este momento. */
export async function outOfScheduleProductIdsForBranch(
  branchId: string,
  now: Date = new Date(),
): Promise<Set<string>> {
  const status = await scheduleStatusForBranch(branchId, now);
  const out = new Set<string>();
  for (const [productId, { inSchedule }] of status) {
    if (!inSchedule) out.add(productId);
  }
  return out;
}

/** Ids de modificadores agotados en la sucursal (unavailableUntil futura). */
export async function unavailableModifierIdsForBranch(
  branchId: string,
  now = new Date(),
): Promise<Set<string>> {
  const rows = await prisma.branchModifier.findMany({
    where: {
      branchId,
      unavailableUntil: { gt: now },
    },
    select: { modifierId: true },
  });
  return new Set(rows.map((r) => r.modifierId));
}

/**
 * Filtro Prisma: producto habilitado por admin (aparece en menú, aunque esté agotado).
 */
export function listedBranchProductWhere(branchId: string) {
  return {
    branchId,
    available: true as const,
  };
}

/**
 * Filtro Prisma: producto habilitado por admin y con stock (no agotado por staff).
 */
export function orderableBranchProductWhere(branchId: string, now = new Date()) {
  return {
    branchId,
    available: true as const,
    OR: [{ unavailableUntil: null }, { unavailableUntil: { lte: now } }],
  };
}

/** Ids de productos agotados en la sucursal (unavailableUntil futura). */
export async function unavailableProductIdsForBranch(
  branchId: string,
  now = new Date(),
): Promise<Set<string>> {
  const rows = await prisma.branchProduct.findMany({
    where: {
      branchId,
      available: true,
      unavailableUntil: { gt: now },
    },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

export function isProductInStock(
  unavailableUntil: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!unavailableUntil) return true;
  return unavailableUntil.getTime() <= now.getTime();
}

export function resolveUnavailableUntil(
  duration: 30 | 60 | 120 | "day" | "manual",
  now = new Date(),
): Date {
  if (duration === "manual") return MANUAL_UNAVAILABLE_UNTIL;
  if (duration === "day") return startOfNextDayInTimeZone(now);
  return new Date(now.getTime() + duration * 60_000);
}
