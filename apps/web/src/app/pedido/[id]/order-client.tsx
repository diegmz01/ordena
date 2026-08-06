"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  ChefHat,
  CircleDot,
  Clock3,
  MapPin,
  PackageCheck,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { groupItemsByPlateLabel } from "@ordena/shared";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatMoney, useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

type OrderItem = {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unavailable: boolean;
  plateLabel?: string | null;
};

type Order = {
  id: string;
  orderNumber: string;
  dayNumber: number | null;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  prepMinutes: number | null;
  readyAt: string | null;
  paidAt: string | null;
  items: OrderItem[];
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
  };
};

const FLOW = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
] as const;

const STATUS_META: Record<
  string,
  {
    title: string;
    description: string;
    icon: typeof Clock3;
  }
> = {
  PENDING_PAYMENT: {
    title: "Esperando pago",
    description: "Completa el pago para que la sucursal prepare tu orden.",
    icon: Clock3,
  },
  PAID: {
    title: "Pago autorizado",
    description:
      "Retuvimos el monto. Se cobrará al entregar. La sucursal está revisando tu pedido.",
    icon: CircleDot,
  },
  ACCEPTED: {
    title: "Pedido aceptado",
    description: "Confirmamos tu orden. Pronto empieza la preparación.",
    icon: Check,
  },
  PREPARING: {
    title: "Preparando tu pedido",
    description: "La cocina está armando tu orden.",
    icon: ChefHat,
  },
  READY: {
    title: "¡Listo para recoger!",
    description: "Pasa a la sucursal — tu pedido te espera.",
    icon: PackageCheck,
  },
  COMPLETED: {
    title: "Entregado",
    description: "¡Buen provecho! Gracias por ordenar.",
    icon: UtensilsCrossed,
  },
  CANCELLED: {
    title: "Cancelado",
    description: "Este pedido fue cancelado. Si hubo cobro, se devolvió.",
    icon: X,
  },
};

const STEP_LABEL: Record<(typeof FLOW)[number], string> = {
  PAID: "Recibido",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Entregado",
};

