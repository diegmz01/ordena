"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock3,
  Facebook,
  KeyRound,
  LogOut,
  Package,
  Pencil,
  Phone,
  ShoppingBag,
} from "lucide-react";
import type { AuthUser } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken, logout } from "@/lib/auth";
import { formatMoney } from "@/lib/cart";
import { cn } from "@/lib/utils";

type LoginMethod = "EMAIL" | "GOOGLE" | "FACEBOOK";

type LoginMethods = {
  hasPassword: boolean;
  oauthAccounts: { provider: "GOOGLE" | "FACEBOOK"; createdAt: string }[];
};

const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = {
  EMAIL: "Correo y contraseña",
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};

function LoginMethodIcon({ method }: { method: LoginMethod }) {
  if (method === "GOOGLE") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-black text-sky-600 dark:bg-sky-950/40">
        G
      </span>
    );
  }
  if (method === "FACEBOOK") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">
        <Facebook className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      <KeyRound className="h-4 w-4" />
    </span>
  );
}

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
    secondaryProductName?: string | null;
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
  const [phone, setPhone] = useState<string | null>(null);
  const [loginMethods, setLoginMethods] = useState<LoginMethods | null>(null);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/pedidos")}`);
      return;
    }

    let cancelled = false;

    Promise.all([
      apiFetch<{ user: AuthUser }>("/auth/me", token),
      apiFetch<{ data: LoginMethods }>("/auth/me/login-methods", token),
      apiFetch<{ data: OrderRow[] }>("/orders/mine", token),
    ])
      .then(([me, methods, list]) => {
        if (cancelled) return;
        setName(me.user.name?.trim() || me.user.email);
        setPhone(me.user.phone ?? null);
        setLoginMethods(methods.data);
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

  function startEditPhone() {
    setPhoneInput(phone ?? "");
    setPhoneError(null);
    setEditingPhone(true);
  }

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token) return;

    setPhoneSaving(true);
    setPhoneError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>("/auth/me/phone", token, {
        method: "PATCH",
        body: JSON.stringify({ phone: phoneInput }),
      });
      setPhone(res.user.phone ?? null);
      setEditingPhone(false);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Error");
    } finally {
      setPhoneSaving(false);
    }
  }

  function OrderCard({ order }: { order: OrderRow }) {
    const summary = order.items
      .slice(0, 2)
      .map(
        (i) =>
          `${i.quantity}× ${i.productName}${
            i.secondaryProductName ? ` + ${i.secondaryProductName}` : ""
          }`,
      )
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

        {loginMethods && (
          <section className="customer-card mb-6 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Mi cuenta
            </h2>

            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-gray-500">
                Teléfono
              </p>
              {editingPhone ? (
                <form
                  onSubmit={submitPhone}
                  className="flex flex-col gap-2 sm:flex-row sm:items-start"
                >
                  <div className="flex-1">
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
                      <p className="mt-1 text-xs text-red-600">
                        {phoneError}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={phoneSaving}
                      className="btn-primary px-4 py-2 text-sm"
                    >
                      {phoneSaving ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPhone(false)}
                      disabled={phoneSaving}
                      className="btn-secondary px-4 py-2 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
                  <span className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                    <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                    {phone || (
                      <span className="text-gray-400">Sin teléfono</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={startEditPhone}
                    className="link-action !px-2 !py-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-gray-500">
                Inicio de sesión
              </p>
              <div className="space-y-2">
                {loginMethods.hasPassword && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
                    <LoginMethodIcon method="EMAIL" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {LOGIN_METHOD_LABEL.EMAIL}
                    </p>
                  </div>
                )}
                {loginMethods.oauthAccounts.map((acc) => (
                  <div
                    key={acc.provider}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                  >
                    <LoginMethodIcon method={acc.provider} />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {LOGIN_METHOD_LABEL[acc.provider]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

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
