import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma, prisma, type BranchAvailability } from "@ordena/database";
import {
  branchAvailabilityUpdateSchema,
  branchCreateSchema,
  branchMenuUpdateSchema,
  branchSettingsUpdateSchema,
  branchUpdateSchema,
  staffAwaySchema,
  staffMenuStockUpdateSchema,
  type BranchHours,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  authenticateForAudience,
  requireAdmin,
  requireBranchStaff,
  type AuthenticatedRequest,
} from "../middleware/auth";
import {
  effectiveAvailability,
  type EffectiveAvailability,
} from "../utils/branch-availability";
import {
  restoreExpiredBranchStock,
  isProductInStock,
  resolveUnavailableUntil,
  unavailableModifierIdsForBranch,
} from "../utils/branch-menu-stock";
import { recordAdminAction } from "../utils/audit-log";
import { registerBranchClient } from "../utils/sse";

export const branchesRouter = Router();

function toAdminBranchPayload(
  branch: {
    staff: { id: string; email: string; name: string | null }[];
    [key: string]: unknown;
  },
) {
  const { staff, ...rest } = branch;
  return {
    ...rest,
    staff: staff[0] ?? null,
  };
}

function toHoursJson(
  hours: BranchHours | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (hours === undefined) return undefined;
  if (hours === null) return Prisma.JsonNull;
  return hours as Prisma.InputJsonValue;
}

const staffSelect = {
  id: true,
  email: true,
  name: true,
} as const;

const adminBranchInclude = {
  staff: {
    where: { role: "BRANCH_STAFF" as const },
    select: staffSelect,
    orderBy: { createdAt: "asc" as const },
    take: 1,
  },
};

const staffBranchSelect = {
  id: true,
  name: true,
  slug: true,
  address: true,
  phone: true,
  isActive: true,
  availability: true,
  pausedUntil: true,
  staffLastSeenAt: true,
  staffAwayReason: true,
  prepTimeMinutes: true,
  menuStockEnabled: true,
  hours: true,
} as const;

function toStaffBranchPayload(
  branch: {
    id: string;
    name: string;
    slug: string;
    address: string;
    phone: string | null;
    isActive: boolean;
    availability: BranchAvailability;
    pausedUntil: Date | null;
    staffLastSeenAt: Date | null;
    staffAwayReason: "APP_CLOSED" | "CONNECTION_LOST" | null;
    prepTimeMinutes: number;
    menuStockEnabled: boolean;
    hours: unknown;
  },
) {
  const effective = effectiveAvailability(branch);
  return {
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    address: branch.address,
    phone: branch.phone,
    isActive: branch.isActive,
    availability: effective.status,
    mode: effective.mode,
    pausedUntil: effective.pausedUntil,
    acceptingOrders: effective.acceptingOrders,
    withinSchedule: effective.withinSchedule,
    source: effective.source,
    offlineCause: effective.offlineCause,
    todayHoursLabel: effective.todayHoursLabel,
    prepTimeMinutes: branch.prepTimeMinutes,
    menuStockEnabled: branch.menuStockEnabled,
    staffLastSeenAt: branch.staffLastSeenAt,
    staffAwayReason: branch.staffAwayReason,
  };
}

function toAdminAvailabilitySnapshot(
  branch: {
    availability: BranchAvailability;
    pausedUntil: Date | null;
    hours: unknown;
    staffLastSeenAt: Date | null;
    staffAwayReason: "APP_CLOSED" | "CONNECTION_LOST" | null;
  },
): EffectiveAvailability & {
  modeLabel: string;
  statusLabel: string;
  sourceLabel: string;
  offlineCauseLabel: string | null;
} {
  const effective = effectiveAvailability(branch);
  const modeLabel: Record<BranchAvailability, string> = {
    AUTO: "Automático (horario)",
    OPEN: "Abierta manual",
    PAUSED: "Pausada manual",
    CLOSED: "Cerrada manual",
  };
  const statusLabel =
    effective.source === "offline"
      ? effective.offlineCause === "app_closed"
        ? "Pausada · staff cerró la app"
        : "Pausada · sin conexión (red/API)"
      : effective.status === "OPEN"
        ? "Aceptando pedidos"
        : effective.status === "PAUSED"
          ? "Pausada"
          : "Cerrada";
  const sourceLabel: Record<EffectiveAvailability["source"], string> = {
    schedule: "Horario",
    manual: "Manual",
    pause: "Pausa temporal",
    offline: "Sin presencia staff",
  };
  const offlineCauseLabel =
    effective.offlineCause === "app_closed"
      ? "Staff cerró la aplicación"
      : effective.offlineCause === "connection_lost"
        ? "Pérdida de conexión o API sin respuesta"
        : null;

  return {
    ...effective,
    modeLabel: modeLabel[effective.mode],
    statusLabel,
    sourceLabel: sourceLabel[effective.source],
    offlineCauseLabel,
  };
}

