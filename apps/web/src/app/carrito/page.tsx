"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  UserRoundPlus,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { comboProductName, computeServiceFee } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken, login, register } from "@/lib/auth";
import {
  clearUnavailableAlert,
  formatMoney,
  groupCartItemsByPlate,
  readUnavailableAlert,
  useCart,
  writeUnavailableAlert,
  type CartItem,
} from "@/lib/cart";
import { useBranchStatus } from "@/lib/use-branch-status";
import { useServiceFeeSettings } from "@/lib/service-fee";
import { validateCartStock } from "@/lib/validate-cart-stock";
import { cn } from "@/lib/utils";
import { PagarModal } from "./pagar-modal";
import { usePagarFlow } from "./use-pagar-flow";

function CarritoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    items,
    plates,
    branchId,
    branchName,
    notes,
    setNotes,
    subtotal,
    itemCount,
    setQuantity,
    removeItem,
    setItemPlate,
    addPlate,
    renamePlate,
    removePlate,
    pruneUnavailableLines,
  } = useCart();

  const [editingPlateId, setEditingPlateId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [validatingCheckout, setValidatingCheckout] = useState(false);
  const [unavailableAlert, setUnavailableAlert] = useState<string[]>([]);
  const [stockError, setStockError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [autopaying, setAutopaying] = useState(false);
  const autopayHandledRef = useRef(false);

  const branchStatus = useBranchStatus(branchId);
  const checkingBranch = !!branchId && branchStatus === undefined;
  const branchOpen =
    !branchId || branchStatus === undefined
      ? null
      : branchStatus?.acceptingOrders === true;

  const feeSettings = useServiceFeeSettings();
  const serviceFee = computeServiceFee(feeSettings, subtotal);
  const total = subtotal + serviceFee;

  const menuHref = branchId ? `/menu?branch=${branchId}` : "/sucursales";
  const changeBranchHref = "/sucursales?from=carrito";
  // Con este flag, el login social/telefono/registro nos devuelve directo
  // aquí y retomamos el pago solos, sin que el cliente tenga que tocar de
  // nuevo "Ir a pagar".
  const returnPath = useMemo(() => {
    const qs = new URLSearchParams();
    if (branchId) qs.set("branch", branchId);
    qs.set("autopay", "1");
    return `/carrito?${qs.toString()}`;
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la cookie de presencia de sesión al montar
    setHasToken(!!getAuthToken());
  }, []);

  const pagarFlow = usePagarFlow({
    branchId,
    items,
    plates,
    notes,
    pruneUnavailableLines,
    onUnavailable: setUnavailableAlert,
  });

  const payAsCustomer = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setModalOpen(true);
      return;
    }
    try {
      const res = await apiFetch<{ user: { phone?: string | null } }>(
        "/auth/me",
        token,
      );
      if (!res.user.phone?.trim()) {
        router.replace(
          `/auth/telefono?next=${encodeURIComponent(returnPath)}`,
        );
        return;
      }
    } catch {
      setHasToken(false);
      setModalOpen(true);
      return;
    }
    await pagarFlow.submitOrder({ token, asGuest: false });
  }, [router, returnPath, pagarFlow]);

  const groups = useMemo(
    () => groupCartItemsByPlate(items, plates),
    [items, plates],
  );

  const splitEnabled = plates.length > 0;
  const canCheckout = items.length > 0 && branchOpen === true;

  useEffect(() => {
    const names = readUnavailableAlert();
    if (names.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lee alerta persistida (localStorage) una sola vez al montar
      setUnavailableAlert(names);
      clearUnavailableAlert();
    }
  }, []);

  async function goToCheckout() {
    if (!branchId || items.length === 0 || branchOpen !== true) return;
    if (validatingCheckout || pagarFlow.pending) return;
    setValidatingCheckout(true);
    setStockError(null);
    try {
      const result = await validateCartStock(branchId, items);
      if (!result.ok) {
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
        setUnavailableAlert(names);
        setStockError(
          "Algunos productos se agotaron mientras armabas el pedido. Se quitaron del carrito.",
        );
        return;
      }
      if (hasToken) {
        await payAsCustomer();
      } else {
        setModalOpen(true);
      }
    } catch (err) {
      setStockError(
        err instanceof Error
          ? err.message
          : "No se pudo verificar la disponibilidad",
      );
    } finally {
      setValidatingCheckout(false);
    }
  }

  // Si venimos de un login social (o de /login o /auth/telefono) que nos
  // mandó de vuelta con ?autopay=1, retomamos el pago solos sin que el
  // cliente tenga que volver a tocar "Ir a pagar".
  useEffect(() => {
    if (autopayHandledRef.current) return;
    if (searchParams.get("autopay") !== "1") return;
    autopayHandledRef.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("autopay");
    const cleanPath = params.toString()
      ? `/carrito?${params.toString()}`
      : "/carrito";
    router.replace(cleanPath);

    if (!getAuthToken() || items.length === 0 || branchOpen !== true) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- retoma el pago justo al aterrizar tras el redirect de login social, no hay estado derivable en render
    setAutopaying(true);
    payAsCustomer()
      .catch((err) => {
        setStockError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => setAutopaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez al montar, gateado por autopayHandledRef
  }, []);

  async function handleGuestSubmit(form: {
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    turnstileToken: string | null;
  }) {
    await pagarFlow.submitOrder({
      token: null,
      asGuest: true,
      guestName: form.guestName,
      guestEmail: form.guestEmail,
      guestPhone: form.guestPhone,
      turnstileToken: form.turnstileToken ?? undefined,
    });
  }

  async function handleRegisterSubmit(form: {
    regName: string;
    regEmail: string;
    regPassword: string;
    regPhone: string;
    turnstileToken: string | null;
  }) {
    try {
      await register({
        name: form.regName,
        email: form.regEmail,
        password: form.regPassword,
        phone: form.regPhone || undefined,
        turnstileToken: form.turnstileToken ?? undefined,
      });
    } catch (err) {
      pagarFlow.setError(err instanceof Error ? err.message : "Error");
      throw err;
    }
    setHasToken(true);
    await pagarFlow.submitOrder({ token: getAuthToken(), asGuest: false });
  }

  async function handleLoginSubmit(form: {
    email: string;
    password: string;
    turnstileToken: string | null;
  }) {
    try {
      await login(
        form.email,
        form.password,
        "CUSTOMER",
        form.turnstileToken ?? undefined,
      );
    } catch (err) {
      pagarFlow.setError(err instanceof Error ? err.message : "Error");
      throw err;
    }
    setHasToken(true);
    await pagarFlow.submitOrder({ token: getAuthToken(), asGuest: false });
  }

  function startSplit() {
    if (plates.length > 0) return;
    const id = addPlate("Persona 1");
    addPlate("Persona 2");
    for (const item of items) {
      setItemPlate(item.lineKey, id);
    }
  }

  function beginRename(plateId: string, current: string) {
    setEditingPlateId(plateId);
    setEditName(current);
  }

  function commitRename() {
    if (!editingPlateId) return;
    renamePlate(editingPlateId, editName);
    setEditingPlateId(null);
    setEditName("");
  }

  function renderItem(item: CartItem) {
    return (
      <li
        key={item.lineKey}
        className="border-t border-gray-100 p-4 first:border-t-0 dark:border-gray-800"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white">
              {comboProductName(item.name, item.secondaryName)}
            </p>
            {item.modifierLabels.length > 0 && (
              <p className="mt-0.5 text-base font-normal text-gray-500">
                {item.modifierLabels.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              {formatMoney(item.unitPrice)} c/u
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary size-8 shrink-0 p-0"
            onClick={() => removeItem(item.lineKey)}
            aria-label={`Quitar ${item.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary size-8 p-0"
              onClick={() => setQuantity(item.lineKey, item.quantity - 1)}
              aria-label="Menos"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              className="btn-secondary size-8 p-0"
              onClick={() => setQuantity(item.lineKey, item.quantity + 1)}
              aria-label="Más"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm font-semibold tabular-nums text-orange-600">
            {formatMoney(item.unitPrice * item.quantity)}
          </p>
        </div>
        {splitEnabled && (
          <div
            className="mt-3 flex flex-wrap gap-1.5"
            role="group"
            aria-label={`Asignar ${item.name} a persona`}
          >
            {plates.map((p) => {
              const active =
                item.plateId && plates.some((pl) => pl.id === item.plateId)
                  ? item.plateId === p.id
                  : plates[0]?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "customer-plate-chip",
                    active && "customer-plate-chip-active",
                  )}
                  onClick={() => setItemPlate(item.lineKey, p.id)}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="pb-36">
      <div className="border-b border-orange-100 bg-gradient-to-b from-orange-50 to-transparent dark:border-orange-950/40 dark:from-orange-950/30">
        <div className="container-page max-w-xl !pb-5 !pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Paso 3
          </p>
          <h1 className="page-title mt-1">Tu pedido</h1>
          <p className="page-description">
            {branchName
              ? `Recoges en ${branchName}`
              : "Elige una sucursal para continuar"}
          </p>
          {branchName && (
            <Link
              href={changeBranchHref}
              className="link-action mt-1 -ml-3 text-xs"
            >
              Cambiar sucursal
            </Link>
          )}
        </div>
      </div>

      <div className="container-page max-w-xl !pt-6">
        {autopaying ? (
          <div className="customer-empty mt-8">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Redirigiendo a pago…
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Ya iniciaste sesión, estamos preparando tu pago.
            </p>
          </div>
        ) : (
          <>
        {unavailableAlert.length > 0 && (
          <div
            className="mb-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Productos no disponibles
              </p>
              <p className="mt-1 text-xs opacity-90">
                Se quitaron del carrito (agotados o no se venden aquí):{" "}
                {unavailableAlert.join(", ")}.
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold underline"
                onClick={() => setUnavailableAlert([])}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {stockError && unavailableAlert.length === 0 && (
          <p className="admin-alert-error mb-4">{stockError}</p>
        )}

        {items.length > 0 && branchOpen === false && (
          <div
            className="mb-4 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {branchName ?? "Esta sucursal"} no está disponible
              </p>
              <p className="mt-1 text-xs opacity-90">
                No puedes pagar ahora. Elige otra sucursal para continuar con tu
                pedido.
              </p>
              <Link
                href={changeBranchHref}
                className="btn-primary mt-3 inline-flex"
              >
                Cambiar sucursal
              </Link>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="customer-empty mt-8">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/40">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Tu carrito está vacío
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Agrega algo del menú para continuar.
            </p>
            <Link href={menuHref} className="btn-primary mt-5 inline-flex">
              {branchId ? "Ir al menú" : "Elegir sucursal"}
            </Link>
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            <div className="flex flex-wrap gap-2">
              {!splitEnabled ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={startSplit}
                >
                  <UserRoundPlus className="h-4 w-4" />
                  Asignar por persona
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => addPlate()}
                >
                  <UserRoundPlus className="h-4 w-4" />
                  Asignar nueva persona
                </button>
              )}
            </div>

            {splitEnabled ? (
              <div className="space-y-4">
                {groups.map(({ plate, items: groupItems }) => (
                  <section
                    key={plate?.id ?? "unassigned"}
                    className="customer-card overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-orange-50/60 px-4 py-3 dark:border-gray-800 dark:bg-orange-950/20">
                      {plate &&
                        (editingPlateId === plate.id ? (
                          <form
                            className="flex flex-1 items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename();
                            }}
                          >
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={commitRename}
                              className="input-field h-9 flex-1"
                              maxLength={40}
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
                            onClick={() => beginRename(plate.id, plate.name)}
                          >
                            <span className="truncate">{plate.name}</span>
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          </button>
                        ))}
                      {plate && (
                        <button
                          type="button"
                          className="btn-red"
                          onClick={() => removePlate(plate.id)}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    {groupItems.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-gray-500">
                        Sin productos en este plato
                      </p>
                    ) : (
                      <ul>{groupItems.map(renderItem)}</ul>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <ul className="customer-card overflow-hidden">
                {items.map(renderItem)}
              </ul>
            )}

            <div className="customer-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
                  {splitEnabled && plates.length > 0
                    ? ` · ${plates.length} persona${plates.length === 1 ? "" : "s"}`
                    : ""}
                </span>
                <span className="text-gray-500">Subtotal</span>
              </div>
              <div className="mt-1 flex justify-end">
                <span className="text-sm tabular-nums text-gray-500">
                  {formatMoney(subtotal)}
                </span>
              </div>
              {serviceFee > 0 && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-gray-500">Tarifa de servicios</span>
                  <span className="tabular-nums text-gray-500">
                    {formatMoney(serviceFee)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Total a pagar
                </span>
                <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {formatMoney(total)}
                </span>
              </div>
              {splitEnabled && (
                <p className="mt-2 text-xs text-gray-500">
                  La separación es solo para cocina; se cobra en un solo pago.
                </p>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas para la cocina (opcional)"
              maxLength={500}
              className="input-field min-h-20 py-2"
            />

            <Link
              href={menuHref}
              className="btn-secondary w-full justify-center"
            >
              Agregar más productos
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-4 md:bottom-6">
            <div className="pointer-events-auto mx-auto max-w-xl">
              {canCheckout ? (
                <button
                  type="button"
                  disabled={validatingCheckout || pagarFlow.pending}
                  onClick={() => void goToCheckout()}
                  className="sticky-order-bar w-full disabled:opacity-70"
                >
                  <span>
                    {validatingCheckout
                      ? "Verificando disponibilidad…"
                      : pagarFlow.pending
                        ? "Preparando el pago…"
                        : "Ir a pagar"}
                  </span>
                  <span className="tabular-nums">{formatMoney(total)}</span>
                </button>
              ) : (
                <div className="sticky-order-bar pointer-events-auto cursor-not-allowed opacity-60">
                  <span>
                    {checkingBranch
                      ? "Verificando sucursal…"
                      : branchOpen === false
                        ? "Sucursal no disponible"
                        : "Ir a pagar"}
                  </span>
                  <span className="tabular-nums">{formatMoney(total)}</span>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      <PagarModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        returnPath={returnPath}
        total={total}
        pending={pagarFlow.pending}
        error={pagarFlow.error}
        onSubmitGuest={handleGuestSubmit}
        onSubmitRegister={handleRegisterSubmit}
        onSubmitLogin={handleLoginSubmit}
      />
    </div>
  );
}

export default function CarritoPage() {
  return (
    <Suspense
      fallback={<div className="p-10 text-sm">Cargando carrito…</div>}
    >
      <CarritoPageInner />
    </Suspense>
  );
}
