import { describe, expect, it } from "vitest";
import {
  chargeableTotal,
  itemsDiscount,
  itemsSubtotal,
  orderTotalWithFee,
} from "./orders";

describe("orders money math", () => {
  const items = [
    { unavailable: false, lineTotal: 12000 },
    { unavailable: true, lineTotal: 5000 },
    { unavailable: false, lineTotal: 3000 },
  ];

  it("itemsSubtotal sums every line regardless of availability", () => {
    expect(itemsSubtotal(items)).toBe(20000);
  });

  it("itemsDiscount only sums lines marked unavailable", () => {
    expect(itemsDiscount(items)).toBe(5000);
  });

  it("chargeableTotal is subtotal minus discount", () => {
    expect(chargeableTotal(items)).toBe(15000);
  });

  it("chargeableTotal is 0 when every line is unavailable", () => {
    const allOut = items.map((i) => ({ ...i, unavailable: true }));
    expect(chargeableTotal(allOut)).toBe(0);
  });

  it("handles an empty cart without throwing", () => {
    expect(itemsSubtotal([])).toBe(0);
    expect(itemsDiscount([])).toBe(0);
    expect(chargeableTotal([])).toBe(0);
  });

  it("orderTotalWithFee adds the frozen service fee on top of chargeableTotal", () => {
    expect(orderTotalWithFee(items, 500)).toBe(15500);
  });

  it("orderTotalWithFee keeps the service fee even when every line is unavailable", () => {
    const allOut = items.map((i) => ({ ...i, unavailable: true }));
    expect(orderTotalWithFee(allOut, 500)).toBe(500);
  });

  it("orderTotalWithFee treats a missing/zero fee as a no-op", () => {
    expect(orderTotalWithFee(items, 0)).toBe(chargeableTotal(items));
  });
});
