export type MoneyItem = { unavailable: boolean; lineTotal: number };

export function itemsSubtotal(items: MoneyItem[]) {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

export function itemsDiscount(items: MoneyItem[]) {
  return items
    .filter((item) => item.unavailable)
    .reduce((sum, item) => sum + item.lineTotal, 0);
}

export function chargeableTotal(items: MoneyItem[]) {
  return itemsSubtotal(items) - itemsDiscount(items);
}

/** `chargeableTotal` más la tarifa de servicios congelada del pedido (no se
 * pierde al marcar productos agotados antes de aceptar). */
export function orderTotalWithFee(items: MoneyItem[], serviceFee: number) {
  return chargeableTotal(items) + Math.max(0, serviceFee);
}
