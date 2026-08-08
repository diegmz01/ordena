"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock3,
  LogOut,
  Package,
  Pencil,
  ShoppingBag,
} from "lucide-react";
import { comboProductName, type AuthUser } from "@ordena/shared";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/api";
import { getAuthToken, logout } from "@/lib/auth";
import { formatMoney } from "@/lib/cart";
import { cn } from "@/lib/utils";

type LoginMethods = {
  hasPassword: boolean;
  oauthAccounts: { provider: "GOOGLE" | "FACEBOOK"; createdAt: string }[];
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.7.5-2.4 1.9C5.1 19.3 8.3 21 12 21c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-6-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3.5 7.3C2.6 9 2 10.9 2 13s.6 4 1.5 5.7l3.1-2.4C6 15.1 5.7 14.1 5.7 13s.3-2.1.8-3l-3-2.7z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.3c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 2.2 14.6 1 12 1 8.3 1 5.1 2.7 3.5 5.3l3.1 2.4C7 5.2 9.2 3.3 12 3.3z"
      />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#1877F2"
        d="M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1C0 18.1 4.4 23.1 10.1 24v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8v2.2h3.3l-.5 3.5h-2.8V24C19.6 23.1 24 18.1 24 12.1z"
      />
    </svg>
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
  COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
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

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
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

  const oauthProviders = useMemo(() => {
    const set = new Set(
      loginMethods?.oauthAccounts.map((a) => a.provider) ?? [],
    );
    return {
      google: set.has("GOOGLE"),
      facebook: set.has("FACEBOOK"),
    };
  }, [loginMethods]);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  function openPhoneModal() {
    setPhoneInput(phone ?? "");
    setPhoneError(null);
    setPhoneModalOpen(true);
  }

  function closePhoneModal() {
    if (phoneSaving) return;
    setPhoneModalOpen(false);
    setPhoneError(null);
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
      setPhoneModalOpen(false);
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
          `${i.quantity}× ${comboProductName(i.productName, i.secondaryProductName)}`,
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
        <div className="container-page max-w-xl !pb-4 !pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">
                Cuenta
              </p>
              <h1 className="page-title mt-0.5 !text-lg sm:!text-xl">
                Mis pedidos
              </h1>
              <p className="page-description !mt-0.5">
                {name
                  ? `Hola, ${name.split(/\s+/)[0]}`
                  : "Tu historial de pedidos"}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="max-w-[9.5rem] truncate text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
                  {phone || (
                    <span className="font-normal text-gray-400">
                      Sin teléfono
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={openPhoneModal}
                  className="inline-flex size-7 items-center justify-center rounded-lg text-orange-600 transition hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/40"
                  aria-label="Editar teléfono"
                  title="Editar teléfono"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              {(oauthProviders.google || oauthProviders.facebook) && (
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  {oauthProviders.google && (
                    <span
                      className="inline-flex size-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
                      title="Google"
                      aria-label="Inicio de sesión con Google"
                    >
                      <GoogleIcon />
                    </span>
                  )}
                  {oauthProviders.facebook && (
                    <span
                      className="inline-flex size-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
                      title="Facebook"
                      aria-label="Inicio de sesión con Facebook"
                    >
                      <FacebookIcon />
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container-page flex min-h-[calc(100vh-12rem)] max-w-xl flex-col !pt-4">
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

        <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleLogout}
            className="btn-secondary w-full gap-2 py-2.5 text-sm"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>

      <Modal
        open={phoneModalOpen}
        onClose={closePhoneModal}
        title="Editar teléfono"
        description="Usamos este número para contactarte sobre tu pedido."
      >
        <form onSubmit={submitPhone} className="space-y-4">
          <div>
            <label htmlFor="phoneModal" className="field-label">
              Teléfono
            </label>
            <input
              id="phoneModal"
              type="tel"
              required
              minLength={8}
              maxLength={20}
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                setPhoneError(null);
              }}
              placeholder="Ej. 55 1234 5678"
              className="input-field mt-1"
            />
            {phoneError && (
              <p className="mt-1 text-xs text-red-600">{phoneError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              disabled={phoneSaving}
              onClick={closePhoneModal}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={phoneSaving}
              className="btn-primary px-4 py-2 text-sm"
            >
              {phoneSaving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
