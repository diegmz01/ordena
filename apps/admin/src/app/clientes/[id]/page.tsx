"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  ClipboardList,
  Facebook,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  ReceiptText,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type LoginMethod = "EMAIL" | "GOOGLE" | "FACEBOOK";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  paidAt: string | null;
  itemsCount: number;
  branch: { id: string; name: string };
};

type CustomerDetail = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  loginMethods: LoginMethod[];
  hasPassword: boolean;
  oauthAccounts: { provider: LoginMethod; createdAt: string }[];
  stats: {
    ordersCount: number;
    completedOrdersCount: number;
    totalSpentCents: number;
    averageTicketCents: number;
  };
  orders: OrderRow[];
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

const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = {
  EMAIL: "Correo y contraseña",
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
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

function LoginMethodRow({
  method,
  linkedAt,
}: {
  method: LoginMethod;
  linkedAt: string | null;
}) {
  const icon =
    method === "GOOGLE" ? (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-black text-sky-600 dark:bg-sky-950/40">
        G
      </span>
    ) : method === "FACEBOOK" ? (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">
        <Facebook className="h-4 w-4" />
      </span>
    ) : (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <KeyRound className="h-4 w-4" />
      </span>
    );
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {LOGIN_METHOD_LABEL[method]}
        </p>
        {linkedAt && (
          <p className="text-xs text-gray-500">
            Vinculado {formatDate(linkedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);

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
    apiFetch<{ data: CustomerDetail }>(`/customers/admin/${id}`, token)
      .then((res) => setCustomer(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const initial = useMemo(() => {
    if (!customer) return "?";
    return (customer.name?.trim() || customer.email).charAt(0).toUpperCase();
  }, [customer]);

  function startEditPhone() {
    setPhoneInput(customer?.phone ?? "");
    setPhoneError(null);
    setEditingPhone(true);
  }

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token || !customer) return;

    setPhoneSaving(true);
    setPhoneError(null);
    try {
      const res = await apiFetch<{ data: { phone: string | null } }>(
        `/customers/admin/${customer.id}/phone`,
        token,
        { method: "PATCH", body: JSON.stringify({ phone: phoneInput }) },
      );
      setCustomer({ ...customer, phone: res.data.phone });
      setEditingPhone(false);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Error");
    } finally {
      setPhoneSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

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

      {customer && !loading && (
        <>
          <header className="overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-white dark:border-orange-900/40 dark:from-orange-950/40 dark:via-gray-900 dark:to-gray-900">
            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xl font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                  {initial}
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {customer.name?.trim() || "Sin nombre"}
                  </h1>
                  <p className="truncate text-sm text-gray-600 dark:text-gray-300">
                    {customer.email}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Cliente desde {formatDate(customer.createdAt)}
                  </p>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-3">
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {customer.stats.ordersCount}
                  </p>
                  <p className="text-[11px] text-gray-500">Pedidos</p>
                </div>
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-orange-600">
                    {formatMoney(customer.stats.totalSpentCents)}
                  </p>
                  <p className="text-[11px] text-gray-500">Gastado</p>
                </div>
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatMoney(customer.stats.averageTicketCents)}
                  </p>
                  <p className="text-[11px] text-gray-500">Ticket prom.</p>
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <section className="admin-panel overflow-hidden">
                <div className="admin-panel-header">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      Historial de pedidos
                    </h2>
                    <p className="text-xs text-gray-500">
                      {customer.orders.length} pedido
                      {customer.orders.length === 1 ? "" : "s"} en total
                    </p>
                  </div>
                </div>
                {customer.orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
                    <ClipboardList className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500">
                      Este cliente aún no ha hecho pedidos.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {customer.orders.map((order) => (
                      <li key={order.id}>
                        <Link
                          href={`/pedidos/${order.id}`}
                          className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-orange-50/70 sm:px-6 dark:hover:bg-orange-950/20"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                            <ShoppingBag className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900 dark:text-white">
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
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {order.branch.name} · {order.itemsCount}{" "}
                              artículo{order.itemsCount === 1 ? "" : "s"} ·{" "}
                              {formatDate(order.createdAt)}
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
            </div>

            <aside className="space-y-4 lg:col-span-2">
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Contacto
                  </h2>
                </div>
                <div className="admin-panel-body space-y-2">
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition hover:border-orange-300 hover:bg-orange-50/50 dark:border-gray-700 dark:hover:border-orange-800 dark:hover:bg-orange-950/20"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="min-w-0 break-all text-gray-800 dark:text-gray-100">
                      {customer.email}
                    </span>
                  </a>
                  {editingPhone ? (
                    <form onSubmit={submitPhone} className="space-y-2">
                      <input
                        type="tel"
                        required
                        minLength={8}
                        maxLength={20}
                        inputMode="tel"
                        autoComplete="tel"
                        autoFocus
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Ej. 55 1234 5678"
                        className="input-field"
                      />
                      {phoneError && (
                        <p className="text-xs text-red-600">{phoneError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={phoneSaving}
                          className="btn-primary px-3 py-1.5 text-xs"
                        >
                          {phoneSaving ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPhone(false)}
                          disabled={phoneSaving}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="flex min-w-0 items-center gap-2 font-medium text-gray-800 hover:text-orange-600 dark:text-gray-100"
                        >
                          <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="flex items-center gap-2 text-gray-400">
                          <Phone className="h-4 w-4 shrink-0" />
                          Sin teléfono
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={startEditPhone}
                        className="link-action shrink-0 !px-2 !py-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Inicio de sesión
                  </h2>
                  <p className="text-xs text-gray-500">
                    Cómo accede este cliente a su cuenta
                  </p>
                </div>
                <div className="admin-panel-body space-y-2">
                  {customer.hasPassword && (
                    <LoginMethodRow method="EMAIL" linkedAt={null} />
                  )}
                  {customer.oauthAccounts.map((acc) => (
                    <LoginMethodRow
                      key={acc.provider}
                      method={acc.provider}
                      linkedAt={acc.createdAt}
                    />
                  ))}
                  {!customer.hasPassword &&
                    customer.oauthAccounts.length === 0 && (
                      <p className="text-sm text-gray-400">
                        Sin método de acceso registrado.
                      </p>
                    )}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Resumen
                  </h2>
                </div>
                <div className="admin-panel-body">
                  <dl className="space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="inline-flex items-center gap-1.5 text-gray-500">
                        <ReceiptText className="h-3.5 w-3.5" />
                        Pedidos entregados
                      </dt>
                      <dd className="font-semibold text-gray-800 dark:text-gray-100">
                        {customer.stats.completedOrdersCount}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="inline-flex items-center gap-1.5 text-gray-500">
                        <Wallet className="h-3.5 w-3.5" />
                        Total gastado
                      </dt>
                      <dd className="font-semibold text-orange-600">
                        {formatMoney(customer.stats.totalSpentCents)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Última actualización</dt>
                      <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                        {formatDate(customer.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
