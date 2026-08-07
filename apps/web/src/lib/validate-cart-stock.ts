import { apiFetch } from "@/lib/api";
import type { CartItem } from "@/lib/cart";

export type UnavailableCartLine = {
  productId: string;
  productName: string;
  modifierIds: string[];
  reason: string;
};

export type CartStockValidation = {
  ok: boolean;
  unavailable: UnavailableCartLine[];
};

/** Consulta al API el stock actual de las líneas del carrito. */
export async function validateCartStock(
  branchId: string,
  items: Pick<
    CartItem,
    "productId" | "name" | "modifierIds" | "secondaryProductId"
  >[],
): Promise<CartStockValidation> {
  if (items.length === 0) {
    return { ok: true, unavailable: [] };
  }

  const res = await apiFetch<{ data: CartStockValidation }>(
    "/checkout/validate",
    null,
    {
      method: "POST",
      body: JSON.stringify({
        branchId,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.name,
          modifierIds: item.modifierIds,
          secondaryProductId: item.secondaryProductId ?? undefined,
        })),
      }),
    },
  );

  return {
    ok: res.data.ok,
    unavailable: res.data.unavailable ?? [],
  };
}
