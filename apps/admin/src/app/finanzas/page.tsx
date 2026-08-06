"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string };

type FinanceSummary = {
  from: string;
  to: string;
  branchId: string | null;
  dateBasis: string;
  depositNote: string;
  totals: {
    authorizedCents: number;
    authorizedCount: number;
    capturedCents: number;
    capturedCount: number;
    toDepositCents: number;
    pendingCaptureCents: number;
    pendingCaptureCount: number;
    cancelledCents: number;
    cancelledCount: number;
    averageTicketCents: number;
  };
  byBranch: {
    branchId: string;
    name: string;
    captured: number;
    toDeposit: number;
    authorized: number;
    cancelled: number;
    orderCount: number;
    capturedCount: number;
  }[];
  byDay: {
    date: string;
    captured: number;
    toDeposit: number;
    orderCount: number;
  }[];
  recentCompleted: {
    id: string;
    orderNumber: string;
    total: number;
    toDeposit: number;
    paidAt: string;
    branchName: string;
  }[];
};

type StripeFinance = {
  from: string;
  to: string;
  note: string;
  depositHint: string;
  payoutsTotalCents: number;
  balance: {
    available: { amount: number; currency: string }[];
    pending: { amount: number; currency: string }[];
  };
  payouts: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    method: string | null;
    arrivalDate: string | null;
    created: string;
    destinationLast4: string | null;
  }[];
};

// Se usa la fecha/hora local del navegador (no UTC): el backend interpreta
// estos YYYY-MM-DD como límites de día en la zona horaria del negocio, así
// que "Hoy" debe reflejar el día calendario local, no el día UTC.
function toISODate(d: Date) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatMoney(cents: number, currency = "mxn") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: iso.includes("T") ? "short" : undefined,
    }).format(new Date(iso.length === 10 ? `${iso}T12:00:00.000Z` : iso));
  } catch {
    return iso;
  }
}

const PAYOUT_STATUS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  in_transit: "En tránsito",
  canceled: "Cancelado",
  failed: "Fallido",
};