async function resolveStaffBranchId(req: AuthenticatedRequest): Promise<string> {
  const user = req.authUser;
  if (!user) throw new AppError(401, "Unauthorized");

  if (user.role === "BRANCH_STAFF") {
    if (!user.branchId) {
      throw new AppError(403, "Usuario de sucursal sin sucursal asignada");
    }
    return user.branchId;
  }

  if (user.role === "ADMIN") {
    if (user.branchId) return user.branchId;
    const first = await prisma.branch.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    if (!first) throw new AppError(404, "No hay sucursales activas");
    return first.id;
  }

  throw new AppError(403, "Insufficient permissions");
}

/** Público: sucursales activas que aceptan pedidos. */
branchesRouter.get("/", async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        latitude: true,
        longitude: true,
        hours: true,
        availability: true,
        pausedUntil: true,
        staffLastSeenAt: true,
        staffAwayReason: true,
      },
    });

    const open = branches
      .filter((b) => effectiveAvailability(b).acceptingOrders)
      .map(
        ({
          availability: _a,
          pausedUntil: _p,
          hours: _h,
          staffLastSeenAt: _s,
          staffAwayReason: _r,
          ...rest
        }) => rest,
      );

    res.json({ data: open });
  } catch (error) {
    next(error);
  }
});

/** Staff: sucursal del usuario + disponibilidad efectiva. */
branchesRouter.get(
  "/me",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const branchId = await resolveStaffBranchId(req);
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: staffBranchSelect,
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");

      res.json({ data: toStaffBranchPayload(branch) });
    } catch (error) {
      next(error);
    }
  },
);

/** Staff: stream SSE de eventos en vivo (nuevo pedido / actualización). */
branchesRouter.get(
  "/me/stream",
  authenticateForAudience("branch"),
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const branchId = await resolveStaffBranchId(req);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      req.socket.setTimeout(0);

      res.write(": connected\n\n");

      const unregister = registerBranchClient(branchId, res);
      req.on("close", unregister);
    } catch (error) {
      next(error);
    }
  },
);

/** Staff: heartbeat de presencia (PWA). Actualiza staffLastSeenAt. */
branchesRouter.post(
  "/me/heartbeat",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const branchId = await resolveStaffBranchId(req);
      const branch = await prisma.branch.update({
        where: { id: branchId },
        data: {
          staffLastSeenAt: new Date(),
          staffAwayReason: null,
        },
        select: staffBranchSelect,
      });
      res.json({ data: toStaffBranchPayload(branch) });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Staff: señal de cierre de app (pagehide / beforeunload).
 * Distingue "cerró la PWA" de "perdió red/API" en admin.
 */
branchesRouter.post(
  "/me/away",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = staffAwaySchema.parse(req.body ?? {});
      const branchId = await resolveStaffBranchId(req);
      const branch = await prisma.branch.update({
        where: { id: branchId },
        data: {
          // null (no "now"): esta es una señal explícita de que el staff se
          // fue, así que el gate de presencia debe pausar de inmediato en vez
          // de esperar hasta STAFF_HEARTBEAT_STALE_MS como con un heartbeat
          // simplemente ausente.
          staffLastSeenAt: null,
          staffAwayReason: body.reason,
        },
        select: staffBranchSelect,
      });
      res.json({ data: toStaffBranchPayload(branch) });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.patch(
  "/me/availability",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = branchAvailabilityUpdateSchema.parse(req.body);
      const branchId = await resolveStaffBranchId(req);

      const existing = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, isActive: true },
      });
      if (!existing) throw new AppError(404, "Sucursal no encontrada");
      if (!existing.isActive) {
        throw new AppError(400, "La sucursal está desactivada");
      }

      let pausedUntil: Date | null = null;
      if (body.availability === "PAUSED") {
        if (body.pauseMinutes) {
          pausedUntil = new Date(Date.now() + body.pauseMinutes * 60_000);
        } else {
          pausedUntil = null;
        }
      }

      const branch = await prisma.branch.update({
        where: { id: branchId },
        data: {
          availability: body.availability,
          pausedUntil,
        },
        select: staffBranchSelect,
      });

      await recordAdminAction({
        actorId: req.authUser!.id,
        action: "branch.availability_update",
        entityType: "Branch",
        entityId: branchId,
        metadata: {
          actorRole: req.authUser!.role,
          availability: body.availability,
          pauseMinutes: body.pauseMinutes ?? null,
        },
      });

      res.json({ data: toStaffBranchPayload(branch) });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.patch(
  "/me/settings",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = branchSettingsUpdateSchema.parse(req.body);
      const branchId = await resolveStaffBranchId(req);

      const existing = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, isActive: true },
      });
      if (!existing) throw new AppError(404, "Sucursal no encontrada");
      if (!existing.isActive) {
        throw new AppError(400, "La sucursal está desactivada");
      }

      const branch = await prisma.branch.update({
        where: { id: branchId },
        data: {
          ...(body.prepTimeMinutes !== undefined
            ? { prepTimeMinutes: body.prepTimeMinutes }
            : {}),
          ...(body.menuStockEnabled !== undefined
            ? { menuStockEnabled: body.menuStockEnabled }
            : {}),
        },
        select: staffBranchSelect,
      });

      res.json({ data: toStaffBranchPayload(branch) });
    } catch (error) {
      next(error);
    }
  },
);

