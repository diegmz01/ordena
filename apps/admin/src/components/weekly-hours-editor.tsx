"use client";

import type { BranchDayHours, BranchHours } from "@ordena/shared";
import { cn } from "@/lib/utils";

type DayKey = keyof BranchHours;

export const WEEKLY_HOURS_DAY_KEYS: DayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

export function defaultWeeklyHours(): BranchHours {
  const day: BranchDayHours = { closed: false, open: "09:00", close: "22:00" };
  return {
    mon: { ...day },
    tue: { ...day },
    wed: { ...day },
    thu: { ...day },
    fri: { ...day },
    sat: { ...day },
    sun: { ...day },
  };
}

/** Rellena un objeto parcial/desconocido con defaults, para editar horarios ya guardados. */
export function normalizeWeeklyHours(raw: unknown): BranchHours {
  const base = defaultWeeklyHours();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<Record<DayKey, Partial<BranchDayHours>>>;
  for (const key of WEEKLY_HOURS_DAY_KEYS) {
    const day = obj[key];
    if (!day) continue;
    if (day.closed) {
      base[key] = { closed: true };
    } else {
      base[key] = {
        closed: false,
        open: day.open ?? "09:00",
        close: day.close ?? "22:00",
      };
    }
  }
  return base;
}

type Props = {
  value: BranchHours;
  onChange: (next: BranchHours) => void;
};

export function WeeklyHoursEditor({ value, onChange }: Props) {
  function updateDay(day: DayKey, patch: Partial<BranchDayHours>) {
    const current = value[day];
    if (patch.closed === true) {
      onChange({ ...value, [day]: { closed: true } });
      return;
    }
    const open =
      patch.open ?? (!current.closed ? current.open : undefined) ?? "09:00";
    const close =
      patch.close ?? (!current.closed ? current.close : undefined) ?? "22:00";
    onChange({ ...value, [day]: { closed: false, open, close } });
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      {WEEKLY_HOURS_DAY_KEYS.map((day) => {
        const hours = value[day];
        return (
          <div
            key={day}
            className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[8rem_auto_1fr_auto_1fr]"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {DAY_LABELS[day]}
            </span>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={hours.closed}
                onChange={(e) => updateDay(day, { closed: e.target.checked })}
              />
              Cerrado
            </label>
            <input
              type="time"
              className={cn("input-field", hours.closed && "opacity-40")}
              disabled={hours.closed}
              value={hours.closed ? "" : (hours.open ?? "09:00")}
              onChange={(e) =>
                updateDay(day, { closed: false, open: e.target.value })
              }
            />
            <span className="hidden text-center text-xs text-gray-400 sm:block">
              a
            </span>
            <input
              type="time"
              className={cn("input-field", hours.closed && "opacity-40")}
              disabled={hours.closed}
              value={hours.closed ? "" : (hours.close ?? "22:00")}
              onChange={(e) =>
                updateDay(day, { closed: false, close: e.target.value })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