function formatReadyAt(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("es-MX", {
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function OrderTimeline({ status }: { status: string }) {
  if (status === "CANCELLED" || status === "PENDING_PAYMENT") return null;

  const idx = FLOW.indexOf(status as (typeof FLOW)[number]);
  const current = idx < 0 ? 0 : idx;

  return (
    <ol className="relative space-y-0">
      <div className="order-timeline-rail" aria-hidden />
      {FLOW.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
            <span
              className={cn(
                "order-step-dot",
                done && "order-step-dot-done",
                active && "order-step-dot-current",
              )}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                <span className="text-[10px] font-bold">{i + 1}</span>
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  active
                    ? "text-orange-600 dark:text-orange-400"
                    : done
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-400",
                )}
              >
                {STEP_LABEL[step]}
              </p>
              {active && (
                <p className="mt-0.5 text-xs text-gray-500">
                  Estado actual · se actualiza solo
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderPageClient({
  id,
  success,
  viewToken,
}: {
  id: string;
  success?: string;
  viewToken?: string;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { clear } = useCart();

  useEffect(() => {
    if (success) clear();
  }, [success, clear]);

  useEffect(() => {
    if (viewToken) {
      try {
        sessionStorage.setItem(`ordena_order_t:${id}`, viewToken);
      } catch {
        // ignore
      }
    }
  }, [id, viewToken]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        let t = viewToken;
        if (!t) {
          try {
            t = sessionStorage.getItem(`ordena_order_t:${id}`) ?? undefined;
          } catch {
            t = undefined;
          }
        }
        const token = getAuthToken();
        const qs = t ? `?t=${encodeURIComponent(t)}` : "";
        const res = await apiFetch<{ data: Order }>(
          `/orders/${id}${qs}`,
          token,
        );
        if (alive) {
          setOrder(res.data);
          setUpdatedAt(new Date());
          setError(null);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Error al cargar");
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, viewToken]);

  const meta = order
    ? STATUS_META[order.status] ?? {
        title: order.status,
        description: "",
        icon: ShoppingBag,
      }
    : null;

  const readyLabel = useMemo(
    () => formatReadyAt(order?.readyAt ?? null),
    [order?.readyAt],
  );

  const live =
    order &&
    !["COMPLETED", "CANCELLED", "PENDING_PAYMENT"].includes(order.status);

  const Icon = meta?.icon ?? ShoppingBag;
  const displayNumber =
    order?.dayNumber != null ? `#${order.dayNumber}` : order?.orderNumber;

  return (
    <div className="pb-28">
      <section className="customer-page-band">
        <div className="mx-auto max-w-xl px-4 pb-8 pt-8">
          {success && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200">
              <Check className="h-3.5 w-3.5" />
              Pago autorizado
            </p>
          )}
          {!order && !error && (
            <div className="space-y-3">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-10 w-48" />
              <div className="skeleton h-4 w-64" />
            </div>
          )}
          {order && meta && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Pedido {order.orderNumber}
                    {order.dayNumber != null && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                        Día {displayNumber}
                      </span>
                    )}
                  </p>
                  <h1 className="page-title mt-2 text-balance text-3xl tracking-tight sm:text-4xl">
                    {meta.title}
                  </h1>
                  <p className="page-description mt-2 max-w-md text-pretty leading-relaxed sm:text-base">
                    {meta.description}
                  </p>
                  {order.status === "PREPARING" && readyLabel && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200">
                      <Clock3 className="h-3.5 w-3.5" />
                      Estimado listo ~{readyLabel}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300",
                    live && order.status !== "READY" && "status-pulse",
                    order.status === "READY" && "status-pulse",
                  )}
                >
                  <Icon className="h-7 w-7" strokeWidth={2} />
                </div>
              </div>
              {live && (
                <p className="mt-5 flex items-center gap-2 text-xs text-gray-500">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
                  </span>
                  Seguimiento en vivo
                  {updatedAt && (
                    <span className="text-gray-400">
                      · actualizado{" "}
                      {updatedAt.toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <div className="container-page !pt-6 max-w-xl">
        {error && <p className="admin-alert-error mb-4">{error}</p>}

        {order && (
          <div className="space-y-4">
            <div className="customer-card p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Progreso
              </p>
              <OrderTimeline status={order.status} />
            </div>

            <div className="customer-card overflow-hidden">
              <div className="border-b border-gray-100 bg-orange-50/80 px-5 py-3 dark:border-gray-800 dark:bg-orange-950/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                  Recoger en
                </p>
              </div>
              <div className="flex gap-3 p-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {order.branch.name}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {order.branch.address}
                  </p>
                  {order.branch.phone && (
                    <a
                      href={`tel:${order.branch.phone}`}
                      className="mt-2 inline-block text-sm font-medium text-orange-600 hover:underline"
                    >
                      {order.branch.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="customer-card p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Artículos
              </p>
              <ul className="space-y-4">
                {groupItemsByPlateLabel(order.items).map((group) => (
                  <li key={group.label ?? "__none"} className="space-y-2">
                    {group.label && (
                      <p className="text-xs font-semibold text-orange-600">
                        {group.label}
                      </p>
                    )}
                    <ul className="space-y-3">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <div>
                            <p
                              className={cn(
                                "font-medium",
                                item.unavailable
                                  ? "text-gray-400 line-through"
                                  : "text-gray-900 dark:text-white",
                              )}
                            >
                              {item.quantity}× {item.productName}
                            </p>
                            {item.variantName && (
                              <p className="text-xs text-gray-500">
                                {item.variantName}
                              </p>
                            )}
                            {item.unavailable && (
                              <p className="text-xs font-semibold text-red-600">
                                Agotado · descuento aplicado
                              </p>
                            )}
                          </div>
                          <p
                            className={cn(
                              "shrink-0 font-semibold tabular-nums",
                              item.unavailable
                                ? "text-gray-400 line-through"
                                : "text-orange-600",
                            )}
                          >
                            {formatMoney(item.lineTotal)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {formatMoney(order.subtotal)}
                  </span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between font-medium text-red-600">
                    <span>Descuento (agotados)</span>
                    <span className="tabular-nums">
                      −{formatMoney(order.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white">
                  <span>
                    {order.status === "COMPLETED" ? "Cobrado" : "A cobrar"}
                  </span>
                  <span className="tabular-nums text-orange-600">
                    {formatMoney(order.total)}
                  </span>
                </div>
              </div>
              {order.notes && (
                <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  Nota: {order.notes}
                </p>
              )}
            </div>

            {live && (
              <div className="customer-card flex items-start gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/50">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Avisos del pedido
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Activa notificaciones para saber cuando esté listo.
                  </p>
                  <div className="mt-3">
                    <PushOptIn orderId={id} viewToken={viewToken} embedded />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/sucursales"
                className="btn-primary flex-1 justify-center py-3"
              >
                Hacer otro pedido
              </Link>
              <Link
                href="/pedidos"
                className="btn-secondary flex-1 justify-center py-3"
              >
                Mis pedidos
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
