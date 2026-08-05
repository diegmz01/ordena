const BRANCH_TZ = process.env.TZ?.trim() || "America/Mexico_City";

/** Fecha de negocio YYYY-MM-DD en zona de la sucursal, como Date @db.Date (UTC midnight). */
export function getBusinessDate(
  now: Date = new Date(),
  timeZone: string = BRANCH_TZ,
): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function nextBranchDayNumber(
  db: {
    order: {
      // Prisma Client tipa aggregate de forma demasiado estrecha para reutilizar aquí.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aggregate: (args: any) => Promise<any>;
    };
  },
  branchId: string,
  now: Date = new Date(),
): Promise<{ businessDate: Date; dayNumber: number }> {
  const businessDate = getBusinessDate(now);
  const agg = await db.order.aggregate({
    where: { branchId, businessDate },
    _max: { dayNumber: true },
  });
  return {
    businessDate,
    dayNumber: (agg._max?.dayNumber ?? 0) + 1,
  };
}
