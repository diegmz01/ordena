import { Router } from "express";
import { prisma } from "@ordena/database";
import {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  modifierCreateSchema,
  modifierUpdateSchema,
  productCreateSchema,
  productReorderSchema,
  productUpdateSchema,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { effectiveAvailability } from "../utils/branch-availability";
import {
  restoreExpiredBranchStock,
  listedBranchProductWhere,
  scheduleStatusForBranch,
  unavailableModifierIdsForBranch,
  unavailableProductIdsForBranch,
} from "../utils/branch-menu-stock";
import { uniqueSlug } from "../utils/slug";
import { recordAdminAction } from "../utils/audit-log";

export const menuRouter = Router();

const productAdminInclude = {
  category: true,
  variants: true,
  modifiers: {
    include: { modifier: true },
    orderBy: { modifier: { sortOrder: "asc" as const } },
  },
};

async function syncProductModifiers(productId: string, modifierIds: string[]) {
  const uniqueIds = [...new Set(modifierIds)];
  if (uniqueIds.length > 0) {
    const found = await prisma.modifier.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new AppError(400, "Uno o más modificadores no son válidos");
    }
  }

  await prisma.productModifier.deleteMany({ where: { productId } });
  if (uniqueIds.length > 0) {
    await prisma.productModifier.createMany({
      data: uniqueIds.map((modifierId) => ({ productId, modifierId })),
      skipDuplicates: true,
    });
  }
}

