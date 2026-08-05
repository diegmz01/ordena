"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CreditCard,
  ClipboardList,
  History,
  Minus,
  Phone,
  Plus,
  Printer,
  StickyNote,
  User,
} from "lucide-react";
import Pusher from "pusher-js";
import { groupItemsByPlateLabel } from "@ordena/shared";
import { HistorySummary } from "@/components/history-summary";
import {
  OrderCard,
  OrderCardSkeleton,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/components/order-card";
import { Modal } from "@/components/ui/modal";
import { apiFetch, API_URL } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { printOrder } from "@/lib/print";
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
  currency: string;
  ptvTicket: number | null;
  prepMinutes: number | null;
  readyAt: string | null;
  paidAt: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  paymentBrand: string | null;
  paymentFunding: string | null;
  paymentLast4: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string | null;
  items: OrderItem[];
  user: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
  } | null;
};

function formatMoney(cents: number, currency = "mxn") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function customerName(order: Order) {
  return (
    order.user?.name?.trim() ||
    order.guestName?.trim() ||
    order.user?.email ||
    order.guestEmail ||
    "Cliente"
  );
}

function customerPhone(order: Order) {
  return order.user?.phone?.trim() || order.guestPhone?.trim() || null;
}

function displayOrderLabel(order: Order) {
  return order.dayNumber != null ? `#${order.dayNumber}` : order.orderNumber;
}

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCardBrand(brand: string | null) {
  if (!brand) return null;
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "Amex",
    american_express: "Amex",
    discover: "Discover",
    diners: "Diners",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return map[brand.toLowerCase()] ?? brand;
}

function formatCardFunding(funding: string | null) {
  switch (funding) {
    case "credit":
      return "crédito";
    case "debit":
      return "débito";
    case "prepaid":
      return "prepago";
    default:
      return null;
  }
}

function formatPaymentMethodLabel(order: {
  paymentBrand: string | null;
  paymentFunding: string | null;
  paymentLast4: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
}) {
  const brand = formatCardBrand(order.paymentBrand);
  const funding = formatCardFunding(order.paymentFunding);
  const last4 = order.paymentLast4;

  if (brand || funding || last4) {
    const parts = [
      brand,
      funding,
      last4 ? `····${last4}` : null,
    ].filter(Boolean);
    return parts.join(" ");
  }

  if (order.stripeSessionId || order.stripePaymentIntentId) {
    return "Tarjeta / Stripe";
  }
  return "Pago en línea";
}

function paymentInfo(order: Order) {
  const method = formatPaymentMethodLabel(order);
  if (order.status === "CANCELLED") {
    return {
      method,
      statusLabel: "Cancelado / liberado",
      statusClass:
        "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
      hint: "La autorización fue liberada",
    };
  }
  if (order.status === "COMPLETED") {
    return {
      method,
      statusLabel: "Cobrado",
      statusClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
      hint: "Cobro capturado al entregar",
    };
  }
  return {
    method,
    statusLabel: "Autorizado",
    statusClass:
      "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    hint: "Fondos retenidos · se cobra al entregar",
  };
}

