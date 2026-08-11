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
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
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
  onAcknowledge?: () => void;
  acknowledged?: boolean;
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
  onAcknowledge,
  acknowledged,
}: OrderCardProps) {
  const accentClass = STATUS_ACCENT[status] ?? STATUS_ACCENT.ACCEPTED;
  const isNew = status === "PAID";
  const badgeClass = isNew
    ? "staff-order-card-new-pill"
    : (STATUS_BADGE[status] ?? STATUS_BADGE.ACCEPTED);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "staff-order-card cursor-pointer",
        isNew ? "staff-order-card-new" : accentClass,
        isNew && "staff-order-card-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-2xl font-bold tracking-tight tabular-nums",
              isNew ? "text-white" : "text-slate-900 dark:text-white",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-sm font-medium",
              isNew ? "text-white/90" : "text-slate-600 dark:text-slate-300",
            )}
          >
            {customer}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            {ptvTicket != null && (
              <span
                className={
                  isNew
                    ? "text-white"
                    : status === "COMPLETED"
                      ? "text-emerald-600"
                      : "text-orange-600"
                }
              >
                PTV #{ptvTicket}
              </span>
            )}
            {amount && (
              <span
                className={cn(
                  "tabular-nums",
                  isNew
                    ? "text-white"
                    : status === "COMPLETED"
                      ? "text-emerald-600"
                      : "text-orange-600",
                )}
              >
                {amount}
              </span>
            )}
            {timeLabel && (
              <span
                className={cn(
                  "font-medium",
                  isNew ? "text-white/70" : "text-slate-400",
                )}
              >
                {timeLabel}
              </span>
            )}
          </div>
          {isNew && onAcknowledge && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAcknowledge();
              }}
              className={cn(
                "staff-chip mt-2",
                acknowledged ? "staff-chip-new-active" : "staff-chip-new",
              )}
            >
              Visto
            </button>
          )}
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
    </div>
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