/** Staff: menú habilitado por admin + estado de stock temporal. */
branchesRouter.get(
  "/me/menu",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const branchId = await resolveStaffBranchId(req);
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, menuStockEnabled: true, isActive: true },
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");

      await restoreExpiredBranchStock(branchId);
      const now = new Date();

      const [categories, links, modifiers, modifierLinks] = await Promise.all([
        prisma.category.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            products: {
              where: { isActive: true },
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                basePrice: true,
              },
            },
          },
        }),
        prisma.branchProduct.findMany({
          where: { branchId, available: true },
          select: {
            productId: true,
            unavailableUntil: true,
          },
        }),
        prisma.modifier.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            priceDelta: true,
            isRequired: true,
          },
        }),
        prisma.branchModifier.findMany({
          where: { branchId },
          select: {
            modifierId: true,
            unavailableUntil: true,
          },
        }),
      ]);

      const stockByProduct = new Map(
        links.map((l) => [l.productId, l.unavailableUntil]),
      );
      const stockByModifier = new Map(
        modifierLinks.map((l) => [l.modifierId, l.unavailableUntil]),
      );

      res.json({
        data: {
          branchId: branch.id,
          branchName: branch.name,
          menuStockEnabled: branch.menuStockEnabled,
          categories: categories
            .map((cat) => ({
              id: cat.id,
              name: cat.name,
              products: cat.products
                .filter((p) => stockByProduct.has(p.id))
                .map((p) => {
                  const unavailableUntil = stockByProduct.get(p.id) ?? null;
                  return {
                    id: p.id,
                    name: p.name,
                    basePrice: p.basePrice,
                    inStock: isProductInStock(unavailableUntil, now),
                    unavailableUntil,
                  };
                }),
            }))
            .filter((cat) => cat.products.length > 0),
          modifiers: modifiers.map((m) => {
            const unavailableUntil = stockByModifier.get(m.id) ?? null;
            return {
              id: m.id,
              name: m.name,
              priceDelta: m.priceDelta,
              isRequired: m.isRequired,
              inStock: isProductInStock(unavailableUntil, now),
              unavailableUntil,
            };
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Staff: agotar / restaurar stock de modificador. */
branchesRouter.patch(
  "/me/modifiers/:modifierId",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = staffMenuStockUpdateSchema.parse(req.body);
      const branchId = await resolveStaffBranchId(req);
      const modifierId = String(req.params.modifierId);

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, isActive: true },
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");
      if (!branch.isActive) {
        throw new AppError(400, "La sucursal está desactivada");
      }

      const modifier = await prisma.modifier.findFirst({
        where: { id: modifierId, isActive: true },
        select: { id: true, name: true },
      });
      if (!modifier) throw new AppError(404, "Modificador no encontrado");

      let unavailableUntil: Date | null = null;
      if (!body.inStock) {
        unavailableUntil = resolveUnavailableUntil(body.duration!);
      }

      const link = await prisma.branchModifier.upsert({
        where: {
          branchId_modifierId: { branchId, modifierId },
        },
        create: {
          branchId,
          modifierId,
          unavailableUntil,
        },
        update: { unavailableUntil },
      });

      res.json({
        data: {
          modifierId: link.modifierId,
          name: modifier.name,
          inStock: isProductInStock(link.unavailableUntil),
          unavailableUntil: link.unavailableUntil,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Staff: agotar / restaurar stock (no cambia el catálogo admin). */
branchesRouter.patch(
  "/me/menu/:productId",
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = staffMenuStockUpdateSchema.parse(req.body);
      const branchId = await resolveStaffBranchId(req);
      const productId = String(req.params.productId);

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, isActive: true },
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");
      if (!branch.isActive) {
        throw new AppError(400, "La sucursal está desactivada");
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, isActive: true },
        select: { id: true, name: true },
      });
      if (!product) throw new AppError(404, "Producto no encontrado");

      const existing = await prisma.branchProduct.findUnique({
        where: {
          branchId_productId: { branchId, productId },
        },
      });
      if (!existing || !existing.available) {
        throw new AppError(
          400,
          "Este producto no está habilitado para venta en la sucursal",
        );
      }

      let unavailableUntil: Date | null = null;
      if (!body.inStock) {
        unavailableUntil = resolveUnavailableUntil(body.duration!);
      }

      const link = await prisma.branchProduct.update({
        where: {
          branchId_productId: { branchId, productId },
        },
        data: { unavailableUntil },
      });

      res.json({
        data: {
          productId: link.productId,
          name: product.name,
          inStock: isProductInStock(link.unavailableUntil),
          unavailableUntil: link.unavailableUntil,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.get(
  "/admin",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
        include: adminBranchInclude,
      });
      res.json({
        data: branches.map((b) => {
          return {
            ...toAdminBranchPayload(b),
            availabilityDetail: toAdminAvailabilitySnapshot(b),
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.post(
  "/admin",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = branchCreateSchema.parse(req.body);

      const existingStaff = await prisma.user.findUnique({
        where: { email: body.staffEmail.toLowerCase() },
      });
      if (existingStaff) {
        throw new AppError(400, "Ya existe un usuario con ese email");
      }

      const slug = body.code;
      const codeTaken = await prisma.branch.findUnique({ where: { slug } });
      if (codeTaken) {
        throw new AppError(400, `Ya existe una sucursal con el código ${slug}`);
      }

      const passwordHash = await bcrypt.hash(body.staffPassword, 12);
      const phone =
        body.phone && body.phone.trim().length > 0 ? body.phone.trim() : null;

      const branch = await prisma.branch.create({
        data: {
          name: body.name.trim(),
          slug,
          address: body.address.trim(),
          phone,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          hours: toHoursJson(body.hours ?? null),
          isActive: body.isActive ?? true,
          staff: {
            create: {
              email: body.staffEmail.toLowerCase().trim(),
              passwordHash,
              role: "BRANCH_STAFF",
            },
          },
        },
        include: adminBranchInclude,
      });

      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (products.length > 0) {
        await prisma.branchProduct.createMany({
          data: products.map((p) => ({
            branchId: branch.id,
            productId: p.id,
            available: true,
          })),
          skipDuplicates: true,
        });
      }

      res.status(201).json({
        data: {
          ...branch,
          staff: branch.staff[0] ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.patch(
  "/admin/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = branchUpdateSchema.parse(req.body);
      const existing = await prisma.branch.findUnique({
        where: { id: String(req.params.id) },
        include: {
          staff: {
            where: { role: "BRANCH_STAFF" },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      if (!existing) throw new AppError(404, "Sucursal no encontrada");

      let slug = existing.slug;
      if (body.code !== undefined && body.code !== existing.slug) {
        const codeTaken = await prisma.branch.findFirst({
          where: { slug: body.code, NOT: { id: existing.id } },
        });
        if (codeTaken) {
          throw new AppError(
            400,
            `Ya existe una sucursal con el código ${body.code}`,
          );
        }
        slug = body.code;
      }

      const phone =
        body.phone === undefined
          ? undefined
          : body.phone && body.phone.trim().length > 0
            ? body.phone.trim()
            : null;

      await prisma.branch.update({
        where: { id: existing.id },
        data: {
          name: body.name?.trim(),
          slug,
          address: body.address?.trim(),
          phone,
          latitude: body.latitude === undefined ? undefined : body.latitude,
          longitude: body.longitude === undefined ? undefined : body.longitude,
          hours: toHoursJson(body.hours),
          isActive: body.isActive,
        },
      });

      const currentStaff = existing.staff[0] ?? null;
      const wantsStaffUpdate =
        body.staffEmail !== undefined || body.staffPassword !== undefined;

      if (wantsStaffUpdate) {
        if (currentStaff) {
          if (body.staffEmail) {
            const email = body.staffEmail.toLowerCase().trim();
            if (email !== currentStaff.email) {
              const clash = await prisma.user.findUnique({ where: { email } });
              if (clash && clash.id !== currentStaff.id) {
                throw new AppError(400, "Ya existe un usuario con ese email");
              }
            }
          }

          await prisma.user.update({
            where: { id: currentStaff.id },
            data: {
              email: body.staffEmail?.toLowerCase().trim(),
              passwordHash: body.staffPassword
                ? await bcrypt.hash(body.staffPassword, 12)
                : undefined,
              role: "BRANCH_STAFF",
              branchId: existing.id,
            },
          });
        } else {
          if (!body.staffEmail || !body.staffPassword) {
            throw new AppError(
              400,
              "Email y contraseña de staff son requeridos para crear el usuario",
            );
          }
          const email = body.staffEmail.toLowerCase().trim();
          const clash = await prisma.user.findUnique({ where: { email } });
          if (clash) {
            throw new AppError(400, "Ya existe un usuario con ese email");
          }
          await prisma.user.create({
            data: {
              email,
              passwordHash: await bcrypt.hash(body.staffPassword, 12),
              role: "BRANCH_STAFF",
              branchId: existing.id,
            },
          });
        }
      }

      const branch = await prisma.branch.findUniqueOrThrow({
        where: { id: existing.id },
        include: adminBranchInclude,
      });

      res.json({
        data: {
          ...branch,
          staff: branch.staff[0] ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.delete(
  "/admin/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const existing = await prisma.branch.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Sucursal no encontrada");

      const branch = await prisma.branch.update({
        where: { id: existing.id },
        data: { isActive: false },
        include: adminBranchInclude,
      });

      res.json({
        data: {
          ...branch,
          staff: branch.staff[0] ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Menú disponible por sucursal (BranchProduct.available). */
branchesRouter.get(
  "/admin/:id/menu",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const branch = await prisma.branch.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, name: true },
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");

      const [categories, links] = await Promise.all([
        prisma.category.findMany({
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            products: {
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                isActive: true,
                basePrice: true,
              },
            },
          },
        }),
        prisma.branchProduct.findMany({
          where: { branchId: branch.id },
          select: { productId: true, available: true },
        }),
      ]);

      const availability = new Map(
        links.map((l) => [l.productId, l.available]),
      );

      res.json({
        data: {
          branchId: branch.id,
          branchName: branch.name,
          categories: categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            products: cat.products.map((p) => ({
              id: p.id,
              name: p.name,
              isActive: p.isActive,
              basePrice: p.basePrice,
              available: availability.get(p.id) ?? false,
            })),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

branchesRouter.put(
  "/admin/:id/menu",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = branchMenuUpdateSchema.parse(req.body);
      const branch = await prisma.branch.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true },
      });
      if (!branch) throw new AppError(404, "Sucursal no encontrada");

      const productIds = [...new Set(body.items.map((i) => i.productId))];
      const found = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (found.length !== productIds.length) {
        throw new AppError(400, "Uno o más productos no son válidos");
      }

      await prisma.$transaction(
        body.items.map((item) =>
          prisma.branchProduct.upsert({
            where: {
              branchId_productId: {
                branchId: branch.id,
                productId: item.productId,
              },
            },
            create: {
              branchId: branch.id,
              productId: item.productId,
              available: item.available,
              unavailableUntil: null,
            },
            update: {
              available: item.available,
              ...(item.available === false
                ? { unavailableUntil: null }
                : {}),
            },
          }),
        ),
      );

      res.json({ data: { ok: true, updated: body.items.length } });
    } catch (error) {
      next(error);
    }
  },
);