export default function BranchHomePage() {
  const [tab, setTab] = useState<"live" | "history">("live");
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historySummary, setHistorySummary] = useState<{
    salesCount: number;
    salesTotal: number;
    cancelledCount: number;
    cancelledTotal: number;
    refundCount: number;
    refundTotal: number;
    currency: string;
  } | null>(null);
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("Ordena");
  const [defaultPrepMinutes, setDefaultPrepMinutes] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acceptTicketOpen, setAcceptTicketOpen] = useState(false);
  const [printFailOpen, setPrintFailOpen] = useState(false);
  const [printFailMessage, setPrintFailMessage] = useState<string | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [prepMinutes, setPrepMinutes] = useState(20);
  const [now, setNow] = useState(() => Date.now());
  const autoReadyRef = useRef<Set<string>>(new Set());

  const selected = useMemo(
    () =>
      orders.find((o) => o.id === selectedId) ??
      historyOrders.find((o) => o.id === selectedId) ??
      null,
    [orders, historyOrders, selectedId],
  );

  const refreshOrders = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    const [res, me] = await Promise.all([
      apiFetch<{
        data: Order[];
        branchId: string;
        prepTimeMinutes: number;
      }>("/orders/branch", token),
      apiFetch<{ data: { name: string } }>("/branches/me", token).catch(
        () => null,
      ),
    ]);
    setOrders(res.data);
    setBranchId(res.branchId);
    setDefaultPrepMinutes(res.prepTimeMinutes);
    if (me?.data?.name) setBranchName(me.data.name);
    setLiveLoading(false);
  }, []);

  const refreshHistory = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await apiFetch<{
        data: Order[];
        businessDate: string;
        summary: {
          salesCount: number;
          salesTotal: number;
          cancelledCount: number;
          cancelledTotal: number;
          refundCount: number;
          refundTotal: number;
          currency: string;
        };
      }>("/orders/branch/history", token);
      setHistoryOrders(res.data);
      setHistorySummary(res.summary);
      setHistoryDate(res.businessDate);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de pedidos en curso al montar
    refreshOrders().catch((err: Error) => {
      setError(err.message);
      setLiveLoading(false);
    });
  }, [refreshOrders]);

  useEffect(() => {
    if (tab !== "history") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del historial al entrar a esa tab
    setError(null);
    refreshHistory().catch((err: Error) => setError(err.message));
  }, [tab, refreshHistory]);

  useEffect(() => {
    if (!branchId || !process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "us2",
      authorizer: (channel) => ({
        authorize: (socketId, callback) => {
          void fetch(`${API_URL}/pusher/auth`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Ordena-Client": "branch",
            },
            body: new URLSearchParams({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`Pusher auth ${response.status}`);
              }
              return response.json();
            })
            .then((data) => callback(null, data))
            .catch((err) => callback(err as Error, null));
        },
      }),
    });
    const channel = pusher.subscribe(`private-branch-${branchId}`);
    channel.bind("pusher:subscription_succeeded", () => setConnected(true));
    const reload = () => {
      refreshOrders().catch(() => undefined);
    };
    channel.bind("order:new", reload);
    channel.bind("order:updated", reload);

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-branch-${branchId}`);
      pusher.disconnect();
    };
  }, [branchId, refreshOrders]);

  useEffect(() => {
    const hasPreparing = orders.some(
      (o) => o.status === "PREPARING" && o.readyAt,
    );
    if (!hasPreparing) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [orders]);

  function applyOrderUpdate(orderId: string, next: Order) {
    if (next.status === "COMPLETED" || next.status === "CANCELLED") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      if (selectedId === orderId) setSelectedId(null);
      if (tab === "history") {
        void refreshHistory().catch(() => undefined);
      }
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...next } : o)),
    );
  }

  async function updateStatus(orderId: string, status: string) {
    const token = getAuthToken();
    if (!token) return;
    const key = `${orderId}:status:${status}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await apiFetch<{ data: Order }>(
        `/orders/${orderId}/status`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      applyOrderUpdate(orderId, res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleUnavailable(order: Order, item: OrderItem) {
    const token = getAuthToken();
    if (!token) return;
    const key = `${order.id}:item:${item.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await apiFetch<{ data: Order }>(
        `/orders/${order.id}/items/${item.id}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ unavailable: !item.unavailable }),
        },
      );
      applyOrderUpdate(order.id, res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al marcar agotado");
    } finally {
      setBusyKey(null);
    }
  }

  async function acceptWithTicket(order: Order) {
    const token = getAuthToken();
    if (!token) return;
    const parsed = Number.parseInt(ticketInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Ingresa un número de ticket PTV válido");
      return;
    }
    const key = `${order.id}:accept`;
    setBusyKey(key);
    setError(null);
    try {
      if (order.status === "PAID") {
        const res = await apiFetch<{ data: Order }>(
          `/orders/${order.id}/accept`,
          token,
          {
            method: "PATCH",
            body: JSON.stringify({ ptvTicket: parsed, prepMinutes }),
          },
        );
        applyOrderUpdate(order.id, res.data);
      } else if (order.status === "ACCEPTED") {
        if (order.ptvTicket == null) {
          const ticketRes = await apiFetch<{ data: Order }>(
            `/orders/${order.id}/ptv-ticket`,
            token,
            {
              method: "PATCH",
              body: JSON.stringify({ ptvTicket: parsed }),
            },
          );
          applyOrderUpdate(order.id, ticketRes.data);
        }
        const prepRes = await apiFetch<{ data: Order }>(
          `/orders/${order.id}/start-prep`,
          token,
          {
            method: "PATCH",
            body: JSON.stringify({ prepMinutes }),
          },
        );
        applyOrderUpdate(order.id, prepRes.data);
      }
      setAcceptTicketOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al aceptar el pedido",
      );
    } finally {
      setBusyKey(null);
    }
  }

  function openAcceptTicket(order: Order) {
    setError(null);
    setPrintFailOpen(false);
    setPrintFailMessage(null);
    setTicketInput(order.ptvTicket != null ? String(order.ptvTicket) : "");
    setPrepMinutes(order.prepMinutes ?? defaultPrepMinutes);
    setAcceptTicketOpen(true);
  }

  async function runPrint(order: Order) {
    await printOrder(
      {
        orderNumber: order.orderNumber,
        dayNumber: order.dayNumber,
        paidAt: order.paidAt,
        notes: order.notes,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        currency: order.currency,
        guestName: order.guestName,
        guestEmail: order.guestEmail,
        guestPhone: order.guestPhone,
        user: order.user,
        items: order.items,
      },
      branchName,
    );
  }

  /** PAID: imprime ticket de cocina y luego pide PTV. */
  async function startAcceptFlow(order: Order) {
    if (order.status !== "PAID") {
      openAcceptTicket(order);
      return;
    }
    const key = `${order.id}:print-accept`;
    setBusyKey(key);
    setError(null);
    setPrintFailOpen(false);
    setPrintFailMessage(null);
    try {
      await runPrint(order);
      openAcceptTicket(order);
    } catch (err) {
      setPrintFailMessage(
        err instanceof Error ? err.message : "No se pudo imprimir el ticket",
      );
      setPrintFailOpen(true);
    } finally {
      setBusyKey(null);
    }
  }

  async function reprintOrder(order: Order) {
    const key = `${order.id}:print`;
    setBusyKey(key);
    setError(null);
    try {
      await runPrint(order);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo imprimir el ticket",
      );
    } finally {
      setBusyKey(null);
    }
  }

  // Auto READY cuando vence el timer
  useEffect(() => {
    for (const order of orders) {
      if (order.status !== "PREPARING" || !order.readyAt) continue;
      const remaining = new Date(order.readyAt).getTime() - now;
      if (remaining > 0) {
        autoReadyRef.current.delete(order.id);
        continue;
      }
      if (autoReadyRef.current.has(order.id)) continue;
      if (busyKey === `${order.id}:status:READY`) continue;
      autoReadyRef.current.add(order.id);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transición automática de estado cuando vence el timer de preparación
      void updateStatus(order.id, "READY");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a now/orders
  }, [now, orders, busyKey]);

  function openOrder(order: Order) {
    setError(null);
    setAcceptTicketOpen(false);
    setSelectedId(order.id);
    setTicketInput(order.ptvTicket != null ? String(order.ptvTicket) : "");
    setPrepMinutes(order.prepMinutes ?? defaultPrepMinutes);
  }


  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title">
            {tab === "live" ? "Pedidos en vivo" : "Historial del día"}
          </h2>
          <p className="page-description">
            {tab === "live"
              ? process.env.NEXT_PUBLIC_PUSHER_KEY
                ? connected
                  ? "Tiempo real activo"
                  : "Conectando Pusher…"
                : "Configura Pusher para tiempo real"
              : historyDate
                ? `Pedidos de hoy · ${historyDate}`
                : "Entregados y cancelados de hoy"}
          </p>
        </div>
        <span className="pwa-section-pill shrink-0">
          {tab === "live"
            ? `${orders.length} activos`
            : `${historyOrders.length} hoy`}
        </span>
      </div>

      <div className="staff-segmented">
        <button
          type="button"
          className={cn(
            "staff-segmented-item gap-1.5",
            tab === "live" && "staff-segmented-item-active",
          )}
          onClick={() => setTab("live")}
        >
          <ClipboardList className="size-4" />
          En vivo
        </button>
        <button
          type="button"
          className={cn(
            "staff-segmented-item gap-1.5",
            tab === "history" && "staff-segmented-item-active",
          )}
          onClick={() => setTab("history")}
        >
          <History className="size-4" />
          Historial
        </button>
      </div>

      {error && !selected && <p className="admin-alert-error">{error}</p>}

      {tab === "history" && historySummary && (
        <HistorySummary
          salesTotal={formatMoney(
            historySummary.salesTotal,
            historySummary.currency,
          )}
          salesCount={historySummary.salesCount}
          cancelledCount={historySummary.cancelledCount}
          cancelledTotal={formatMoney(
            historySummary.cancelledTotal,
            historySummary.currency,
          )}
          refundTotal={formatMoney(
            historySummary.refundTotal,
            historySummary.currency,
          )}
          refundCount={historySummary.refundCount}
        />
      )}

      {tab === "live" ? (
        <ul className="space-y-3">
          {liveLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <OrderCardSkeleton />
              </li>
            ))}
          {!liveLoading &&
            orders.map((order) => {
              const remaining =
                order.status === "PREPARING" && order.readyAt
                  ? new Date(order.readyAt).getTime() - now
                  : null;
              return (
                <li key={order.id}>
                  <OrderCard
                    label={displayOrderLabel(order)}
                    customer={customerName(order)}
                    status={order.status}
                    ptvTicket={order.ptvTicket}
                    countdown={
                      remaining != null ? formatCountdown(remaining) : null
                    }
                    onClick={() => openOrder(order)}
                  />
                </li>
              );
            })}
          {!liveLoading && orders.length === 0 && !error && (
            <li className="staff-empty">
              <ClipboardList className="mb-3 size-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Sin pedidos activos
              </p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Los nuevos pedidos aparecerán aquí en tiempo real.
              </p>
            </li>
          )}
        </ul>
      ) : (
        <ul className="space-y-3">
          {historyLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <OrderCardSkeleton />
              </li>
            ))}
          {!historyLoading &&
            historyOrders.map((order) => (
              <li key={order.id}>
                <OrderCard
                  label={displayOrderLabel(order)}
                  customer={customerName(order)}
                  status={order.status}
                  ptvTicket={order.ptvTicket}
                  amount={formatMoney(order.total, order.currency)}
                  timeLabel={formatDateTime(order.paidAt ?? order.readyAt)}
                  onClick={() => openOrder(order)}
                />
              </li>
            ))}
          {!historyLoading && historyOrders.length === 0 && !error && (
            <li className="staff-empty">
              <History className="mb-3 size-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Aún no hay pedidos finalizados hoy
              </p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Entregas y cancelaciones del día aparecerán aquí.
              </p>
            </li>
          )}
        </ul>
      )}

      {selected && (
        <Modal
          open={!!selected}
          onClose={() => {
            if (printFailOpen) {
              setPrintFailOpen(false);
              setPrintFailMessage(null);
              return;
            }
            if (acceptTicketOpen) {
              setAcceptTicketOpen(false);
              setError(null);
              return;
            }
            setSelectedId(null);
          }}
          title={displayOrderLabel(selected)}
          wide
          headerExtra={
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                STATUS_BADGE[selected.status] ?? STATUS_BADGE.ACCEPTED,
              )}
            >
              {STATUS_LABEL[selected.status] ?? selected.status}
            </span>
          }
          footer={
            <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={!!busyKey}
                onClick={() => void reprintOrder(selected)}
                className="btn-secondary inline-flex w-full items-center justify-center gap-2 py-3.5 text-base sm:order-0 sm:w-auto sm:min-w-[8.5rem] sm:py-3 sm:text-sm"
              >
                <Printer className="size-4 shrink-0" />
                Imprimir
              </button>
              {selected.status === "PAID" && (
                <>
                  <button
                    type="button"
                    disabled={busyKey === `${selected.id}:status:CANCELLED`}
                    onClick={() => void updateStatus(selected.id, "CANCELLED")}
                    className="btn-red w-full py-3.5 text-base sm:order-1 sm:w-auto sm:min-w-[8.5rem] sm:py-3 sm:text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void startAcceptFlow(selected)}
                    className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                  >
                    Aceptar pedido
                  </button>
                </>
              )}
              {selected.status === "ACCEPTED" && (
                <button
                  type="button"
                  disabled={!!busyKey}
                  onClick={() => openAcceptTicket(selected)}
                  className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                >
                  {selected.ptvTicket == null
                    ? "Asignar ticket e iniciar"
                    : "Iniciar preparación"}
                </button>
              )}
              {selected.status === "PREPARING" && (
                <button
                  type="button"
                  disabled={busyKey === `${selected.id}:status:READY`}
                  onClick={() => void updateStatus(selected.id, "READY")}
                  className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                >
                  Listo para recoger
                </button>
              )}
              {selected.status === "READY" && (
                <button
                  type="button"
                  disabled={busyKey === `${selected.id}:status:COMPLETED`}
                  onClick={() => void updateStatus(selected.id, "COMPLETED")}
                  className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                >
                  Entregar · cobrar
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {error && <p className="admin-alert-error">{error}</p>}

            {selected.status === "PAID" && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                Verifica disponibilidad de cada producto antes de aceptar
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:gap-5">
              <section className="min-w-0">
                <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Productos
                </h3>
                <div className="space-y-3">
                  {groupItemsByPlateLabel(selected.items).map((group) => (
                    <div key={group.label ?? "__none"}>
                      {group.label && (
                        <p className="mb-1.5 inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                          {group.label}
                        </p>
                      )}
                      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-border dark:border-border">
                        {group.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start justify-between gap-2 bg-white px-3.5 py-3 dark:bg-surface-muted"
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "text-base font-semibold leading-snug",
                                  item.unavailable
                                    ? "text-slate-400 line-through"
                                    : "text-slate-900 dark:text-white",
                                )}
                              >
                                <span className="mr-1.5 tabular-nums text-slate-500">
                                  {item.quantity}×
                                </span>
                                {item.productName}
                              </p>
                              {item.variantName && (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {item.variantName}
                                </p>
                              )}
                              {item.unavailable && (
                                <p className="mt-0.5 text-xs font-semibold text-rose-600">
                                  Agotado · descuento aplicado
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <p className="text-sm font-bold tabular-nums text-orange-600">
                                {formatMoney(item.lineTotal, selected.currency)}
                              </p>
                              {selected.status === "PAID" && (
                                <button
                                  type="button"
                                  disabled={
                                    busyKey ===
                                    `${selected.id}:item:${item.id}`
                                  }
                                  onClick={() =>
                                    void toggleUnavailable(selected, item)
                                  }
                                  className={
                                    item.unavailable
                                      ? "btn-secondary btn-compact"
                                      : "btn-red btn-compact"
                                  }
                                >
                                  {item.unavailable ? "Restaurar" : "Agotado"}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-1.5 rounded-xl bg-gray-50 px-3.5 py-3.5 text-sm dark:bg-surface-muted">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      {formatMoney(selected.subtotal, selected.currency)}
                    </span>
                  </div>
                  {selected.discount > 0 && (
                    <div className="flex justify-between font-medium text-rose-600">
                      <span>Descuento (agotados)</span>
                      <span className="tabular-nums">
                        −{formatMoney(selected.discount, selected.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-2.5 text-base font-bold text-slate-900 dark:border-border dark:text-white">
                    <span>Total</span>
                    <span className="tabular-nums text-orange-600">
                      {formatMoney(selected.total, selected.currency)}
                    </span>
                  </div>
                </div>
              </section>

              <aside className="flex min-w-0 flex-col gap-3">
                <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 dark:border-border dark:bg-surface-muted">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-surface dark:text-slate-400">
                      <User className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Cliente
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                        {customerName(selected)}
                      </p>
                      {customerPhone(selected) ? (
                        <a
                          href={`tel:${customerPhone(selected)}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
                        >
                          <Phone className="size-3" />
                          {customerPhone(selected)}
                        </a>
                      ) : (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Sin teléfono
                        </p>
                      )}
                      {selected.ptvTicket != null && (
                        <p className="mt-1 text-xs font-semibold text-orange-600">
                          Ticket PTV #{selected.ptvTicket}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {(() => {
                  const pay = paymentInfo(selected);
                  return (
                    <section className="rounded-xl border border-gray-200 p-3.5 dark:border-border dark:bg-surface-muted/80">
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                          <CreditCard className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Forma de pago
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {pay.method}
                            </p>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${pay.statusClass}`}
                            >
                              {pay.statusLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {pay.hint}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-3 space-y-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm dark:bg-surface">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Método</dt>
                          <dd className="text-right font-medium text-slate-800 dark:text-slate-100">
                            {pay.method}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Monto</dt>
                          <dd className="font-semibold tabular-nums text-orange-600">
                            {formatMoney(selected.total, selected.currency)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Autorizado</dt>
                          <dd className="text-right text-xs font-medium text-slate-700 dark:text-slate-200">
                            {formatDateTime(selected.paidAt)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Cobro</dt>
                          <dd className="text-right text-xs font-medium text-slate-700 dark:text-slate-200">
                            {selected.status === "COMPLETED"
                              ? "Capturado al entregar"
                              : "Al marcar Entregar"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  );
                })()}

                {selected.notes && (
                  <section className="flex gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3.5 py-3 dark:border-border dark:bg-surface-muted/50">
                    <StickyNote className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {selected.notes}
                    </p>
                  </section>
                )}

                {selected.status === "PREPARING" && (
                  <section className="rounded-xl bg-orange-50 px-4 py-6 text-center dark:bg-orange-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                      Tiempo restante
                    </p>
                    <p className="mt-1 text-5xl font-bold tabular-nums text-orange-600">
                      {selected.readyAt
                        ? formatCountdown(
                            new Date(selected.readyAt).getTime() - now,
                          )
                        : "—"}
                    </p>
                    {selected.prepMinutes != null && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Estimado: {selected.prepMinutes} min
                      </p>
                    )}
                  </section>
                )}
              </aside>
            </div>
          </div>
        </Modal>
      )}

      {selected &&
        printFailOpen &&
        selected.status === "PAID" && (
          <Modal
            open={printFailOpen}
            nested
            onClose={() => {
              setPrintFailOpen(false);
              setPrintFailMessage(null);
            }}
            title="No se pudo imprimir"
            description={
              printFailMessage ??
              "Revisa la impresora o continúa e imprime después."
            }
            footer={
              <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={!!busyKey}
                  onClick={() => {
                    setPrintFailOpen(false);
                    setPrintFailMessage(null);
                    void startAcceptFlow(selected);
                  }}
                  className="btn-secondary w-full py-3.5 text-base sm:order-1 sm:w-auto sm:min-w-[8.5rem] sm:py-3 sm:text-sm"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  disabled={!!busyKey}
                  onClick={() => {
                    setPrintFailOpen(false);
                    setPrintFailMessage(null);
                    openAcceptTicket(selected);
                  }}
                  className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                >
                  Continuar sin imprimir
                </button>
              </div>
            }
          >
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Puedes asignar el ticket PTV ahora y reimprimir desde el detalle
              del pedido.
            </p>
          </Modal>
        )}

      {selected &&
        acceptTicketOpen &&
        (selected.status === "PAID" || selected.status === "ACCEPTED") && (
          <Modal
            open={acceptTicketOpen}
            nested
            onClose={() => {
              setAcceptTicketOpen(false);
              setError(null);
            }}
            title="Ticket TPV"
            description={`Pedido ${displayOrderLabel(selected)} · ${customerName(selected)}`}
            footer={
              <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={!!busyKey}
                  onClick={() => {
                    setAcceptTicketOpen(false);
                    setError(null);
                  }}
                  className="btn-secondary w-full py-3.5 text-base sm:order-1 sm:w-auto sm:min-w-[8.5rem] sm:py-3 sm:text-sm"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={busyKey === `${selected.id}:accept`}
                  onClick={() => void acceptWithTicket(selected)}
                  className="btn-primary w-full py-3.5 text-base sm:order-2 sm:flex-1 sm:py-3 sm:text-sm"
                >
                  Confirmar e iniciar
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {error && <p className="admin-alert-error">{error}</p>}
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                Debes asignar el ticket TPV para aceptar. El pedido pasa a En
                preparación de inmediato.
              </p>
              <div className="space-y-2">
                <label htmlFor="accept-ptv-ticket" className="field-label">
                  Número de ticket TPV
                </label>
                <input
                  id="accept-ptv-ticket"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={ticketInput}
                  onChange={(e) => setTicketInput(e.target.value)}
                  className="pwa-input"
                  placeholder="Ej. 42"
                  autoFocus
                />
              </div>
              <div className="space-y-3">
                <p className="field-label">Tiempo estimado de preparación</p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Reducir tiempo"
                    disabled={prepMinutes <= 5 || !!busyKey}
                    onClick={() => setPrepMinutes((m) => Math.max(5, m - 5))}
                    className="inline-flex size-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-800 disabled:opacity-40 dark:border-border dark:bg-surface dark:text-white"
                  >
                    <Minus className="size-5" />
                  </button>
                  <p className="min-w-[5rem] text-center text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {prepMinutes}
                    <span className="ml-1 text-sm font-semibold text-slate-500">
                      min
                    </span>
                  </p>
                  <button
                    type="button"
                    aria-label="Aumentar tiempo"
                    disabled={prepMinutes >= 180 || !!busyKey}
                    onClick={() => setPrepMinutes((m) => Math.min(180, m + 5))}
                    className="inline-flex size-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-800 disabled:opacity-40 dark:border-border dark:bg-surface dark:text-white"
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
    </div>
  );
}
