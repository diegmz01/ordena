"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Clock3,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  StickyNote,
  Ticket,
  UserRound,
  Ban,
  Undo2,
} from "lucide-react";
import {
  canAdminCancelOrder,
  comboProductName,
  getPaidOrderWaitStatus,
  groupItemsByPlateLabel,
  orderPaymentAmounts,
  type OrderStatus,
} from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

type OrderItem = {
  id: string;
  productName: string;
  variantName: string | null;
  secondaryProductName?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unavailable: boolean;
  plateLabel?: string | null;
};

type RefundItemEntry = {
  id: string;
  orderItemId: string;
  quantity: number;
  amount: number;
};

type RefundEntry = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  items: RefundItemEntry[];
};

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
  refundedTotal: number;
  currency: string;
  notes: string | null;
  cancellationReason: string | null;
  ptvTicket: number | null;
  pickupCode: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  paymentBrand: string | null;
  paymentFunding: string | null;
  paymentLast4: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyReachedAt: string | null;
  completedAt: string | null;
  captureFailedAt: string | null;
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
  };
  items: OrderItem[];
  refunds: RefundEntry[];
  user: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
  } | null;
};

const FLOW = [
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PAID: "Autorizado",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo para recoger",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_HINT: Record<string, string> = {
  PAID: "Fondos retenidos. Verifica disponibilidad antes de aceptar; el cobro es al quedar listo para recoger.",
  ACCEPTED: "La sucursal aceptó el pedido.",
  PREPARING: "El pedido se está preparando.",
  READY: "Listo para que el cliente recoja. Cobro capturado por el monto de artículos disponibles.",
  COMPLETED: "Pedido entregado.",
  CANCELLED: "Este pedido fue cancelado.",
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

function formatMoney(cents: number, currency = "mxn") {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatWaitLabel(elapsedMs: number) {
  const minutes = Math.floor(elapsedMs / 60_000);
  return `Esperando ${minutes} min`;
}

function formatTime(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return null;
  }
}

function formatStepDuration(fromIso: string, toIso: string) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return "<1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `+${hours}h ${minutes}min` : `+${minutes} min`;
}

const STEP_TIMESTAMP_FIELD = {
  PAID: "paidAt",
  ACCEPTED: "acceptedAt",
  PREPARING: "preparingAt",
  READY: "readyReachedAt",
  COMPLETED: "completedAt",
} as const satisfies Record<(typeof FLOW)[number], keyof OrderDetail>;

