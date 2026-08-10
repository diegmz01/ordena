"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, UserRoundPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatMoney, useCart } from "@/lib/cart";
import {
  ProductSheet,
  type MenuProduct,
} from "@/components/product-sheet";
import { SuggestedProducts } from "@/components/suggested-products";
import { useBranchStatus } from "@/lib/use-branch-status";
import { cn } from "@/lib/utils";

function MenuSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="customer-card flex gap-0 overflow-hidden">
          <div className="skeleton size-24 shrink-0 rounded-none sm:size-28" />
          <div className="flex-1 space-y-2 p-4">
            <div className="skeleton h-5 w-3/4" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton mt-3 h-5 w-16" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function productInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function MenuPage() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");
  const { branchId, branchName, setBranch, plates, addPlate, items, setItemPlate } =
    useCart();
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>("");
  const [selected, setSelected] = useState<MenuProduct | null>(null);

  const effectiveBranch = branchParam || branchId;
  const branchStatus = useBranchStatus(effectiveBranch);
  const checkingAvailability = !!effectiveBranch && branchStatus === undefined;
  const unavailable =
    !!effectiveBranch &&
    branchStatus !== undefined &&
    (branchStatus === null || !branchStatus.acceptingOrders);

  useEffect(() => {
    if (!branchParam || branchParam === branchId || !branchStatus) return;
    setBranch(branchStatus.id, branchStatus.name);
  }, [branchParam, branchId, branchStatus, setBranch]);

  useEffect(() => {
    if (!effectiveBranch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetea el listado al perder la sucursal seleccionada
      setLoading(false);
      setProducts([]);
      return;
    }
    if (checkingAvailability) {
      setLoading(true);
      return;
    }
    if (unavailable) {
      setLoading(false);
      setProducts([]);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ data: MenuProduct[] }>(`/menu?branchId=${effectiveBranch}`)
      .then((res) => setProducts(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [effectiveBranch, checkingAvailability, unavailable]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const p of products) {
      if (!map.has(p.category.id)) {
        map.set(p.category.id, {
          id: p.category.id,
          name: p.category.name,
          sortOrder: p.category.sortOrder ?? 0,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [products]);

  useEffect(() => {
    if (categories.length === 0) return;
    if (categories.some((c) => c.id === activeCat)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selecciona la primera categoría (según su orden) cuando cambia el listado o la activa deja de existir
    setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  const filtered = useMemo(() => {
    const inCategory = products.filter((p) => p.category.id === activeCat);
    // Estable: agota/fuera-de-horario al final sin alterar el orden relativo (categoría/sortOrder/nombre).
    const unavailableRank = (p: MenuProduct) =>
      Number(p.inStock === false || p.inSchedule === false);
    return [...inCategory].sort(
      (a, b) => unavailableRank(a) - unavailableRank(b),
    );
  }, [products, activeCat]);

  if (!effectiveBranch) {
    return (
      <div className="container-page pb-28">
        <h1 className="page-title">Menú</h1>
        <div className="customer-empty mt-8">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Primero elige una sucursal
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Así te mostramos solo lo disponible para recoger.
          </p>
          <Link href="/sucursales" className="btn-primary mt-5 inline-flex">
            Elegir sucursal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="border-b border-orange-100 bg-gradient-to-b from-orange-50 to-transparent dark:border-orange-950/40 dark:from-orange-950/30">
        <div className="container-page !pb-5 !pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Paso 2
          </p>
          <h1 className="page-title mt-1">Menú</h1>
          <p className="page-description flex flex-wrap items-center gap-2">
            {unavailable ? (
              <>
                <span className="status-badge-inactive">No disponible</span>
                {branchName ?? "Esta sucursal"} no está aceptando pedidos ahora
                mismo
              </>
            ) : branchName ? (
              `Disponible para recoger en ${branchName}`
            ) : (
              "Productos de tu sucursal"
            )}
          </p>
          <Link href="/sucursales" className="link-action mt-2 -ml-3 text-xs">
            Cambiar sucursal
          </Link>
          {!unavailable && (
            <div className="mt-4">
              {plates.length === 0 ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const person1Id = addPlate("Persona 1");
                    addPlate("Persona 2");
                    for (const item of items) {
                      setItemPlate(item.lineKey, person1Id);
                    }
                  }}
                >
                  <UserRoundPlus className="h-4 w-4" />
                  Asignar por persona
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Asignado a {plates.length} persona
                    {plates.length === 1 ? "" : "s"}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    onClick={() => addPlate()}
                  >
                    <UserRoundPlus className="h-3.5 w-3.5" />
                    Asignar nueva persona
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {unavailable ? (
        <div className="container-page !pt-4">
          <div className="customer-empty">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {branchName ?? "Esta sucursal"} no está disponible en este
              momento
            </p>
            <p className="mt-1 text-sm text-gray-500">
              No está aceptando pedidos ahora mismo. Puedes elegir otra
              sucursal o volver más tarde.
            </p>
            <Link href="/sucursales" className="btn-primary mt-5 inline-flex">
              Elegir otra sucursal
            </Link>
          </div>
        </div>
      ) : (
        <div className="container-page !pt-4">
          {error && <p className="admin-alert-error mb-4">{error}</p>}

          {!loading && <SuggestedProducts branchId={effectiveBranch} />}

          {categories.length > 0 && (
            <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-gray-100 bg-background/95 px-4 py-2 backdrop-blur dark:border-gray-800">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={cn(
                      "admin-tab-pill shrink-0",
                      activeCat === cat.id && "admin-tab-pill-active",
                    )}
                    onClick={() => setActiveCat(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <MenuSkeleton />
          ) : filtered.length === 0 ? (
            <div className="customer-empty">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Sin productos en esta categoría
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {filtered.map((product) => {
                const inStock = product.inStock !== false;
                const inSchedule = product.inSchedule !== false;
                const orderable = inStock && inSchedule;
                const badgeLabel = !inStock
                  ? "Agotado"
                  : !inSchedule
                    ? "Disponible más tarde"
                    : null;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(product)}
                      className={cn(
                        "customer-card group flex w-full overflow-hidden text-left transition",
                        orderable
                          ? "hover:border-orange-300 hover:shadow-md dark:hover:border-orange-700"
                          : "opacity-90",
                      )}
                    >
                      <div
                        className={cn(
                          "relative flex size-24 shrink-0 items-center justify-center bg-gradient-to-br from-orange-100 to-amber-50 text-lg font-bold text-orange-600 sm:size-28 dark:from-orange-950/60 dark:to-amber-950/30 dark:text-orange-300",
                          !orderable && "grayscale",
                        )}
                      >
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : (
                          productInitials(product.name)
                        )}
                        {badgeLabel && (
                          <span className="absolute inset-x-1 bottom-1 z-10 flex justify-center">
                            <span className="status-badge-inactive shadow-sm">
                              {badgeLabel}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5 sm:p-4">
                        <div>
                          <p
                            className={cn(
                              "font-semibold",
                              orderable
                                ? "text-gray-900 dark:text-white"
                                : "text-gray-500 dark:text-gray-400",
                            )}
                          >
                            {product.name}
                          </p>
                          {product.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "text-base font-bold tabular-nums",
                              orderable
                                ? "text-orange-600"
                                : "text-gray-400 dark:text-gray-500",
                            )}
                          >
                            {formatMoney(product.basePrice)}
                          </span>
                          {orderable ? (
                            <span
                              className="inline-flex size-9 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition group-hover:scale-105 group-hover:bg-orange-600"
                              aria-hidden
                            >
                              <Plus className="h-4 w-4" />
                            </span>
                          ) : (
                            <span className="status-badge-inactive">
                              {badgeLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <ProductSheet
            product={selected}
            products={products}
            open={!!selected}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
