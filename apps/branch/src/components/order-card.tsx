"use client";

import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  PAID: "Nuevo",
  ACCEPTED: "Aceptado",
  PREPARING: "En preparación",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_BADGE: Record<string, string> = {
  PAID: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  ACCEPTED: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  PREPARING:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  READY:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  COMPLETED:
    "bg-slate-100 text-slate-700 dark:bg-surface dark:text-slate-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
};

const STATUS_ACCENT: Record<string, string> = {
  PAID: "staff-order-accent-paid",
  ACCEPTED: "staff-order-accent-accepted",
  PREPARING: "staff-order-accent-preparing",
  READY: "staff-order-accent-ready",
  COMPLETED: "staff-order-accent-completed",
  CANCELLED: "staff-order-accent-cancelled",
};

export { STATUS_LABEL, STATUS_BADGE, STATUS_ACCENT };

type OrderCardProps = {
  label: string;
  customer: string;
  status: string;
  ptvTicket?: number | null;
  countdown?: string | null;
  amount?: string | null;
  timeLabel?: string | null;
  onClick: () => void;
};

export function OrderCard({
  label,
  customer,
  status,
  ptvTicket,
  countdown,
  amount,
  timeLabel,
  onClick,
}: OrderCardProps) {
  const badgeClass = STATUS_BADGE[status] ?? STATUS_BADGE.ACCEPTED;
  const accentClass = STATUS_ACCENT[status] ?? STATUS_ACCENT.ACCEPTED;
  const isNew = status === "PAID";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "staff-order-card",
        accentClass,
        isNew && "staff-order-card-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-slate-600 dark:text-slate-300">
            {customer}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            {ptvTicket != null && (
              <span className="text-orange-600">PTV #{ptvTicket}</span>
            )}
            {amount && (
              <span className="tabular-nums text-orange-600">{amount}</span>
            )}
            {timeLabel && (
              <span className="font-medium text-slate-400">{timeLabel}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              badgeClass,
              isNew && "status-pulse",
            )}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
          {countdown != null && (
            <span className="staff-countdown">{countdown}</span>
          )}
        </div>
      </div>
    </button>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="staff-order-card pointer-events-none space-y-3 opacity-80">
      <div className="skeleton h-8 w-16" />
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-3 w-24" />
    </div>
  );
}
