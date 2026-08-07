import { prisma } from "@ordena/database";
import {
  listedBranchProductWhere,
  orderableBranchProductWhere,
  restoreExpiredBranchStock,
  unavailableModifierIdsForBranch,
} from "./branch-menu-stock";

export type CartStockLineInput = {
  productId: string;
  productName?: string;
  modifierIds?: string[];
  secondaryProductId?: string;
};

export type UnavailableCartLine = {
  productId: string;
  productName: string;
  modifierIds: string[];
  reason: string;
};

/**
 * Revisa stock en vivo para líneas del carrito (productos y modificadores).
 * Restaura agotados temporales vencidos antes de evaluar.
 */
export async function findUnavailableCartLines(
  branchId: string,
  items: CartStockLineInput[],
): Promise<UnavailableCartLine[]> {
  await restoreExpiredBranchStock(branchId);
  const unavailableMods = await unavailableModifierIdsForBranch(branchId);
  const out: UnavailableCartLine[] = [];

  for (const item of items) {
    const modifierIds = [...new Set(item.modifierIds ?? [])];
    const fallbackName = item.productName?.trim() || "Producto";

    const product = await prisma.product.findFirst({
      where: {
        id: item.productId,
        isActive: true,
        branches: {
          some: orderableBranchProductWhere(branchId),
        },
      },
      include: {
        modifiers: {
          include: { modifier: true },
        },
      },
    });

    if (!product) {
      const listed = await prisma.product.findFirst({
        where: {
          id: item.productId,
          isActive: true,
          branches: {
            some: listedBranchProductWhere(branchId),
          },
        },
        select: { id: true, name: true },
      });
      out.push({
        productId: item.productId,
        productName: listed?.name ?? fallbackName,
        modifierIds,
        reason: listed ? "agotado" : "no disponible en esta sucursal",
      });
      continue;
    }

    const allActive = product.modifiers
      .map((pm) => pm.modifier)
      .filter((m) => m.isActive);

    const unavailableRequired = allActive.filter(
      (m) => m.isRequired && unavailableMods.has(m.id),
    );
    if (unavailableRequired.length > 0) {
      out.push({
        productId: product.id,
        productName: product.name,
        modifierIds,
        reason: `complemento agotado (${unavailableRequired
          .map((m) => m.name)
          .join(", ")})`,
      });
      continue;
    }

    const soldOutOptional: string[] = [];
    for (const id of modifierIds) {
      const mod = allActive.find((m) => m.id === id);
      if (!mod) {
        soldOutOptional.push("opción no válida");
        continue;
      }
      if (unavailableMods.has(id)) {
        soldOutOptional.push(mod.name);
      }
    }
    if (soldOutOptional.length > 0) {
      out.push({
        productId: product.id,
        productName: product.name,
        modifierIds,
        reason: `opción agotada (${[...new Set(soldOutOptional)].join(", ")})`,
      });
      continue;
    }

    if (item.secondaryProductId) {
      const secondary = await prisma.product.findFirst({
        where: {
          id: item.secondaryProductId,
          isActive: true,
          categoryId: product.categoryId,
          branches: {
            some: orderableBranchProductWhere(branchId),
          },
        },
        select: { id: true },
      });
      if (!product.allowCombo || !secondary) {
        out.push({
          productId: product.id,
          productName: product.name,
          modifierIds,
          reason: "combinación no disponible",
        });
      }
    }
  }

  return out;
}
