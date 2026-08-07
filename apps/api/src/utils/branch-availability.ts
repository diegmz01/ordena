import type { BranchAvailability } from "@ordena/database";
import type { BranchDayHours, BranchHours } from "@ordena/shared";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const BRANCH_TZ = process.env.TZ?.trim() || "America/Mexico_City";

/** Sin heartbeat staff exitoso en este lapso → no aceptar pedidos. */
export const STAFF_HEARTBEAT_STALE_MS = 45_000;

export type BranchAvailabilityFields = {
  availability: BranchAvailability;
  pausedUntil: Date | null;
  hours?: unknown;
  staffLastSeenAt?: Date | null;
  staffAwayReason?: "APP_CLOSED" | "CONNECTION_LOST" | null;
};

export type OfflineCause = "app_closed" | "connection_lost";

export type EffectiveAvailability = {
  /** Estado visible / operativo. */
  status: "OPEN" | "PAUSED" | "CLOSED";
  /** Override guardado en DB. */
  mode: BranchAvailability;
  pausedUntil: Date | null;
  acceptingOrders: boolean;
  withinSchedule: boolean;
  /** Origen del estado efectivo. */
  source: "schedule" | "manual" | "pause" | "offline";
  /**
   * Si source === "offline": app_closed (staff cerró PWA) vs connection_lost (red/API).
   */
  offlineCause: OfflineCause | null;
  /** Resumen del horario de hoy, p. ej. "09:00–22:00" o "Cerrado hoy". */
  todayHoursLabel: string | null;
  staffLastSeenAt: Date | null;
};

function parseHours(raw: unknown): BranchHours | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<Record<DayKey, BranchDayHours>>;
  const required = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  for (const key of required) {
    if (!obj[key]) return null;
  }
  return obj as BranchHours;
}

function parseHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function getZonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const map: Record<string, DayKey> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };

  return {
    dayKey: map[weekday] ?? "mon",
    minutes: hour * 60 + minute,
  };
}

function dayHoursLabel(day: BranchDayHours | undefined): string {
  if (!day || day.closed) return "Cerrado hoy";
  if (day.open && day.close) return `${day.open}–${day.close}`;
  return "Sin horario";
}

/** ¿Está dentro del horario configurado en admin? Sin hours → siempre abierto. */
export function isWithinBranchHours(
  hoursRaw: unknown,
  now: Date = new Date(),
  timeZone: string = BRANCH_TZ,
): { within: boolean; todayHoursLabel: string | null; day: BranchDayHours | null } {
  const hours = parseHours(hoursRaw);
  if (!hours) {
    return { within: true, todayHoursLabel: null, day: null };
  }

  const { dayKey, minutes } = getZonedParts(now, timeZone);
  const day = hours[dayKey];
  const todayHoursLabel = dayHoursLabel(day);

  if (!day || day.closed) {
    return { within: false, todayHoursLabel, day };
  }

  const open = day.open ? parseHHMM(day.open) : null;
  const close = day.close ? parseHHMM(day.close) : null;
  if (open === null || close === null) {
    return { within: false, todayHoursLabel, day };
  }

  // Cruce de medianoche (ej. 18:00–02:00)
  if (close <= open) {
    return {
      within: minutes >= open || minutes < close,
      todayHoursLabel,
      day,
    };
  }

  return {
    within: minutes >= open && minutes < close,
    todayHoursLabel,
    day,
  };
}

/** ¿El heartbeat de staff de esta sucursal está vencido? */
export function isStaffPresenceStale(
  staffLastSeenAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!staffLastSeenAt) return true;
  return now.getTime() - staffLastSeenAt.getTime() > STAFF_HEARTBEAT_STALE_MS;
}

function resolveOfflineCause(
  branch: BranchAvailabilityFields,
): OfflineCause {
  if (branch.staffAwayReason === "APP_CLOSED") return "app_closed";
  return "connection_lost";
}

/**
 * Si el modo permitiría aceptar, exige heartbeat reciente de la PWA staff.
 * CLOSED / PAUSED manual no se alteran.
 */
