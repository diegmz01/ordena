import { describe, expect, it } from "vitest";
import type { BranchHours } from "@ordena/shared";
import {
  effectiveAvailability,
  type BranchAvailabilityFields,
} from "./branch-availability";

const NOW = new Date("2026-06-15T12:00:00.000Z");

/** Todos los días abiertos 00:00–23:59: cualquier `now` cae dentro de horario. */
const ALWAYS_OPEN_HOURS: BranchHours = {
  mon: { closed: false, open: "00:00", close: "23:59" },
  tue: { closed: false, open: "00:00", close: "23:59" },
  wed: { closed: false, open: "00:00", close: "23:59" },
  thu: { closed: false, open: "00:00", close: "23:59" },
  fri: { closed: false, open: "00:00", close: "23:59" },
  sat: { closed: false, open: "00:00", close: "23:59" },
  sun: { closed: false, open: "00:00", close: "23:59" },
};

/** Todos los días cerrados: cualquier `now` cae fuera de horario. */
const ALWAYS_CLOSED_HOURS: BranchHours = {
  mon: { closed: true },
  tue: { closed: true },
  wed: { closed: true },
  thu: { closed: true },
  fri: { closed: true },
  sat: { closed: true },
  sun: { closed: true },
};

function branch(
  overrides: Partial<BranchAvailabilityFields> = {},
): BranchAvailabilityFields {
  return {
    availability: "AUTO",
    pausedUntil: null,
    hours: null,
    staffLastSeenAt: NOW,
    staffAwayReason: null,
    ...overrides,
  };
}

describe("effectiveAvailability — modo AUTO (horario)", () => {
  it("sin hours configuradas, siempre acepta pedidos (con staff presente)", () => {
    const result = effectiveAvailability(branch({ hours: null }), NOW);
    expect(result.status).toBe("OPEN");
    expect(result.acceptingOrders).toBe(true);
    expect(result.source).toBe("schedule");
  });

  it("dentro de horario configurado, acepta pedidos", () => {
    const result = effectiveAvailability(
      branch({ hours: ALWAYS_OPEN_HOURS }),
      NOW,
    );
    expect(result.status).toBe("OPEN");
    expect(result.acceptingOrders).toBe(true);
  });

  it("fuera de horario configurado, no acepta pedidos", () => {
    const result = effectiveAvailability(
      branch({ hours: ALWAYS_CLOSED_HOURS }),
      NOW,
    );
    expect(result.status).toBe("CLOSED");
    expect(result.acceptingOrders).toBe(false);
    expect(result.source).toBe("schedule");
  });
});

describe("effectiveAvailability — overrides manuales", () => {
  it("OPEN fuerza abierta incluso fuera de horario", () => {
    const result = effectiveAvailability(
      branch({ availability: "OPEN", hours: ALWAYS_CLOSED_HOURS }),
      NOW,
    );
    expect(result.status).toBe("OPEN");
    expect(result.acceptingOrders).toBe(true);
    expect(result.source).toBe("manual");
  });

  it("CLOSED fuerza cerrada incluso dentro de horario", () => {
    const result = effectiveAvailability(
      branch({ availability: "CLOSED", hours: ALWAYS_OPEN_HOURS }),
      NOW,
    );
    expect(result.status).toBe("CLOSED");
    expect(result.acceptingOrders).toBe(false);
    expect(result.source).toBe("manual");
  });

  it("PAUSED vigente no acepta pedidos", () => {
    const result = effectiveAvailability(
      branch({
        availability: "PAUSED",
        pausedUntil: new Date(NOW.getTime() + 60_000),
      }),
      NOW,
    );
    expect(result.status).toBe("PAUSED");
    expect(result.acceptingOrders).toBe(false);
    expect(result.source).toBe("pause");
  });

  it("PAUSED vencido se trata como AUTO", () => {
    const result = effectiveAvailability(
      branch({
        availability: "PAUSED",
        pausedUntil: new Date(NOW.getTime() - 60_000),
        hours: ALWAYS_OPEN_HOURS,
      }),
      NOW,
    );
    expect(result.status).toBe("OPEN");
    expect(result.mode).toBe("AUTO");
    expect(result.pausedUntil).toBeNull();
  });
});

describe("effectiveAvailability — heartbeat de staff", () => {
  it("sin heartbeat reciente, una sucursal que iba a aceptar pasa a pausada/offline", () => {
    const result = effectiveAvailability(
      branch({
        availability: "OPEN",
        staffLastSeenAt: new Date(NOW.getTime() - 60_000), // > 45s
        staffAwayReason: "APP_CLOSED",
      }),
      NOW,
    );
    expect(result.status).toBe("PAUSED");
    expect(result.acceptingOrders).toBe(false);
    expect(result.source).toBe("offline");
    expect(result.offlineCause).toBe("app_closed");
  });

  it("sin heartbeat y sin razón explícita, asume pérdida de conexión", () => {
    const result = effectiveAvailability(
      branch({
        availability: "OPEN",
        staffLastSeenAt: null,
        staffAwayReason: null,
      }),
      NOW,
    );
    expect(result.offlineCause).toBe("connection_lost");
  });

  it("una sucursal CLOSED manualmente no se ve afectada por el heartbeat", () => {
    const result = effectiveAvailability(
      branch({
        availability: "CLOSED",
        staffLastSeenAt: null,
      }),
      NOW,
    );
    expect(result.status).toBe("CLOSED");
    expect(result.source).toBe("manual");
    expect(result.offlineCause).toBeNull();
  });

  it("heartbeat reciente mantiene la sucursal aceptando pedidos", () => {
    const result = effectiveAvailability(
      branch({
        availability: "OPEN",
        staffLastSeenAt: new Date(NOW.getTime() - 1_000),
      }),
      NOW,
    );
    expect(result.acceptingOrders).toBe(true);
    expect(result.offlineCause).toBeNull();
  });
});
