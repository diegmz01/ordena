import { prisma } from "@ordena/database";
import { effectiveAvailability } from "./branch-availability";

/**
 * Recorre todas las sucursales y, si su estado efectivo (status/source/
 * offlineCause/withinSchedule) cambió respecto al último evento guardado,
 * inserta una fila en BranchStatusEvent. Llamado periódicamente por
 * apps/api/src/jobs/branch-status-snapshot-job.ts — nunca lanza, cada
 * sucursal se procesa de forma independiente para que un error puntual no
 * tumbe el resto del barrido.
 */
export async function recordBranchStatusChanges(now: Date = new Date()): Promise<void> {
  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      availability: true,
      pausedUntil: true,
      hours: true,
      staffLastSeenAt: true,
      staffAwayReason: true,
    },
  });

  for (const branch of branches) {
    try {
      const effective = effectiveAvailability(branch, now);
      const last = await prisma.branchStatusEvent.findFirst({
        where: { branchId: branch.id },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          source: true,
          offlineCause: true,
          withinSchedule: true,
        },
      });

      const changed =
        !last ||
        last.status !== effective.status ||
        last.source !== effective.source ||
        last.offlineCause !== effective.offlineCause ||
        last.withinSchedule !== effective.withinSchedule;

      if (!changed) continue;

      await prisma.branchStatusEvent.create({
        data: {
          branchId: branch.id,
          status: effective.status,
          source: effective.source,
          offlineCause: effective.offlineCause,
          withinSchedule: effective.withinSchedule,
        },
      });
    } catch (error) {
      console.error(`[branch-status-events] sucursal ${branch.id}`, error);
    }
  }
}