function withStaffPresenceGate(
  result: EffectiveAvailability,
  branch: BranchAvailabilityFields,
  now: Date,
): EffectiveAvailability {
  if (!result.acceptingOrders) return result;
  if (!isStaffPresenceStale(branch.staffLastSeenAt, now)) return result;
  return {
    ...result,
    status: "PAUSED",
    acceptingOrders: false,
    source: "offline",
    offlineCause: resolveOfflineCause(branch),
  };
}

function baseEffective(
  partial: Omit<
    EffectiveAvailability,
    "offlineCause" | "staffLastSeenAt"
  >,
  branch: BranchAvailabilityFields,
): EffectiveAvailability {
  return {
    ...partial,
    offlineCause: null,
    staffLastSeenAt: branch.staffLastSeenAt ?? null,
  };
}

/**
 * Resuelve estado efectivo:
 * - AUTO → abre/cierra según horario del admin
 * - OPEN → forzar abierta (incluso fuera de horario)
 * - CLOSED → forzar cerrada (incluso en horario)
 * - PAUSED → pausa; si pausedUntil venció → trata como AUTO
 * - Sin heartbeat staff reciente → PAUSED (source offline) si iba a aceptar
 */
export function effectiveAvailability(
  branch: BranchAvailabilityFields,
  now: Date = new Date(),
): EffectiveAvailability {
  const schedule = isWithinBranchHours(branch.hours, now);
  let mode = branch.availability;
  let pausedUntil = branch.pausedUntil;

  if (mode === "PAUSED") {
    if (pausedUntil && pausedUntil.getTime() <= now.getTime()) {
      mode = "AUTO";
      pausedUntil = null;
    } else {
      return baseEffective(
        {
          status: "PAUSED",
          mode: "PAUSED",
          pausedUntil,
          acceptingOrders: false,
          withinSchedule: schedule.within,
          source: "pause",
          todayHoursLabel: schedule.todayHoursLabel,
        },
        branch,
      );
    }
  }

  if (mode === "OPEN") {
    return withStaffPresenceGate(
      baseEffective(
        {
          status: "OPEN",
          mode: "OPEN",
          pausedUntil: null,
          acceptingOrders: true,
          withinSchedule: schedule.within,
          source: "manual",
          todayHoursLabel: schedule.todayHoursLabel,
        },
        branch,
      ),
      branch,
      now,
    );
  }

  if (mode === "CLOSED") {
    return baseEffective(
      {
        status: "CLOSED",
        mode: "CLOSED",
        pausedUntil: null,
        acceptingOrders: false,
        withinSchedule: schedule.within,
        source: "manual",
        todayHoursLabel: schedule.todayHoursLabel,
      },
      branch,
    );
  }

  // AUTO (y PAUSED vencido)
  if (schedule.within) {
    return withStaffPresenceGate(
      baseEffective(
        {
          status: "OPEN",
          mode: "AUTO",
          pausedUntil: null,
          acceptingOrders: true,
          withinSchedule: true,
          source: "schedule",
          todayHoursLabel: schedule.todayHoursLabel,
        },
        branch,
      ),
      branch,
      now,
    );
  }

  return baseEffective(
    {
      status: "CLOSED",
      mode: "AUTO",
      pausedUntil: null,
      acceptingOrders: false,
      withinSchedule: false,
      source: "schedule",
      todayHoursLabel: schedule.todayHoursLabel,
    },
    branch,
  );
}

/** Mode a persistir tras un PATCH (PAUSED vencido → AUTO). */
export function normalizeStoredAvailability(
  availability: BranchAvailability,
  pausedUntil: Date | null,
  now: Date = new Date(),
): { availability: BranchAvailability; pausedUntil: Date | null } {
  if (
    availability === "PAUSED" &&
    pausedUntil &&
    pausedUntil.getTime() <= now.getTime()
  ) {
    return { availability: "AUTO", pausedUntil: null };
  }
  if (availability !== "PAUSED") {
    return { availability, pausedUntil: null };
  }
  return { availability, pausedUntil };
}
