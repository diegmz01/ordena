"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Facebook,
  Mail,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type LoginMethod = "EMAIL" | "GOOGLE" | "FACEBOOK";

type LastOrder = {
  orderNumber: string;
  status: string;
  createdAt: string;
  total: number;
};

type Customer = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  ordersCount: number;
  lastOrder: LastOrder | null;
  loginMethod: LoginMethod;
};

const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = {
  EMAIL: "Correo",
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};

function LoginMethodBadge({ method }: { method: LoginMethod }) {
  if (method === "GOOGLE") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-black text-sky-600 shadow-sm ring-1 ring-sky-200 dark:ring-sky-800">
          G
        </span>
        Google
      </span>
    );
  }
  if (method === "FACEBOOK") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
        <Facebook className="h-3 w-3" />
        Facebook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      <Mail className="h-3 w-3" />
      Correo
    </span>
  );
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function matchesSearch(customer: Customer, raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    customer.name,
    customer.email,
    customer.phone,
    LOGIN_METHOD_LABEL[customer.loginMethod],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | LoginMethod>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Inicia sesión como admin");
      const res = await apiFetch<{ data: Customer[] }>(
        "/customers/admin",
        token,
      );
      setCustomers(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar clientes",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de clientes al montar
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const withOrders = customers.filter((c) => c.ordersCount > 0).length;
    const byGoogle = customers.filter((c) => c.loginMethod === "GOOGLE").length;
    const byFacebook = customers.filter(
      (c) => c.loginMethod === "FACEBOOK",
    ).length;
    return {
      total: customers.length,
      withOrders,
      social: byGoogle + byFacebook,
    };
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (methodFilter !== "all" && c.loginMethod !== methodFilter) {
        return false;
      }
      return matchesSearch(c, search);
    });
  }, [customers, search, methodFilter]);

  const hasActiveFilters = search.trim() !== "" || methodFilter !== "all";

  function clearFilters() {
    setSearch("");
    setMethodFilter("all");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Clientes</h1>
        <p className="page-description">
          Usuarios registrados en la app de clientes.
        </p>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Total",
            value: summary.total,
            hint: "Cuentas registradas",
            tone: "text-gray-900 dark:text-white",
          },
          {
            label: "Con pedidos",
            value: summary.withOrders,
            hint: "Al menos 1 pedido",
            tone: "text-orange-600",
          },
          {
            label: "Login social",
            value: summary.social,
            hint: "Google + Facebook",
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, correo o teléfono…"
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

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(
              [
                ["all", "Todos"],
                ["EMAIL", "Correo"],
                ["GOOGLE", "Google"],
                ["FACEBOOK", "Facebook"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  methodFilter === value
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                )}
                onClick={() => setMethodFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

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
                  de {customers.length}
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
        ) : customers.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <Users className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Aún no hay clientes registrados
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
            {filtered.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/clientes/${customer.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-orange-50/70 sm:gap-4 sm:px-5 dark:hover:bg-orange-950/20"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                    {(customer.name ?? customer.email).charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {customer.name ?? "Sin nombre"}
                      </p>
                      <LoginMethodBadge method={customer.loginMethod} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="truncate">{customer.email}</span>
                      {customer.phone && (
                        <span className="text-gray-400">
                          · {customer.phone}
                        </span>
                      )}
                      <span className="tabular-nums text-gray-400">
                        Alta {formatDate(customer.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    {customer.lastOrder ? (
                      <>
                        <p className="text-sm font-bold tabular-nums text-orange-600">
                          {formatMoney(customer.lastOrder.total)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {customer.ordersCount} pedido
                          {customer.ordersCount === 1 ? "" : "s"}
                        </p>
                      </>
                    ) : (
                      <p className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <UserRound className="h-3 w-3" />
                        Sin pedidos
                      </p>
                    )}
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-orange-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
