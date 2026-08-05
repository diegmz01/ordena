"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthUser } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken, register } from "@/lib/auth";
import {
  formatMoney,
  groupCartItemsByPlate,
  useCart,
  writeUnavailableAlert,
} from "@/lib/cart";
import { cn } from "@/lib/utils";
import { SocialAuthButtons } from "@/components/social-auth-buttons";
import { validateCartStock } from "@/lib/validate-cart-stock";

type CheckoutMode = "guest" | "register";

export default function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");
  const canceled = searchParams.get("canceled");
  const {
    branchId,
    branchName,
    items,
    plates,
    subtotal,
    setBranch,
    pruneUnavailableLines,
  } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [customer, setCustomer] = useState<AuthUser | null>(null);
  const [mode, setMode] = useState<CheckoutMode>("guest");
  const [showAltForm, setShowAltForm] = useState(false);
  // Misma key en todos los submits de este intento de checkout: si el usuario
  // reenvía (doble clic, retry de red), la API reusa el pedido/Stripe Session
  // en vez de duplicarlos. Se renueva solo al volver a montar la página.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const effectiveBranch = branchParam || branchId;

  const returnPath = useMemo(() => {
    const qs = new URLSearchParams();
    if (effectiveBranch) qs.set("branch", effectiveBranch);
    const q = qs.toString();
    return q ? `/checkout?${q}` : "/checkout";
  }, [effectiveBranch]);

  const summaryGroups = useMemo(
    () => groupCartItemsByPlate(items, plates).filter((g) => g.items.length > 0),
    [items, plates],
  );

  useEffect(() => {
    const token = getAuthToken();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con el token de auth (localStorage) al montar
    setHasToken(!!token);
    if (!token) {
      setCustomer(null);
      return;
    }
    apiFetch<{ user: AuthUser }>("/auth/me", token)
      .then((res) => {
        if (!res.user.phone?.trim()) {
          router.replace(
            `/auth/telefono?next=${encodeURIComponent(returnPath)}`,
          );
          return;
        }
        setCustomer(res.user);
      })
      .catch(() => {
        setHasToken(false);
        setCustomer(null);
      });
  }, [returnPath, router]);

  useEffect(() => {
    if (branchParam && branchParam !== branchId) {
      apiFetch<{ data: { id: string; name: string }[] }>("/branches")
        .then((res) => {
          const b = res.data.find((x) => x.id === branchParam);
          if (b) setBranch(b.id, b.name);
        })
        .catch(() => undefined);
    }
  }, [branchParam, branchId, setBranch]);

  async function ensureCartStillAvailable(): Promise<boolean> {
    if (!effectiveBranch || items.length === 0) return false;
    const result = await validateCartStock(effectiveBranch, items);
    if (result.ok) return true;

    const removed = pruneUnavailableLines(
      result.unavailable.map((u) => ({
        productId: u.productId,
        modifierIds: u.modifierIds,
      })),
    );
    const names =
      removed.length > 0
        ? removed
        : [...new Set(result.unavailable.map((u) => u.productName))];
    writeUnavailableAlert(names);
    router.replace(
      effectiveBranch ? `/carrito?branch=${effectiveBranch}` : "/carrito",
    );
    return false;
  }

  async function payWithToken(
    token: string | null,
    form: FormData,
    asGuest: boolean,
  ) {
    const stillOk = await ensureCartStillAvailable();
    if (!stillOk) {
      throw new Error(
        "Algunos productos se agotaron. Revisa tu pedido e intenta de nuevo.",
      );
    }

    const result = await apiFetch<{ checkoutUrl: string | null }>(
      "/checkout",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          branchId: effectiveBranch,
          idempotencyKey: idempotencyKeyRef.current,
          guestName: asGuest
            ? String(form.get("guestName") || "") || undefined
            : undefined,
          guestEmail: asGuest
            ? String(form.get("guestEmail") || "") || undefined
            : undefined,
          guestPhone: asGuest
            ? String(form.get("guestPhone") || "") || undefined
            : undefined,
          notes: String(form.get("notes") || "") || undefined,
          items: items.map((item) => {
            const plate = item.plateId
              ? plates.find((p) => p.id === item.plateId)
              : null;
            return {
              productId: item.productId,
              productName: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              modifierIds: item.modifierIds,
              variantName:
                item.modifierLabels.length > 0
                  ? item.modifierLabels.join(", ")
                  : undefined,
              plateLabel: plate?.name,
            };
          }),
        }),
      },
    );

    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    throw new Error("Stripe no devolvió URL de checkout (revisa claves)");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveBranch) {
      setError("Selecciona una sucursal primero");
      return;
    }
    if (items.length === 0) {
      setError("Tu carrito está vacío");
      return;
    }
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      if (hasToken) {
        await payWithToken(getAuthToken(), form, false);
        return;
      }

      if (mode === "register") {
        await register({
          name: String(form.get("regName")),
          email: String(form.get("regEmail")),
          password: String(form.get("regPassword")),
          phone: String(form.get("regPhone") || "") || undefined,
        });
        setHasToken(true);
        await payWithToken(getAuthToken(), form, false);
        return;
      }

      await payWithToken(null, form, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      // Intento fallido (ej. producto agotado): un reintento deliberado del
      // usuario es un pedido nuevo, no debe chocar con la key ya cancelada.
      idempotencyKeyRef.current = crypto.randomUUID();
    } finally {
      setPending(false);
    }
  }

  if (!effectiveBranch) {
    return (
      <div className="container-page max-w-xl pb-28">
        <h1 className="page-title">Pagar</h1>
        <div className="customer-empty mt-8">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Necesitas una sucursal
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Elige dónde vas a recoger antes de pagar.
          </p>
          <Link href="/sucursales" className="btn-primary mt-5 inline-flex">
            Elegir sucursal
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-page max-w-xl pb-28">
        <h1 className="page-title">Pagar</h1>
        {canceled && (
          <p className="admin-alert-error mt-4">
            Pago cancelado. Puedes armar de nuevo tu pedido.
          </p>
        )}
        <div className="customer-empty mt-8">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Tu carrito está vacío
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Agrega productos del menú para continuar al pago.
          </p>
          <Link
            href={`/menu?branch=${effectiveBranch}`}
            className="btn-primary mt-5 inline-flex"
          >
            Volver al menú
          </Link>
        </div>
      </div>
    );
  }

  const firstName =
    customer?.name?.trim().split(/\s+/)[0] ||
    customer?.email?.split("@")[0] ||
    null;

  return (
    <div className="container-page max-w-xl pb-28">
      {hasToken ? (
        <header className="space-y-3">
          <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
            Recoges en {branchName ?? "tu sucursal"}
          </p>
          <h1 className="page-title text-balance">
            {firstName ? (
              <>
                ¡Hola <span className="text-orange-600">{firstName}</span>!
              </>
            ) : (
              "¡Hola!"
            )}
          </h1>
          <p className="page-description text-pretty leading-relaxed">
            Este es el resumen de tu pedido. Revísalo y, si todo está bien,
            continúa con el pago.
          </p>
          {customer && (
            <div className="customer-card flex items-center gap-3 px-3.5 py-3">
              <div
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-base font-semibold text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
              >
                {(firstName?.[0] ?? "C").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900 dark:text-white">
                  {customer.name?.trim() || "Tu cuenta"}
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {customer.email}
                  {customer.phone?.trim()
                    ? ` · ${customer.phone.trim()}`
                    : ""}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  El pedido quedará ligado a tu cuenta
                </p>
              </div>
            </div>
          )}
        </header>
      ) : (
        <>
          <h1 className="page-title">Pagar</h1>
          <p className="page-description">
            Recoges en {branchName ?? "tu sucursal"} · Pago seguro con Stripe
          </p>
        </>
      )}

      {canceled && (
        <p className="admin-alert-error mt-4">
          Pago cancelado. Puedes intentar de nuevo.
        </p>
      )}

      <div className="customer-card mt-6 space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Resumen del pedido
          </p>
          <Link
            href={
              effectiveBranch
                ? `/carrito?branch=${effectiveBranch}`
                : "/carrito"
            }
            className="text-xs font-medium text-orange-600 hover:underline"
          >
            Editar
          </Link>
        </div>
        {summaryGroups.map(({ plate, items: groupItems }) => (
          <div key={plate?.id ?? "unassigned"} className="space-y-2">
            {plates.length > 0 && (
              <p className="text-xs font-semibold text-orange-600">
                {plate?.name}
              </p>
            )}
            {groupItems.map((item) => (
              <div
                key={item.lineKey}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.quantity}× {item.name}
                  </p>
                  {item.modifierLabels.length > 0 && (
                    <p className="text-xs text-gray-500">
                      {item.modifierLabels.join(", ")}
                    </p>
                  )}
                </div>
                <p className="shrink-0 font-semibold text-orange-600">
                  {formatMoney(item.unitPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        ))}
        <div className="flex justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
          <span className="font-medium text-gray-700 dark:text-gray-200">
            Total
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            {formatMoney(subtotal)}
          </span>
        </div>
        {plates.length > 0 && (
          <p className="text-xs text-gray-500">
            Un solo pago · la separación es para cocina
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {!hasToken && (
          <div className="customer-card space-y-4 p-4">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">
                Entra para pagar más rápido
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Un toque con redes y el pedido queda en tu cuenta
              </p>
            </div>

            <SocialAuthButtons next={returnPath} variant="primary" />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-500">otras opciones</span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>

            {!showAltForm ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300"
                  onClick={() => {
                    setMode("guest");
                    setShowAltForm(true);
                  }}
                >
                  Continuar como invitado
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300"
                  onClick={() => {
                    setMode("register");
                    setShowAltForm(true);
                  }}
                >
                  Registro con email
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "admin-tab-pill",
                      mode === "guest" && "admin-tab-pill-active",
                    )}
                    onClick={() => setMode("guest")}
                  >
                    Invitado
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "admin-tab-pill",
                      mode === "register" && "admin-tab-pill-active",
                    )}
                    onClick={() => setMode("register")}
                  >
                    Crear cuenta
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-xs text-gray-500 underline"
                    onClick={() => setShowAltForm(false)}
                  >
                    Volver
                  </button>
                </div>

                {mode === "guest" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Pedirás sin registrarte. Solo usamos estos datos para el
                      pedido.
                    </p>
                    <input
                      name="guestName"
                      placeholder="Nombre"
                      required
                      minLength={2}
                      className="input-field"
                    />
                    <input
                      name="guestEmail"
                      type="email"
                      placeholder="Email"
                      required
                      className="input-field"
                    />
                    <input
                      name="guestPhone"
                      placeholder="Teléfono"
                      required
                      minLength={8}
                      className="input-field"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Crea tu cuenta y paga en el mismo paso.
                    </p>
                    <input
                      name="regName"
                      placeholder="Nombre"
                      required
                      minLength={2}
                      className="input-field"
                    />
                    <input
                      name="regEmail"
                      type="email"
                      placeholder="Email"
                      required
                      className="input-field"
                    />
                    <input
                      name="regPhone"
                      placeholder="Teléfono (opcional)"
                      className="input-field"
                    />
                    <input
                      name="regPassword"
                      type="password"
                      placeholder="Contraseña (mín. 10)"
                      required
                      minLength={10}
                      className="input-field"
                      autoComplete="new-password"
                    />
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-xs text-gray-500">
              ¿Ya tienes cuenta?{" "}
              <Link
                href={`/login?next=${encodeURIComponent(returnPath)}`}
                className="text-orange-600 underline"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        )}

        <textarea
          name="notes"
          placeholder="Notas para la cocina (opcional)"
          className="input-field min-h-20 py-2"
        />
        {error && <p className="admin-alert-error">{error}</p>}
        <button
          type="submit"
          disabled={pending || (!hasToken && !showAltForm)}
          className="btn-primary w-full py-3.5 text-base"
        >
          {pending
            ? mode === "register" && !hasToken
              ? "Creando cuenta y pagando…"
              : "Redirigiendo a Stripe…"
            : !hasToken && !showAltForm
              ? "Elige cómo continuar arriba"
              : `Continuar al pago · ${formatMoney(subtotal)}`}
        </button>
        <p className="text-center text-xs text-gray-500">
          Autorización segura con Stripe · Se cobra al entregar
        </p>
      </form>
    </div>
  );
}
