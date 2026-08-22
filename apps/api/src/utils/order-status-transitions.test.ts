import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_CANCEL_FROM,
  canAdminCancelOrder,
  isValidOrderStatusTransition,
  ORDER_STATUS_TRANSITIONS,
  type ORDER_STATUSES,
} from "@ordena/shared";

type Status = (typeof ORDER_STATUSES)[number];

describe("isValidOrderStatusTransition", () => {
  it("allows every transition declared in ORDER_STATUS_TRANSITIONS", () => {
    for (const [from, allowed] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
      for (const to of allowed) {
        expect(
          isValidOrderStatusTransition(from as Status, to as Status),
          `${from} -> ${to} should be allowed`,
        ).toBe(true);
      }
    }
  });

  it("allows a same-status transition (idempotent retry)", () => {
    expect(isValidOrderStatusTransition("PAID", "PAID")).toBe(true);
  });

  it("rejects skipping straight from PAID to COMPLETED", () => {
    expect(isValidOrderStatusTransition("PAID", "COMPLETED")).toBe(false);
  });

  it("rejects moving backwards from a terminal state", () => {
    expect(isValidOrderStatusTransition("COMPLETED", "PAID")).toBe(false);
    expect(isValidOrderStatusTransition("CANCELLED", "PAID")).toBe(false);
  });
});

describe("canAdminCancelOrder", () => {
  it("matches ADMIN_ORDER_CANCEL_FROM exactly", () => {
    for (const status of [
      "PAID",
      "ACCEPTED",
      "PREPARING",
      "READY",
      "COMPLETED",
      "CANCELLED",
    ] as Status[]) {
      expect(canAdminCancelOrder(status)).toBe(
        (ADMIN_ORDER_CANCEL_FROM as readonly string[]).includes(status),
      );
    }
  });

  it("never allows cancelling an already-cancelled order", () => {
    expect(canAdminCancelOrder("CANCELLED")).toBe(false);
  });
});
