"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  UserRoundPlus,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  clearUnavailableAlert,
  formatMoney,
  groupCartItemsByPlate,
  readUnavailableAlert,
  useCart,
  writeUnavailableAlert,
  type CartItem,
} from "@/lib/cart";
import { validateCartStock } from "@/lib/validate-cart-stock";

export default function CarritoPage() {
  const router = useRouter();
  const {
    items,
    plates,
    branchId,
    branchName,
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
  const [branchOpen, setBranchOpen] = useState<boolean | null>(null);
  const [checkingBranch, setCheckingBranch] = useState(false);
  const [validatingCheckout, setValidatingCheckout] = useState(false);
  const [unavailableAlert, setUnavailableAlert] = useState<string[]>([]);
  const [stockError, setStockError] = useState<string | null>(null);

  const menuHref = branchId ? `/menu?branch=${branchId}` : "/sucursales";
  const checkoutHref = branchId
    ? `/checkout?branch=${branchId}`
    : "/sucursales";
  const changeBranchHref = "/sucursales?from=carrito";

  const groups = useMemo(
    () => groupCartItemsByPlate(items, plates),
    [items, plates],
  );

  const splitEnabled = plates.length > 0;
  const canCheckout = items.length > 0 && branchOpen === true;

  const checkBranch = useCallback(async () => {
    if (!branchId) {
      setBranchOpen(null);
      return;
    }
    setCheckingBranch(true);
    try {
      const res = await apiFetch<{ data: { id: string }[] }>("/branches");
      setBranchOpen(res.data.some((b) => b.id === branchId));
    } catch {
      setBranchOpen(false);
    } finally {
      setCheckingBranch(false);
    }
  }, [branchId]);

  useEffect(() => {
    void checkBranch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkBranch();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => void checkBranch(), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [checkBranch]);

  useEffect(() => {
    const names = readUnavailableAlert();
    if (names.length > 0) {
      setUnavailableAlert(names);
      clearUnavailableAlert();
    }
  }, []);

  async function goToCheckout() {
    if (!branchId || items.length === 0 || branchOpen !== true) return;
    if (validatingCheckout) return;
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
      router.push(checkoutHref);
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
              {item.name}
            </p>
            {item.modifierLabels.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500">
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
          <div className="mt-3">
            <label className="sr-only" htmlFor={`plate-${item.lineKey}`}>
              Asignar a persona
            </label>
            <select
              id={`plate-${item.lineKey}`}
              className="input-field h-9 text-xs"
              value={
                item.plateId && plates.some((p) => p.id === item.plateId)
                  ? item.plateId
                  : (plates[0]?.id ?? "")
              }
              onChange={(e) => setItemPlate(item.lineKey, e.target.value)}
            >
              {plates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
                <span className="text-gray-500">Total a pagar</span>
              </div>
              <div className="mt-1 flex justify-end">
                <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {formatMoney(subtotal)}
                </span>
              </div>
              {splitEnabled && (
                <p className="mt-2 text-xs text-gray-500">
                  La separación es solo para cocina; se cobra en un solo pago.
                </p>
              )}
            </div>

            <Link
              href={menuHref}
              className="btn-secondary w-full justify-center"
            >
              Agregar más productos
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-30 px-4 md:bottom-6">
            <div className="pointer-events-auto mx-auto max-w-xl">
              {canCheckout ? (
                <button
                  type="button"
                  disabled={validatingCheckout}
                  onClick={() => void goToCheckout()}
                  className="sticky-order-bar w-full disabled:opacity-70"
                >
                  <span>
                    {validatingCheckout
                      ? "Verificando disponibilidad…"
                      : "Ir a pagar"}
                  </span>
                  <span className="tabular-nums">{formatMoney(subtotal)}</span>
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
                  <span className="tabular-nums">{formatMoney(subtotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