function paymentStatus(order: OrderDetail) {
  if (order.status === "CANCELLED") {
    return { label: "Cancelado", tone: STATUS_TONE.CANCELLED };
  }
  if (order.status === "COMPLETED") {
    return { label: "Cobrado", tone: STATUS_TONE.COMPLETED };
  }
  return { label: "Autorizado", tone: STATUS_TONE.PAID };
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
    return [brand, funding, last4 ? `····${last4}` : null]
      .filter(Boolean)
      .join(" ");
  }

  if (order.stripeSessionId || order.stripePaymentIntentId) {
    return "Stripe Checkout";
  }
  return "Sin método registrado";
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [ticketInput, setTicketInput] = useState("");
  const [ticketPending, setTicketPending] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundPending, setRefundPending] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSelection, setRefundSelection] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin sesión no hay fetch que hacer al montar
      setError("Inicia sesión como admin");
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch<{ data: OrderDetail }>(`/orders/${id}`, token)
      .then((res) => {
        setOrder(res.data);
        setTicketInput(
          res.data.ptvTicket != null ? String(res.data.ptvTicket) : "",
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function openTicketModal() {
    setTicketInput(order?.ptvTicket != null ? String(order.ptvTicket) : "");
    setTicketError(null);
    setTicketModalOpen(true);
  }

  function closeTicketModal() {
    if (ticketPending) return;
    setTicketModalOpen(false);
    setTicketError(null);
    setTicketInput(order?.ptvTicket != null ? String(order.ptvTicket) : "");
  }

  async function savePtvTicket(ptvTicket: number | null) {
    if (!order) return;
    const token = getAuthToken();
    if (!token) {
      setTicketError("Sesión no válida");
      return;
    }

    setTicketPending(true);
    setTicketError(null);
    try {
      const res = await apiFetch<{ data: OrderDetail }>(
        `/orders/${order.id}/ptv-ticket`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ ptvTicket }),
        },
      );
      setOrder(res.data);
      setTicketInput(
        res.data.ptvTicket != null ? String(res.data.ptvTicket) : "",
      );
      setTicketModalOpen(false);
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setTicketPending(false);
    }
  }

  async function onSubmitTicket(event: FormEvent) {
    event.preventDefault();
    const trimmed = ticketInput.trim();
    if (trimmed === "") {
      setTicketError("Ingresa un número de ticket");
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      setTicketError("Ingresa un número entero mayor a 0");
      return;
    }
    await savePtvTicket(n);
  }

  function openCancelModal() {
    setCancelError(null);
    setCancelReason("");
    setCancelModalOpen(true);
  }

  function closeCancelModal() {
    if (cancelPending) return;
    setCancelModalOpen(false);
    setCancelError(null);
  }

  async function confirmAdminCancel() {
    if (!order) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Ingresa el motivo de cancelación");
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setCancelError("Sesión no válida");
      return;
    }

    setCancelPending(true);
    setCancelError(null);
    try {
      const res = await apiFetch<{ data: OrderDetail }>(
        `/orders/${order.id}/admin-cancel`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ cancellationReason: reason }),
        },
      );
      setOrder(res.data);
      setCancelModalOpen(false);
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Error al cancelar el pedido",
      );
    } finally {
      setCancelPending(false);
    }
  }

  const refundedQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (!order) return map;
    for (const refund of order.refunds) {
      for (const line of refund.items) {
        map.set(
          line.orderItemId,
          (map.get(line.orderItemId) ?? 0) + line.quantity,
        );
      }
    }
    return map;
  }, [order]);

  const refundableItems = useMemo(() => {
    if (!order) return [];
    return order.items
      .filter((item) => !item.unavailable)
      .map((item) => ({
        item,
        remaining: item.quantity - (refundedQtyByItem.get(item.id) ?? 0),
      }))
      .filter((row) => row.remaining > 0);
  }, [order, refundedQtyByItem]);

  const canPartialRefund =
    order != null &&
    (order.status === "READY" || order.status === "COMPLETED") &&
    order.total - order.refundedTotal > 0 &&
    refundableItems.length > 0;

  const refundAmount = refundableItems.reduce((sum, { item }) => {
    const qty = refundSelection[item.id] ?? 0;
    return sum + qty * item.unitPrice;
  }, 0);

  function openRefundModal() {
    setRefundError(null);
    setRefundReason("");
    setRefundSelection({});
    setRefundModalOpen(true);
  }

  function closeRefundModal() {
    if (refundPending) return;
    setRefundModalOpen(false);
    setRefundError(null);
  }

  function setRefundQty(itemId: string, qty: number, max: number) {
    const clamped = Math.max(0, Math.min(qty, max));
    setRefundSelection((prev) => ({ ...prev, [itemId]: clamped }));
    setRefundError(null);
  }

  async function confirmPartialRefund() {
    if (!order) return;
    const reason = refundReason.trim();
    if (!reason) {
      setRefundError("Ingresa el motivo de la devolución");
      return;
    }
    const items = Object.entries(refundSelection)
      .filter(([, qty]) => qty > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0) {
      setRefundError("Selecciona al menos un producto a devolver");
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setRefundError("Sesión no válida");
      return;
    }

    setRefundPending(true);
    setRefundError(null);
    try {
      const res = await apiFetch<{ data: OrderDetail }>(
        `/orders/${order.id}/refund`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ reason, items }),
        },
      );
      setOrder(res.data);
      setRefundModalOpen(false);
    } catch (err) {
      setRefundError(
        err instanceof Error ? err.message : "Error al generar la devolución",
      );
    } finally {
      setRefundPending(false);
    }
  }

  const customer = useMemo(() => {
    if (!order) return null;
    if (order.user) {
      return {
        kind: "account" as const,
        name: order.user.name?.trim() || "Sin nombre",
        email: order.user.email,
        phone: order.user.phone?.trim() || null,
        initial: (order.user.name?.trim() || order.user.email).charAt(0).toUpperCase(),
      };
    }
    return {
      kind: "guest" as const,
      name: order.guestName?.trim() || "Invitado",
      email: order.guestEmail,
      phone: order.guestPhone,
      initial: (order.guestName?.trim() || "I").charAt(0).toUpperCase(),
    };
  }, [order]);

  const flowIndex =
    order && order.status !== "CANCELLED"
      ? FLOW.indexOf(order.status as (typeof FLOW)[number])
      : -1;

  const itemCount = order
    ? order.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  const pay = order ? paymentStatus(order) : null;

  const canCancel =
    order != null && canAdminCancelOrder(order.status as OrderStatus);

  if (!id) {
    return (
      <div className="space-y-4">
        <p className="admin-alert-error">Pedido no válido</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Pedidos
        </Link>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}

      {loading && (
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100 lg:col-span-2 dark:bg-gray-800" />
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      )}

      {order && customer && pay && !loading && (
        <>
          <header className="overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-white dark:border-orange-900/40 dark:from-orange-950/40 dark:via-gray-900 dark:to-gray-900">
            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      STATUS_TONE[order.status] ?? STATUS_TONE.COMPLETED,
                    )}
                  >
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      pay.tone,
                    )}
                  >
                    Pago: {pay.label}
                  </span>
                  {order.ptvTicket != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">
                      <Ticket className="h-3 w-3" />
                      PTV #{order.ptvTicket}
                    </span>
                  )}
                  {(() => {
                    const wait = getPaidOrderWaitStatus(
                      order.status,
                      order.paidAt,
                      now,
                    );
                    if (!wait) return null;
                    return (
                      <span
                        className={
                          wait.tone === "danger"
                            ? "status-badge-danger"
                            : "status-badge-warning"
                        }
                      >
                        {formatWaitLabel(wait.elapsedMs)}
                      </span>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pedido
                  </p>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                    {order.orderNumber}
                  </h1>
                  <p className="mt-1 max-w-xl text-sm text-gray-600 dark:text-gray-300">
                    {STATUS_HINT[order.status]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    Creado {formatDate(order.createdAt)}
                  </span>
                  <span>Actualizado {formatDate(order.updatedAt)}</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-3 text-right backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total
                  </p>
                  <p className="text-3xl font-bold text-orange-600">
                    {formatMoney(order.total, order.currency)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {itemCount} artículo{itemCount === 1 ? "" : "s"} ·{" "}
                    {order.items.length} línea
                    {order.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-stretch">
                  {(order.ptvTicket != null ||
                    order.status === "COMPLETED") && (
                    <button
                      type="button"
                      onClick={openTicketModal}
                      className="btn-primary inline-flex items-center justify-center gap-2"
                    >
                      <Ticket className="h-4 w-4" />
                      {order.ptvTicket != null
                        ? `Ticket PTV #${order.ptvTicket}`
                        : "Asignar ticket PTV"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {order.status === "CANCELLED" ? (
              <div className="border-t border-red-200/70 bg-red-50 px-5 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200 sm:px-6">
                <p>Pedido cancelado. No continúa en el flujo de preparación.</p>
                {order.cancellationReason && (
                  <p className="mt-1">
                    <span className="font-semibold">Motivo:</span>{" "}
                    {order.cancellationReason}
                  </p>
                )}
              </div>
            ) : (
              <div className="border-t border-emerald-100 px-5 py-4 dark:border-emerald-900/30 sm:px-6">
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {FLOW.map((step, index) => {
                    const done = flowIndex > index;
                    const current = flowIndex === index;
                    const timestamp = order[STEP_TIMESTAMP_FIELD[step]] as
                      | string
                      | null;
                    const previousTimestamp = FLOW.slice(0, index)
                      .reverse()
                      .map((s) => order[STEP_TIMESTAMP_FIELD[s]] as string | null)
                      .find((ts) => ts != null);
                    const duration =
                      timestamp && previousTimestamp
                        ? formatStepDuration(previousTimestamp, timestamp)
                        : null;
                    return (
                      <li
                        key={step}
                        className={cn(
                          "rounded-lg px-2 py-2 text-center",
                          current &&
                            "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25",
                          done &&
                            !current &&
                            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
                          !done &&
                            !current &&
                            "bg-gray-50 text-gray-400 dark:bg-gray-800/60 dark:text-gray-500",
                        )}
                      >
                        <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                          {done ? <Check className="h-3 w-3" /> : index + 1}
                        </span>
                        <p className="text-[10px] font-semibold leading-tight sm:text-[11px]">
                          {STATUS_LABEL[step]}
                        </p>
                        {timestamp && (
                          <p className="mt-0.5 text-[9px] font-medium leading-tight opacity-80 sm:text-[10px]">
                            {formatTime(timestamp)}
                          </p>
                        )}
                        {duration && (
                          <p className="text-[9px] leading-tight opacity-70 sm:text-[10px]">
                            {duration}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <section className="admin-panel overflow-hidden">
                <div className="admin-panel-header">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      Artículos del pedido
                    </h2>
                    <p className="text-xs text-gray-500">
                      Lo que el cliente ordenó para recoger
                    </p>
                  </div>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {groupItemsByPlateLabel(order.items).map((group) => (
                    <div key={group.label ?? "__none"}>
                      {group.label && (
                        <p className="bg-orange-50/80 px-4 py-2 text-xs font-semibold text-orange-700 sm:px-6 dark:bg-orange-950/30 dark:text-orange-300">
                          {group.label}
                        </p>
                      )}
                      <ul>
                        {group.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-3 px-4 py-3.5 sm:px-6"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                              {item.quantity}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "font-medium",
                                  item.unavailable
                                    ? "text-gray-400 line-through"
                                    : "text-gray-900 dark:text-white",
                                )}
                              >
                                {comboProductName(
                                  item.productName,
                                  item.secondaryProductName,
                                )}
                              </p>
                              {item.variantName && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {item.variantName}
                                </p>
                              )}
                              {item.unavailable ? (
                                <p className="mt-1 text-xs font-semibold text-red-600">
                                  Agotado · descuento aplicado
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-gray-400">
                                  {formatMoney(item.unitPrice, order.currency)}{" "}
                                  c/u
                                </p>
                              )}
                            </div>
                            <p
                              className={cn(
                                "shrink-0 text-sm font-semibold",
                                item.unavailable
                                  ? "text-gray-400 line-through"
                                  : "text-gray-900 dark:text-white",
                              )}
                            >
                              {formatMoney(item.lineTotal, order.currency)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t border-gray-100 bg-gray-50/80 px-4 py-4 sm:px-6 dark:border-gray-700 dark:bg-gray-800/40">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                    <span>Subtotal</span>
                    <span>{formatMoney(order.subtotal, order.currency)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-sm font-medium text-red-600">
                      <span>Descuento (agotados)</span>
                      <span>−{formatMoney(order.discount, order.currency)}</span>
                    </div>
                  )}
                  {order.serviceFee > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                      <span>Tarifa de servicios</span>
                      <span>{formatMoney(order.serviceFee, order.currency)}</span>
                    </div>
                  )}
                  {order.status === "CANCELLED" && order.paidAt != null && (
                    <div className="flex justify-between text-sm font-medium text-red-600">
                      <span>Devolución</span>
                      <span>−{formatMoney(order.total, order.currency)}</span>
                    </div>
                  )}
                  {order.status !== "CANCELLED" && order.refundedTotal > 0 && (
                    <div className="flex justify-between text-sm font-medium text-red-600">
                      <span>Reembolsado</span>
                      <span>
                        −{formatMoney(order.refundedTotal, order.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white">
                    <span>
                      {order.status === "READY" || order.status === "COMPLETED"
                        ? "Cobrado"
                        : "A cobrar"}
                    </span>
                    <span className="text-orange-600">
                      {formatMoney(
                        order.status === "CANCELLED"
                          ? 0
                          : order.total - order.refundedTotal,
                        order.currency,
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {order.notes && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
                  <div className="flex items-start gap-3">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        Notas del cliente
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                        {order.notes}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Recolección
                  </h2>
                </div>
                <div className="admin-panel-body">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {order.branch.name}
                      </p>
                      <p className="mt-0.5 text-gray-500">{order.branch.address}</p>
                      {order.branch.phone && (
                        <a
                          href={`tel:${order.branch.phone}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-orange-600 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {order.branch.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4 lg:col-span-2">
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Cliente
                  </h2>
                </div>
                <div className="admin-panel-body space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                      {customer.initial}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">
                        {customer.name}
                      </p>
                      <p className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <UserRound className="h-3 w-3" />
                        {customer.kind === "account"
                          ? "Cuenta registrada"
                          : "Pedido como invitado"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {customer.email ? (
                      <a
                        href={`mailto:${customer.email}`}
                        className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition hover:border-orange-300 hover:bg-orange-50/50 dark:border-gray-700 dark:hover:border-orange-800 dark:hover:bg-orange-950/20"
                      >
                        <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="min-w-0 break-all text-gray-800 dark:text-gray-100">
                          {customer.email}
                        </span>
                      </a>
                    ) : (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                        Sin email
                      </p>
                    )}
                    {customer.phone ? (
                      <a
                        href={`tel:${customer.phone}`}
                        className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition hover:border-orange-300 hover:bg-orange-50/50 dark:border-gray-700 dark:hover:border-orange-800 dark:hover:bg-orange-950/20"
                      >
                        <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {customer.phone}
                        </span>
                      </a>
                    ) : (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                        Sin teléfono
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Pago
                  </h2>
                </div>
                <div className="admin-panel-body space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatPaymentMethodLabel(order)}
                      </p>
                    </div>
                  </div>

                  <dl className="space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Estado</dt>
                      <dd>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                            pay.tone,
                          )}
                        >
                          {pay.label}
                        </span>
                      </dd>
                    </div>
                    {(() => {
                      const amounts = orderPaymentAmounts(order);
                      return (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-gray-500">
                              {amounts.combined
                                ? "Monto autorizado y cobrado"
                                : "Monto autorizado"}
                            </dt>
                            <dd className="font-semibold text-orange-600">
                              {formatMoney(amounts.authorized, order.currency)}
                            </dd>
                          </div>
                          {amounts.showCharged && !amounts.combined && (
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-gray-500">Monto cobrado</dt>
                              <dd className="font-semibold text-orange-600">
                                {formatMoney(amounts.charged, order.currency)}
                              </dd>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Autorizado en</dt>
                      <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                        {formatDate(order.paidAt)}
                      </dd>
                    </div>
                    {order.pickupCode && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-gray-500">Código de entrega</dt>
                        <dd className="font-mono text-base font-bold tracking-[0.2em] text-gray-900 dark:text-white">
                          {order.pickupCode}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Moneda</dt>
                      <dd className="font-medium uppercase text-gray-800 dark:text-gray-100">
                        {order.currency}
                      </dd>
                    </div>
                  </dl>

                  {order.captureFailedAt && (
                    <p className="admin-alert-error">
                      No se pudo cobrar este pedido automáticamente al
                      quedar listo — probablemente el hold de autorización
                      de Stripe ya expiró (~7 días sin capturar). Cancela el
                      pedido para reflejarlo correctamente; no hay fondos
                      pendientes de cobrar.
                    </p>
                  )}

                  {(order.stripeSessionId || order.stripePaymentIntentId) && (
                    <details className="rounded-xl border border-gray-200 dark:border-gray-700">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                        Referencias Stripe
                      </summary>
                      <div className="space-y-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
                        {order.stripeSessionId && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">
                              Session
                            </p>
                            <p className="break-all font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {order.stripeSessionId}
                            </p>
                          </div>
                        )}
                        {order.stripePaymentIntentId && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400">
                              Payment intent
                            </p>
                            <p className="break-all font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {order.stripePaymentIntentId}
                            </p>
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {order.refunds.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Reembolsos
                      </p>
                      <ul className="space-y-2">
                        {order.refunds.map((refund) => (
                          <li
                            key={refund.id}
                            className="rounded-lg bg-gray-50 p-2.5 text-xs dark:bg-gray-800/50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-red-600">
                                −{formatMoney(refund.amount, order.currency)}
                              </span>
                              <span className="text-gray-400">
                                {formatDate(refund.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-gray-600 dark:text-gray-300">
                              {refund.reason}
                            </p>
                            <p className="mt-1 text-gray-400">
                              {refund.items
                                .map((line) => {
                                  const product = order.items.find(
                                    (i) => i.id === line.orderItemId,
                                  );
                                  const name = comboProductName(
                                    product?.productName ?? "Producto",
                                    product?.secondaryProductName,
                                  );
                                  return `${line.quantity}× ${name}`;
                                })
                                .join(", ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {canPartialRefund && (
                    <button
                      type="button"
                      onClick={openRefundModal}
                      className="btn-secondary inline-flex w-full items-center justify-center gap-2"
                    >
                      <Undo2 className="h-4 w-4" />
                      Reembolso parcial
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      onClick={openCancelModal}
                      className="btn-red inline-flex w-full items-center justify-center gap-2"
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar y devolver
                    </button>
                  )}

                </div>
              </section>
            </aside>
          </div>

          <Modal
            open={ticketModalOpen}
            onClose={closeTicketModal}
            title={
              order.ptvTicket != null
                ? "Editar ticket PTV"
                : "Asignar ticket PTV"
            }
            description="Número que aparece en la pantalla de cocina / PTV. La asignación inicial la hace el staff de sucursal."
          >
            <form onSubmit={onSubmitTicket} className="space-y-4">
              <div>
                <label htmlFor="ptvTicketModal" className="field-label">
                  Número de ticket
                </label>
                <input
                  id="ptvTicketModal"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  autoFocus
                  placeholder="Ej. 42"
                  value={ticketInput}
                  onChange={(e) => {
                    setTicketInput(e.target.value);
                    setTicketError(null);
                  }}
                  className="input-field mt-1 text-lg font-semibold"
                />
              </div>
              {ticketError && (
                <p className="text-sm text-red-600">{ticketError}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                {order.ptvTicket != null && (
                  <button
                    type="button"
                    disabled={ticketPending}
                    className="btn-secondary mr-auto"
                    onClick={() => void savePtvTicket(null)}
                  >
                    Quitar ticket
                  </button>
                )}
                <button
                  type="button"
                  disabled={ticketPending}
                  className="btn-secondary"
                  onClick={closeTicketModal}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={ticketPending}
                  className="btn-primary"
                >
                  {ticketPending
                    ? "Guardando…"
                    : order.ptvTicket != null
                      ? "Actualizar"
                      : "Asignar"}
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            open={cancelModalOpen}
            onClose={closeCancelModal}
            title="Cancelar pedido"
            description={
              order.status === "READY" || order.status === "COMPLETED"
                ? "Se reembolsará el cobro capturado en Stripe y el pedido quedará cancelado."
                : "Se liberará o reembolsará el pago en Stripe y el pedido saldrá de la cola de sucursal."
            }
          >
            <div className="space-y-4">
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                Pedido{" "}
                <span className="font-semibold">{order.orderNumber}</span> ·{" "}
                {formatMoney(order.total, order.currency)}. Esta acción no se
                puede deshacer.
              </p>
              <div>
                <label htmlFor="cancelReasonModal" className="field-label">
                  Motivo de cancelación
                </label>
                <textarea
                  id="cancelReasonModal"
                  autoFocus
                  required
                  placeholder="Ej. Cliente solicitó cancelar, producto agotado…"
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    setCancelError(null);
                  }}
                  className="input-field mt-1 min-h-[6rem] resize-none"
                />
              </div>
              {cancelError && (
                <p className="text-sm text-red-600">{cancelError}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={cancelPending}
                  className="btn-secondary"
                  onClick={closeCancelModal}
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={cancelPending || !cancelReason.trim()}
                  className="btn-red"
                  onClick={() => void confirmAdminCancel()}
                >
                  {cancelPending ? "Cancelando…" : "Confirmar cancelación"}
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            open={refundModalOpen}
            onClose={closeRefundModal}
            title="Reembolso parcial"
            description="Devuelve uno o varios productos sin cancelar el pedido. Se reembolsa directo en Stripe."
          >
            <div className="space-y-4">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {refundableItems.map(({ item, remaining }) => {
                  const qty = refundSelection[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {comboProductName(
                            item.productName,
                            item.secondaryProductName,
                          )}
                        </p>
                        {item.variantName && (
                          <p className="text-xs text-gray-500">
                            {item.variantName}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {formatMoney(item.unitPrice, order.currency)} c/u ·
                          disponible {remaining}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() =>
                            setRefundQty(item.id, qty - 1, remaining)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-base font-medium leading-none text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-gray-900 dark:text-white">
                          {qty}
                        </span>
                        <button
                          type="button"
                          disabled={qty >= remaining}
                          onClick={() =>
                            setRefundQty(item.id, qty + 1, remaining)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-base font-medium leading-none text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label htmlFor="refundReasonModal" className="field-label">
                  Motivo de la devolución
                </label>
                <textarea
                  id="refundReasonModal"
                  required
                  placeholder="Ej. Producto llegó frío, faltó un artículo…"
                  value={refundReason}
                  onChange={(e) => {
                    setRefundReason(e.target.value);
                    setRefundError(null);
                  }}
                  className="input-field mt-1 min-h-[6rem] resize-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800/50">
                <span className="text-gray-500">Monto a reembolsar</span>
                <span className="font-bold text-red-600">
                  {formatMoney(refundAmount, order.currency)}
                </span>
              </div>

              {refundError && (
                <p className="text-sm text-red-600">{refundError}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={refundPending}
                  className="btn-secondary"
                  onClick={closeRefundModal}
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={
                    refundPending ||
                    refundAmount <= 0 ||
                    !refundReason.trim()
                  }
                  className="btn-red"
                  onClick={() => void confirmPartialRefund()}
                >
                  {refundPending ? "Procesando…" : "Confirmar devolución"}
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
