"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  ClipboardList,
  Flame,
  ShoppingBag,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type PeriodStats = {
  ordersCount: number;
  capturedCents: number;
  capturedCount: number;
  averageTicketCents: number;
};

type Dashboard = {
  generatedAt: string;
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  trend: { date: string; capturedCents: number; ordersCount: number }[];
  topBranches: {
    branchId: string;
    name: string;
    capturedCents: number;
    ordersCount: number;
  }[];
  operational: {
    activeOrders: number;
    awaitingAccept: number;
    branchesTotal: number;
    branchesActive: number;
    branchesOpenNow: number;
  };
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    branchName: string;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Autorizado",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
  ACCEPTED: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  PREPARING:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
  READY:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200",
};

const QUICK_LINKS = [
  {
    title: "Menú",
    href: "/menu",
    desc: "Categorías y productos",
    icon: UtensilsCrossed,
  },
  {
    title: "Sucursales",
    href: "/sucursales",
    desc: "Horarios y staff",
    icon: Store,
  },
  {
    title: "Pedidos",
    href: "/pedidos",
    desc: "Vista global",
    icon: ClipboardList,
  },
  {
    title: "Clientes",
    href: "/clientes",
    desc: "Cuentas registradas",
    icon: Users,
  },
  {
    title: "Finanzas",
    href: "/finanzas",
    desc: "Ventas y liquidaciones Stripe",
    icon: Wallet,
  },
];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
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

function formatDayLabel(dateKey: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      weekday: "short",
      day: "2-digit",
    }).format(new Date(`${dateKey}T12:00:00.000Z`));
  } catch {
    return dateKey;
  }
}

export default function AdminHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin sesión no hay fetch que hacer al montar
      setError("Inicia sesión como admin");
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ data: Dashboard }>("/finance/dashboard", token)
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const maxTrend = useMemo(() => {
    if (!data?.trend.length) return 1;
    return Math.max(1, ...data.trend.map((t) => t.capturedCents));
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Resumen operativo de Ordena: pedidos, ventas y sucursales.
        </p>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Hoy",
                value: formatMoney(data.today.capturedCents),
                hint: `${data.today.ordersCount} pedidos`,
                icon: Flame,
                tone: "text-orange-600",
              },
              {
                label: "Últimos 7 días",
                value: formatMoney(data.week.capturedCents),
                hint: `${data.week.ordersCount} pedidos`,
                icon: ShoppingBag,
                tone: "text-gray-900 dark:text-white",
              },
              {
                label: "Este mes",
                value: formatMoney(data.month.capturedCents),
                hint: `${data.month.ordersCount} pedidos`,
                icon: Wallet,
                tone: "text-gray-900 dark:text-white",
              },
              {
                label: "Ticket promedio (mes)",
                value: formatMoney(data.month.averageTicketCents),
                hint: `${data.month.capturedCount} cobrados`,
                icon: ClipboardList,
                tone: "text-gray-900 dark:text-white",
              },
            ].map((card) => (
              <div key={card.label} className="admin-panel">
                <div className="admin-panel-body">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {card.label}
                    </p>
                    <card.icon className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-bold tabular-nums",
                      card.tone,
                    )}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{card.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Link
              href="/sucursales"
              className="admin-panel transition hover:border-orange-300"
            >
              <div className="admin-panel-body flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {data.operational.branchesOpenNow}
                    <span className="text-sm font-medium text-gray-400">
                      {" "}
                      / {data.operational.branchesTotal}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Sucursales aceptando pedidos ahora
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/pedidos"
              className="admin-panel transition hover:border-orange-300"
            >
              <div className="admin-panel-body flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {data.operational.activeOrders}
                  </p>
                  <p className="text-xs text-gray-500">
                    Pedidos en curso (pagado → listo)
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/pedidos"
              className="admin-panel transition hover:border-orange-300"
            >
              <div className="admin-panel-body flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    data.operational.awaitingAccept > 0
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-gray-50 text-gray-400 dark:bg-gray-800",
                  )}
                >
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {data.operational.awaitingAccept}
                  </p>
                  <p className="text-xs text-gray-500">
                    Pedidos esperando ser aceptados
                  </p>
                </div>
              </div>
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="admin-panel lg:col-span-3">
              <div className="admin-panel-header">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Cobrado por día
                </h2>
                <p className="text-xs text-gray-500">Últimos 7 días</p>
              </div>
              <div className="admin-panel-body space-y-2">
                {data.trend.every((t) => t.ordersCount === 0) ? (
                  <p className="text-sm text-gray-500">
                    Sin pedidos en los últimos 7 días.
                  </p>
                ) : (
                  data.trend.map((day) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs capitalize tabular-nums text-gray-500">
                        {formatDayLabel(day.date)}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className="h-full rounded-full bg-orange-500"
                          style={{
                            width: `${Math.max(2, (day.capturedCents / maxTrend) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums text-gray-800 dark:text-gray-200">
                        {formatMoney(day.capturedCents)}
                      </span>
                      <span className="w-8 shrink-0 text-right text-xs text-gray-400">
                        {day.ordersCount}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="admin-panel lg:col-span-2">
              <div className="admin-panel-header">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Top sucursales del mes
                </h2>
              </div>
              <div className="admin-panel-body">
                {data.topBranches.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Sin ventas registradas este mes.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {data.topBranches.map((b, i) => (
                      <li
                        key={b.branchId}
                        className="flex items-center gap-3"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                            {b.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {b.ordersCount} pedidos
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-orange-600">
                          {formatMoney(b.capturedCents)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>

          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                Pedidos recientes
              </h2>
            </div>
            {data.recentOrders.length === 0 ? (
              <div className="admin-panel-body">
                <p className="text-sm text-gray-500">
                  No hay pedidos recientes.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/pedidos/${order.id}`}
                      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-orange-50/70 sm:px-6 dark:hover:bg-orange-950/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              STATUS_TONE[order.status] ??
                                STATUS_TONE.COMPLETED,
                            )}
                          >
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {order.branchName} · {formatDate(order.createdAt)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-orange-600">
                        {formatMoney(order.total)}
                      </p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-orange-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Accesos rápidos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map(({ title, href, desc, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="admin-panel transition hover:border-orange-300"
            >
              <div className="admin-panel-body flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-800 dark:text-white">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-500">{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