export default function FinanzasPage() {
  const [from, setFrom] = useState(() => toISODate(daysAgo(29)));
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [stripe, setStripe] = useState<StripeFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const maxCapturedDay = useMemo(() => {
    if (!summary?.byDay.length) return 1;
    return Math.max(1, ...summary.byDay.map((d) => d.toDeposit ?? d.captured));
  }, [summary]);

  const loadBranches = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    const res = await apiFetch<{ data: BranchOption[] }>(
      "/branches/admin",
      token,
    );
    setBranches(res.data.map((b) => ({ id: b.id, name: b.name })));
  }, []);

  const loadSummary = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    if (from > to) {
      setSummary(null);
      setError("La fecha 'Desde' no puede ser posterior a 'Hasta'");
      setLoading(false);
      return;
    }
    try {
      const qs = new URLSearchParams({ from, to });
      if (branchId) qs.set("branchId", branchId);
      const res = await apiFetch<{ data: FinanceSummary }>(
        `/finance/summary?${qs}`,
        token,
      );
      setSummary(res.data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId]);

  const loadStripe = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await apiFetch<{ data: StripeFinance }>(
        `/finance/stripe?${qs}`,
        token,
      );
      setStripe(res.data);
    } catch (err) {
      setStripe(null);
      setStripeError(
        err instanceof Error ? err.message : "No se pudo cargar Stripe",
      );
    } finally {
      setStripeLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de sucursales al montar
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del resumen al montar o cambiar filtros
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de estado de Stripe al montar o cambiar filtros
    void loadStripe();
  }, [loadStripe]);

  function applyPreset(kind: "today" | "7d" | "30d" | "month") {
    const today = toISODate(new Date());
    if (kind === "today") {
      setFrom(today);
      setTo(today);
    } else if (kind === "7d") {
      setFrom(toISODate(daysAgo(6)));
      setTo(today);
    } else if (kind === "30d") {
      setFrom(toISODate(daysAgo(29)));
      setTo(today);
    } else {
      setFrom(toISODate(startOfMonth()));
      setTo(today);
    }
  }

  const t = summary?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Wallet className="size-6 text-orange-500" />
          Finanzas
        </h1>
        <p className="page-description">
          Cobrado vs a depositar por sucursal y periodo. Sin comisión Ordena: el
          capturado liquida a la cuenta bancaria principal. El fee Stripe lo
          paga la plataforma.
        </p>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-body space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Hoy"],
                ["7d", "7 días"],
                ["30d", "30 días"],
                ["month", "Este mes"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className="btn-secondary btn-compact"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="from">
                Desde
              </label>
              <input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="to">
                Hasta
              </label>
              <input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="branch">
                Sucursal
              </label>
              <select
                id="branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="input-field"
              >
                <option value="">Todas</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {error && <p className="admin-alert-error">{error}</p>}

      {loading && !summary ? (
        <div className="skeleton h-32 w-full rounded-xl" />
      ) : summary && t ? (
        <>
          {summary.depositNote && (
            <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200">
              {summary.depositNote}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Cobrado (capturado)",
                value: formatMoney(t.capturedCents),
                hint: `${t.capturedCount} pedidos COMPLETED`,
              },
              {
                label: "A depositar (sucursal)",
                value: formatMoney(t.toDepositCents ?? t.capturedCents),
                hint: "Sin comisión Ordena (= capturado)",
              },
              {
                label: "Pendiente de captura",
                value: formatMoney(t.pendingCaptureCents),
                hint: `${t.pendingCaptureCount} autorizados sin completar`,
              },
              {
                label: "Ticket promedio",
                value: formatMoney(t.averageTicketCents),
                hint: "Sobre pedidos cobrados",
              },
            ].map((kpi) => (
              <div key={kpi.label} className="admin-panel">
                <div className="admin-panel-body">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {kpi.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{kpi.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="font-semibold text-gray-800 dark:text-white">
                Por sucursal
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Sucursal</th>
                    <th className="px-4 py-3 font-semibold">Cobrado</th>
                    <th className="px-4 py-3 font-semibold">A depositar</th>
                    <th className="px-4 py-3 font-semibold">Autorizado</th>
                    <th className="px-4 py-3 font-semibold">Cancelado</th>
                    <th className="px-4 py-3 font-semibold">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.byBranch.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Sin pedidos en el rango.
                      </td>
                    </tr>
                  ) : (
                    summary.byBranch.map((row) => (
                      <tr key={row.branchId}>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">
                          {row.name}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatMoney(row.captured)}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatMoney(row.toDeposit ?? row.captured)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatMoney(row.authorized)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatMoney(row.cancelled)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {row.orderCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="font-semibold text-gray-800 dark:text-white">
                A depositar por día
              </h2>
            </div>
            <div className="admin-panel-body space-y-2">
              {summary.byDay.length === 0 ? (
                <p className="text-sm text-gray-500">Sin datos diarios.</p>
              ) : (
                summary.byDay.map((day) => {
                  const amount = day.toDeposit ?? day.captured;
                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs tabular-nums text-gray-500">
                        {formatDate(day.date)}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className="h-full rounded-full bg-orange-500"
                          style={{
                            width: `${Math.max(2, (amount / maxCapturedDay) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs font-medium tabular-nums text-gray-800 dark:text-gray-200">
                        {formatMoney(amount)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs text-gray-400">
                        {day.orderCount}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="font-semibold text-gray-800 dark:text-white">
                Últimos cobros
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Pedido</th>
                    <th className="px-4 py-3 font-semibold">Sucursal</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">A depositar</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.recentCompleted.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No hay pedidos completados en el rango.
                      </td>
                    </tr>
                  ) : (
                    summary.recentCompleted.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 dark:text-white">
                            {o.orderNumber}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(o.paidAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {o.branchName}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatMoney(o.total)}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatMoney(o.toDeposit ?? o.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/pedidos/${o.id}`}
                            className="link-action inline-flex items-center gap-1"
                          >
                            Ver
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white">
              Liquidaciones Stripe (banco)
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {stripe?.depositHint ??
                stripe?.note ??
                "Balance y payouts de la cuenta bancaria principal (todas las sucursales)."}{" "}
              Rango por fecha de creación del payout.
            </p>
          </div>
        </div>
        <div className="admin-panel-body space-y-4">
          {stripeError && (
            <p className="admin-alert-error !mb-0">{stripeError}</p>
          )}
          {stripeLoading && !stripe ? (
            <div className="skeleton h-20 w-full rounded-lg" />
          ) : stripe ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    Disponible
                  </p>
                  <ul className="mt-2 space-y-1">
                    {stripe.balance.available.length === 0 ? (
                      <li className="text-sm text-gray-500">—</li>
                    ) : (
                      stripe.balance.available.map((b) => (
                        <li
                          key={`a-${b.currency}`}
                          className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300"
                        >
                          {formatMoney(b.amount, b.currency)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    Pendiente
                  </p>
                  <ul className="mt-2 space-y-1">
                    {stripe.balance.pending.length === 0 ? (
                      <li className="text-sm text-gray-500">—</li>
                    ) : (
                      stripe.balance.pending.map((b) => (
                        <li
                          key={`p-${b.currency}`}
                          className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300"
                        >
                          {formatMoney(b.amount, b.currency)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    Payouts en el rango
                  </p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatMoney(stripe.payoutsTotalCents ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Suma paid / pending / in_transit
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/60">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Fecha</th>
                      <th className="px-3 py-2.5 font-semibold">Monto</th>
                      <th className="px-3 py-2.5 font-semibold">Estado</th>
                      <th className="px-3 py-2.5 font-semibold">Llegada</th>
                      <th className="px-3 py-2.5 font-semibold">Cuenta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {stripe.payouts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No hay payouts en este rango (o la cuenta aún no ha
                          liquidado).
                        </td>
                      </tr>
                    ) : (
                      stripe.payouts.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">
                            {formatDate(p.created)}
                          </td>
                          <td className="px-3 py-2.5 font-medium tabular-nums">
                            {formatMoney(p.amount, p.currency)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                p.status === "paid"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                              )}
                            >
                              {PAYOUT_STATUS[p.status] ?? p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">
                            {p.arrivalDate
                              ? formatDate(p.arrivalDate)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {p.destinationLast4
                              ? `···· ${p.destinationLast4}`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
