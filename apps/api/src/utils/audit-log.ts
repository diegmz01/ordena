import { prisma, type Prisma } from "@ordena/database";

export type AdminAuditEntityType =
  | "Order"
  | "Product"
  | "Category"
  | "Modifier"
  | "Branch"
  | "SmtpSettings"
  | "SiteContent";

/**
 * Registro best-effort de una acción administrativa sensible (cancelaciones,
 * cambios de precio/menú, disponibilidad de sucursal). Si falla, solo se
 * loguea el error — nunca debe tumbar la operación real que se está auditando
 * (mismo criterio que las notificaciones push en routes/orders.ts).
 */
export async function recordAdminAction(params: {
  actorId: string;
  action: string;
  entityType: AdminAuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: (params.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  } catch (error) {
    console.error("[audit-log]", params.action, params.entityId, error);
  }
}
