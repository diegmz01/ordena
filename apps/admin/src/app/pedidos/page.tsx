"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  MapPin,
  Search,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  ptvTicket: number | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  branch: { id: string; name: string };
  user: { name: string | null; email: string; phone: string | null } | null;
};

const STATUS_OPTIONS = [
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Autorizado",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  PENDING_PAYMENT:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  PAID: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
  ACCEPTED: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  PREPARING:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
  READY:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200",
};

type TicketFilter = "all" | "with" | "without";
type DateFilter = "all" | "today" | "yesterday" | "week" | "month" | "custom";

const DATE_FILTER_OPTIONS: [DateFilter, string][] = [
  ["all", "Todas"],
  ["today", "Hoy"],
  ["yesterday", "Ayer"],
  ["week", "Esta semana"],
  ["month", "Este mes"],
  ["custom", "Rango…"],
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

// Los inputs <input type="date"> devuelven YYYY-MM-DD; se interpretan como
// hora local (no UTC) para que "Hoy" refleje el día calendario del navegador.
function parseLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function customerLabel(order: OrderRow) {
  if (order.user) return order.user.name?.trim() || order.user.email;
  return order.guestName?.trim() || "Invitado";
}

function customerInitial(order: OrderRow) {
  const label = customerLabel(order);
  return label.charAt(0).toUpperCase();
}

function matchesSearch(order: OrderRow, raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    order.orderNumber,
    order.ptvTicket != null ? String(order.ptvTicket) : "",
    order.ptvTicket != null ? `ptv #${order.ptvTicket}` : "",
    order.branch.name,
    order.guestName,
    order.guestEmail,
    order.guestPhone,
    order.user?.name,
    order.user?.email,
    order.user?.phone,
    STATUS_LABEL[order.status],
    order.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin sesión no hay fetch que hacer al montar
      setError("Inicia sesión como admin");
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ data: OrderRow[] }>("/orders", token)
      .then((res) => setOrders(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    apiFetch<{ data: { id: string; name: string }[] }>("/branches/admin", token)
      .then((res) =>
        setBranches(
          [...res.data]
            .map((b) => ({ id: b.id, name: b.name }))
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        ),
      )
      .catch(() => {
        // El listado de sucursales es un complemento del filtro; si falla, el
        // selector simplemente no se muestra en vez de romper la página.
      });
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday": {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return { from: startOfDay(y), to: endOfDay(y) };
      }
      case "week":
        return { from: startOfWeek(now), to: endOfDay(now) };
      case "month":
        return { from: startOfMonth(now), to: endOfDay(now) };
      case "custom":
        if (!customFrom && !customTo) return null;
        return {
          from: customFrom ? startOfDay(parseLocalDate(customFrom)) : null,
          to: customTo ? endOfDay(parseLocalDate(customTo)) : null,
        };
      default:
        return null;
    }
  }, [dateFilter, customFrom, customTo]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const status of STATUS_OPTIONS) counts[status] = 0;
    for (const order of orders) {
      counts[order.status] = (counts[order.status] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const summary = useMemo(() => {
    const active = orders.filter((o) =>
      ["PAID", "ACCEPTED", "PREPARING", "READY"].includes(o.status),
    ).length;
    const pendingPay = orders.filter(
      (o) => o.status === "PENDING_PAYMENT",
    ).length;
    const withTicket = orders.filter((o) => o.ptvTicket != null).length;
    return { active, pendingPay, withTicket, total: orders.length };
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (ticketFilter === "with" && order.ptvTicket == null) return false;
      if (ticketFilter === "without" && order.ptvTicket != null) return false;
      if (branchFilter !== "all" && order.branch.id !== branchFilter) {
        return false;
      }
      if (dateRange) {
        const created = new Date(order.createdAt);
        if (dateRange.from && created < dateRange.from) return false;
        if (dateRange.to && created > dateRange.to) return false;
      }
      return matchesSearch(order, search);
    });
  }, [orders, search, statusFilter, ticketFilter, branchFilter, dateRange]);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    ticketFilter !== "all" ||
    branchFilter !== "all" ||
    dateFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTicketFilter("all");
    setBranchFilter("all");
    setDateFilter("all");
    setCustomFrom("");
    setCustomTo("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-description">
            Busca, filtra y abre el detalle de cada orden.
          </p>
        </div>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Total",
            value: summary.total,
            hint: "En el listado",
            tone: "text-gray-900 dark:text-white",
          },
          {
            label: "En cocina",
            value: summary.active,
            hint: "Pagado → listo",
            tone: "text-orange-600",
          },
          {
            label: "Sin pagar",
            value: summary.pendingPay,
            hint: "Esperando Stripe",
            tone: "text-amber-600",
          },
          {
            label: "Con PTV",
            value: summary.withTicket,
            hint: "Ticket asignado",
            tone: "text-sky-600",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {card.label}
            </p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", card.tone)}>
              {loading ? "—" : card.value}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-4 border-b border-gray-200 p-4 sm:p-5 dark:border-gray-700">
          <div
            className={cn(
              "grid grid-cols-1 gap-3",
              branches.length > 1 && "sm:grid-cols-2",
            )}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ORD, PTV, cliente, email o sucursal…"
                className="input-field h-11 pl-10 pr-10"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={() => setSearch("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {branches.length > 1 && (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <select
                  id="branchFilter"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="input-field h-11 appearance-none pl-10"
                >
                  <option value="all">Todas las sucursales</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === "all"
                  ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
              )}
              onClick={() => setStatusFilter("all")}
            >
              Todos
              <span className="ml-1.5 tabular-nums opacity-80">
                {statusCounts.all ?? 0}
              </span>
            </button>
            {STATUS_OPTIONS.map((status) => {
              const count = statusCounts[status] ?? 0;
              if (count === 0 && statusFilter !== status) return null;
              return (
                <button
                  key={status}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    statusFilter === status
                      ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                      : cn(
                          "hover:opacity-90",
                          STATUS_TONE[status] ??
                            "bg-gray-100 text-gray-600 dark:bg-gray-800",
                        ),
                  )}
                  onClick={() => setStatusFilter(status)}
                >
                  {STATUS_LABEL[status]}
                  <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                Fecha
              </span>
              {DATE_FILTER_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    dateFilter === value
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800",
                  )}
                  onClick={() => setDateFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Ticket</span>
              {(
                [
                  ["all", "Todos"],
                  ["with", "Con PTV"],
                  ["without", "Sin PTV"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    ticketFilter === value
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800",
                  )}
                  onClick={() => setTicketFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <div>
                <label htmlFor="dateFrom" className="field-label">
                  Desde
                </label>
                <input
                  id="dateFrom"
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-field h-9 text-sm"
                />
              </div>
              <div>
                <label htmlFor="dateTo" className="field-label">
                  Hasta
                </label>
                <input
                  id="dateTo"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-field h-9 text-sm"
                />
              </div>
              {(customFrom || customTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom("");
                    setCustomTo("");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-3.5 w-3.5" />
                  Quitar rango
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="text-xs text-gray-500">
              {loading ? (
                "Cargando…"
              ) : (
                <>
                  Mostrando{" "}
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {filtered.length}
                  </span>{" "}
                  de {orders.length}
                </>
              )}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-orange-600 transition hover:bg-orange-50 dark:hover:bg-orange-950/30"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-0 divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-4 sm:px-5">
                <div className="h-11 w-11 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="h-3 w-56 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Aún no hay pedidos
            </p>
            <p className="text-xs text-gray-500">
              Cuando los clientes paguen, aparecerán aquí.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <Search className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Sin resultados
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Prueba otra búsqueda o quita algún filtro.
              </p>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary btn-compact"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/pedidos/${order.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-orange-50/70 sm:gap-4 sm:px-5 dark:hover:bg-orange-950/20"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                    {customerInitial(order)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {order.orderNumber}
                      </p>
                      {order.ptvTicket != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-gray-900">
                          <Ticket className="h-3 w-3" />
                          #{order.ptvTicket}
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          STATUS_TONE[order.status] ?? STATUS_TONE.COMPLETED,
                        )}
                      >
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <UserRound className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customerLabel(order)}</span>
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{order.branch.name}</span>
                      </span>
                      <span className="tabular-nums text-gray-400">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-orange-600">
                      {formatMoney(order.total)}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400 transition group-hover:text-orange-500">
                      Ver
                      <ChevronRight className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
