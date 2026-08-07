"use client";

import { Banknote, RotateCcw, XCircle } from "lucide-react";

type HistorySummaryProps = {
  salesTotal: string;
  salesCount: number;
  cancelledCount: number;
  cancelledTotal: string;
  refundTotal: string;
  refundCount: number;
};

export function HistorySummary({
  salesTotal,
  salesCount,
  cancelledCount,
  cancelledTotal,
  refundTotal,
  refundCount,
}: HistorySummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="staff-stat-card">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Banknote className="size-3.5 shrink-0 text-emerald-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            Totales
          </p>
        </div>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">
          {salesTotal}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {salesCount} entregado{salesCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="staff-stat-card">
        <div className="flex items-center gap-1.5 text-slate-500">
          <XCircle className="size-3.5 shrink-0 text-rose-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            Cancelaciones
          </p>
        </div>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-rose-600 sm:text-xl">
          {cancelledCount}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{cancelledTotal}</p>
      </div>
      <div className="staff-stat-card">
        <div className="flex items-center gap-1.5 text-slate-500">
          <RotateCcw className="size-3.5 shrink-0 text-amber-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            Devoluciones
          </p>
        </div>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-amber-600 sm:text-xl">
          {refundTotal}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {refundCount} reembolso{refundCount === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