/** Público: menú activo (cliente). */
menuRouter.get("/", async (req, res, next) => {
  try {
    const branchId =
      typeof req.query.branchId === "string" ? req.query.branchId : undefined;

    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, isActive: true },
        select: {
          availability: true,
          pausedUntil: true,
          hours: true,
          staffLastSeenAt: true,
          staffAwayReason: true,
        },
      });
      if (!branch || !effectiveAvailability(branch).acceptingOrders) {
        throw new AppError(
          400,
          "La sucursal no está disponible para pedidos en este momento",
        );
      }
      await restoreExpiredBranchStock(branchId);
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(branchId
          ? {
              branches: {
                some: listedBranchProductWhere(branchId),
              },
            }
          : {}),
      },
      include: {
        category: true,
        variants: { where: { isActive: true } },
        modifiers: {
          where: { modifier: { isActive: true } },
          include: { modifier: true },
          orderBy: { modifier: { sortOrder: "asc" } },
        },
      },
      orderBy: [
        { category: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    if (!branchId) {
      res.json({
        data: products.map((p) => ({
          ...p,
          inStock: true,
          inSchedule: true,
          scheduleLabel: null,
          modifiers: p.modifiers.map((pm) => ({
            ...pm,
            modifier: { ...pm.modifier, inStock: true },
          })),
        })),
      });
      return;
    }

    const [outProducts, outMods, scheduleStatus] = await Promise.all([
      unavailableProductIdsForBranch(branchId),
      unavailableModifierIdsForBranch(branchId),
      scheduleStatusForBranch(branchId),
    ]);

    res.json({
      data: products.map((p) => {
        const schedule = scheduleStatus.get(p.id);
        return {
          ...p,
          inStock: !outProducts.has(p.id),
          inSchedule: schedule ? schedule.inSchedule : true,
          scheduleLabel: schedule?.scheduleLabel ?? null,
          modifiers: p.modifiers.map((pm) => ({
            ...pm,
            modifier: {
              ...pm.modifier,
              inStock: !outMods.has(pm.modifierId),
            },
          })),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

/** Admin: todos los productos (incl. inactivos). */
menuRouter.get(
  "/admin/products",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const products = await prisma.product.findMany({
        include: productAdminInclude,
        orderBy: [
          { category: { sortOrder: "asc" } },
          { sortOrder: "asc" },
          { name: "asc" },
        ],
      });
      res.json({ data: products });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.get(
  "/admin/categories",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: true } } },
      });
      res.json({ data: categories });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.post(
  "/admin/categories",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = categoryCreateSchema.parse(req.body);
      const slug = await uniqueSlug(body.name, async (s) => {
        const found = await prisma.category.findUnique({ where: { slug: s } });
        return !!found;
      });

      const category = await prisma.category.create({
        data: {
          name: body.name.trim(),
          slug,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
      });

      res.status(201).json({ data: category });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/admin/categories/reorder",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = categoryReorderSchema.parse(req.body);

      const allCategories = await prisma.category.findMany({
        select: { id: true },
      });
      const allCategoryIds = new Set(allCategories.map((c) => c.id));

      if (
        body.categoryIds.length !== allCategoryIds.size ||
        !body.categoryIds.every((id) => allCategoryIds.has(id))
      ) {
        throw new AppError(
          400,
          "La lista de categorías no coincide con las categorías existentes",
        );
      }

      await prisma.$transaction(
        body.categoryIds.map((id, index) =>
          prisma.category.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/admin/categories/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = categoryUpdateSchema.parse(req.body);
      const existing = await prisma.category.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Categoría no encontrada");

      let slug = existing.slug;
      if (body.name && body.name.trim() !== existing.name) {
        slug = await uniqueSlug(body.name, async (s) => {
          const found = await prisma.category.findFirst({
            where: { slug: s, NOT: { id: existing.id } },
          });
          return !!found;
        });
      }

      const category = await prisma.category.update({
        where: { id: existing.id },
        data: {
          name: body.name?.trim(),
          slug,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
        },
      });

      res.json({ data: category });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/admin/categories/:id/products/reorder",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = productReorderSchema.parse(req.body);
      const categoryId = String(req.params.id);

      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) throw new AppError(404, "Categoría no encontrada");

      const categoryProducts = await prisma.product.findMany({
        where: { categoryId },
        select: { id: true },
      });
      const categoryProductIds = new Set(categoryProducts.map((p) => p.id));

      if (
        body.productIds.length !== categoryProductIds.size ||
        !body.productIds.every((id) => categoryProductIds.has(id))
      ) {
        throw new AppError(
          400,
          "La lista de productos no coincide con los productos de la categoría",
        );
      }

      await prisma.$transaction(
        body.productIds.map((id, index) =>
          prisma.product.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.get(
  "/admin/modifiers",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const modifiers = await prisma.modifier.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: true } } },
      });
      res.json({ data: modifiers });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.post(
  "/admin/modifiers",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = modifierCreateSchema.parse(req.body);
      const slug = await uniqueSlug(body.name, async (s) => {
        const found = await prisma.modifier.findUnique({ where: { slug: s } });
        return !!found;
      });

      const modifier = await prisma.modifier.create({
        data: {
          name: body.name.trim(),
          slug,
          priceDelta: Math.round(body.priceDelta * 100),
          sortOrder: body.sortOrder ?? 0,
          isRequired: body.isRequired ?? false,
          isActive: body.isActive ?? true,
        },
        include: { _count: { select: { products: true } } },
      });

      res.status(201).json({ data: modifier });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/admin/modifiers/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = modifierUpdateSchema.parse(req.body);
      const existing = await prisma.modifier.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Modificador no encontrado");

      let slug = existing.slug;
      if (body.name && body.name.trim() !== existing.name) {
        slug = await uniqueSlug(body.name, async (s) => {
          const found = await prisma.modifier.findFirst({
            where: { slug: s, NOT: { id: existing.id } },
          });
          return !!found;
        });
      }

      const modifier = await prisma.modifier.update({
        where: { id: existing.id },
        data: {
          name: body.name?.trim(),
          slug,
          priceDelta:
            body.priceDelta === undefined
              ? undefined
              : Math.round(body.priceDelta * 100),
          sortOrder: body.sortOrder,
          isRequired: body.isRequired,
          isActive: body.isActive,
        },
        include: { _count: { select: { products: true } } },
      });

      res.json({ data: modifier });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.post(
  "/admin/products",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = productCreateSchema.parse(req.body);

      const category = await prisma.category.findUnique({
        where: { id: body.categoryId },
      });
      if (!category) throw new AppError(400, "Categoría no válida");

      const slug = await uniqueSlug(body.name, async (s) => {
        const found = await prisma.product.findUnique({ where: { slug: s } });
        return !!found;
      });

      const basePrice = Math.round(body.price * 100);
      const imageUrl =
        body.imageUrl && body.imageUrl.length > 0 ? body.imageUrl : null;

      const product = await prisma.product.create({
        data: {
          name: body.name.trim(),
          slug,
          description: body.description?.trim() || null,
          imageUrl,
          basePrice,
          categoryId: body.categoryId,
          isActive: body.isActive ?? true,
          allowCombo: body.allowCombo ?? false,
        },
      });

      if (body.modifierIds) {
        await syncProductModifiers(product.id, body.modifierIds);
      }

      const branches = await prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (branches.length > 0) {
        await prisma.branchProduct.createMany({
          data: branches.map((b) => ({
            branchId: b.id,
            productId: product.id,
            available: true,
          })),
          skipDuplicates: true,
        });
      }

      const full = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        include: productAdminInclude,
      });

      res.status(201).json({ data: full });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/admin/products/:id",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = productUpdateSchema.parse(req.body);
      const existing = await prisma.product.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Producto no encontrado");

      if (body.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: body.categoryId },
        });
        if (!category) throw new AppError(400, "Categoría no válida");
      }

      let slug = existing.slug;
      if (body.name && body.name.trim() !== existing.name) {
        slug = await uniqueSlug(body.name, async (s) => {
          const found = await prisma.product.findFirst({
            where: { slug: s, NOT: { id: existing.id } },
          });
          return !!found;
        });
      }

      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: body.name?.trim(),
          slug,
          description:
            body.description === undefined
              ? undefined
              : body.description?.trim() || null,
          imageUrl:
            body.imageUrl === undefined
              ? undefined
              : body.imageUrl && body.imageUrl.length > 0
                ? body.imageUrl
                : null,
          basePrice:
            body.price === undefined
              ? undefined
              : Math.round(body.price * 100),
          categoryId: body.categoryId,
          isActive: body.isActive,
          allowCombo: body.allowCombo,
        },
      });

      if (body.modifierIds) {
        await syncProductModifiers(existing.id, body.modifierIds);
      }

      if (body.price !== undefined) {
        await recordAdminAction({
          actorId: req.authUser!.id,
          action: "product.price_update",
          entityType: "Product",
          entityId: existing.id,
          metadata: {
            productName: existing.name,
            fromCents: existing.basePrice,
            toCents: Math.round(body.price * 100),
          },
        });
      }

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: existing.id },
        include: productAdminInclude,
      });

      res.json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.delete(
  "/admin/products/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const existing = await prisma.product.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Producto no encontrado");

      const product = await prisma.product.update({
        where: { id: existing.id },
        data: { isActive: false },
        include: { category: true },
      });

      res.json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);
