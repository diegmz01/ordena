"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock3,
  LogOut,
  Package,
  ShoppingBag,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken, logout } from "@/lib/auth";
import { formatMoney } from "@/lib/cart";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  dayNumber?: number | null;
  branch: { id: string; name: string };
  items: {
    id: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    lineTotal: number;
    unavailable?: boolean;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Por verificar",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  PENDING_PAYMENT:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  PAID: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  ACCEPTED: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  PREPARING:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  READY:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

const ACTIVE = new Set(["PAID", "ACCEPTED", "PREPARING", "READY"]);

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

function OrderSkeleton() {
  return (
    <div className="customer-card space-y-3 p-4">
      <div className="flex justify-between">
        <div className="skeleton h-5 w-28" />
        <div className="skeleton h-5 w-16" />
      </div>
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
    </div>
  );
}

export default function PedidosPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/pedidos")}`);
      return;
    }

    let cancelled = false;

    Promise.all([
      apiFetch<{ user: { name: string | null; email: string } }>(
        "/auth/me",
        token,
      ),
      apiFetch<{ data: OrderRow[] }>("/orders/mine", token),
    ])
      .then(([me, list]) => {
        if (cancelled) return;
        setName(me.user.name?.trim() || me.user.email);
        setOrders(list.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error");
        if (String(err.message ?? "").includes("401") || !getAuthToken()) {
          void logout();
          router.replace(`/login?next=${encodeURIComponent("/pedidos")}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const { active, past } = useMemo(() => {
    if (!orders) return { active: [] as OrderRow[], past: [] as OrderRow[] };
    return {
      active: orders.filter((o) => ACTIVE.has(o.status)),
      past: orders.filter((o) => !ACTIVE.has(o.status)),
    };
  }, [orders]);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  function OrderCard({ order }: { order: OrderRow }) {
    const summary = order.items
      .slice(0, 2)
      .map((i) => `${i.quantity}× ${i.productName}`)
      .join(", ");
    const extra =
      order.items.length > 2 ? ` +${order.items.length - 2} más` : "";
    const isLive = ACTIVE.has(order.status);

    return (
      <li>
        <Link
          href={`/pedido/${order.id}`}
          className={cn(
            "customer-card group block p-4 transition hover:border-orange-300 hover:shadow-md dark:hover:border-orange-700",
            isLive && "border-orange-300/80 ring-1 ring-orange-500/15",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {order.orderNumber}
                </p>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    STATUS_TONE[order.status] ?? STATUS_TONE.COMPLETED,
                  )}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <Clock3 className="h-3 w-3" />
                {formatDate(order.createdAt)} · {order.branch.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="font-semibold tabular-nums text-orange-600">
                {formatMoney(order.total)}
              </p>
              <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:text-orange-500" />
            </div>
          </div>
          <p className="mt-2 truncate text-sm text-gray-600 dark:text-gray-300">
            {summary}
            {extra}
          </p>
        </Link>
      </li>
    );
  }

  return (
    <div className="pb-28">
      <div className="customer-page-band">
        <div className="container-page max-w-xl !pb-6 !pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Cuenta
          </p>
          <h1 className="page-title mt-1">Mis pedidos</h1>
          <p className="page-description">
            {name ? `Hola, ${name.split(/\s+/)[0]}` : "Tu historial de pedidos"}
          </p>
        </div>
      </div>

      <div className="container-page flex min-h-[calc(100vh-12rem)] max-w-xl flex-col !pt-6">
        {error && <p className="admin-alert-error">{error}</p>}

        {orders === null && !error && (
          <div className="space-y-3">
            <OrderSkeleton />
            <OrderSkeleton />
          </div>
        )}

        {orders && orders.length === 0 && (
          <div className="customer-empty mt-2">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/40">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Aún no tienes pedidos
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Cuando ordenes con tu cuenta, aparecerán aquí.
            </p>
            <Link href="/sucursales" className="btn-primary mt-5 inline-flex">
              Empezar a pedir
            </Link>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="space-y-8">
            {active.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    En curso
                  </h2>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                    {active.length}
                  </span>
                </div>
                <ul className="space-y-3">
                  {active.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-gray-500">
                  Anteriores
                </h2>
                <ul className="space-y-3">
                  {past.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="mt-auto border-t border-gray-200 pt-6 dark:border-gray-700">
          <button
            type="button"
            onClick={handleLogout}
            className="btn-secondary w-full gap-2 py-3"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
