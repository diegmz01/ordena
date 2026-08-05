"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Filter, Search, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type StockDuration = 30 | 60 | 120 | "day" | "manual";
type StockTab = "products" | "modifiers";

type StockProduct = {
  id: string;
  name: string;
  basePrice: number;
  inStock: boolean;
  unavailableUntil: string | null;
};

type StockCategory = {
  id: string;
  name: string;
  products: StockProduct[];
};

type StockModifier = {
  id: string;
  name: string;
  priceDelta: number;
  isRequired: boolean;
  inStock: boolean;
  unavailableUntil: string | null;
};

type PendingOff =
  | { kind: "product"; type: "product"; id: string; name: string }
  | {
      kind: "product";
      type: "section";
      id: string;
      name: string;
      productIds: string[];
    }
  | { kind: "product"; type: "bulk"; productIds: string[] }
  | { kind: "modifier"; type: "modifier"; id: string; name: string }
  | { kind: "modifier"; type: "bulk"; modifierIds: string[] };

const DURATION_OPTIONS: { value: StockDuration; label: string; hint: string }[] =
  [
    { value: 30, label: "30 min", hint: "Se reactiva solo" },
    { value: 60, label: "1 hora", hint: "Se reactiva solo" },
    { value: 120, label: "2 horas", hint: "Se reactiva solo" },
    { value: "day", label: "Solo hoy", hint: "Hasta mañana" },
    {
      value: "manual",
      label: "Hasta reactivar",
      hint: "No vuelve solo",
    },
  ];

const MANUAL_SENTINEL_MS = Date.parse("9999-12-31T00:00:00.000Z");

function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
}

function formatDelta(cents: number) {
  if (cents === 0) return "Sin cargo";
  const sign = cents > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

function stockHint(unavailableUntil: string | null): string | null {
  if (!unavailableUntil) return null;
  const ms = Date.parse(unavailableUntil);
  if (!Number.isFinite(ms)) return "Agotado";
  if (ms >= MANUAL_SENTINEL_MS) return "Hasta reactivar";
  try {
    const d = new Date(ms);
    const now = new Date();
    const startTomorrow = new Date(now);
    startTomorrow.setHours(24, 0, 0, 0);
    const endTomorrow = new Date(startTomorrow);
    endTomorrow.setHours(24, 0, 0, 0);
    if (ms >= startTomorrow.getTime() - 60_000 && ms <= endTomorrow.getTime()) {
      return "Hasta mañana";
    }
    return `Hasta ${new Intl.DateTimeFormat("es-MX", {
      timeStyle: "short",
    }).format(d)}`;
  } catch {
    return "Agotado";
  }
}

function StockToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:opacity-50",
        checked ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

export default function MenuStockPage() {
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [modifiers, setModifiers] = useState<StockModifier[]>([]);
  const [tab, setTab] = useState<StockTab>("products");
  const [query, setQuery] = useState("");
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingOff, setPendingOff] = useState<PendingOff | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        data: {
          categories: StockCategory[];
          modifiers: StockModifier[];
        };
      }>("/branches/me/menu", token);
      setCategories(res.data.categories);
      setModifiers(res.data.modifiers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        products: cat.products.filter((p) => {
          if (onlyOutOfStock && p.inStock) return false;
          if (q && !p.name.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [categories, q, onlyOutOfStock]);

  const filteredModifiers = useMemo(() => {
    return modifiers.filter((m) => {
      if (onlyOutOfStock && m.inStock) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [modifiers, q, onlyOutOfStock]);

  const productMatchCount = useMemo(
    () =>
      filteredCategories.reduce((n, cat) => n + cat.products.length, 0),
    [filteredCategories],
  );

  const modifierMatchCount = filteredModifiers.length;

  const visibleInStockIds = useMemo(() => {
    if (tab === "products") {
      return filteredCategories.flatMap((cat) =>
        cat.products.filter((p) => p.inStock).map((p) => p.id),
      );
    }
    return filteredModifiers.filter((m) => m.inStock).map((m) => m.id);
  }, [tab, filteredCategories, filteredModifiers]);

  const selectedInStockIds = useMemo(
    () => visibleInStockIds.filter((id) => selectedIds.has(id)),
    [visibleInStockIds, selectedIds],
  );

  const allVisibleInStockSelected =
    visibleInStockIds.length > 0 &&
    visibleInStockIds.every((id) => selectedIds.has(id));

  const outOfStockCount = useMemo(() => {
    if (tab === "products") {
      return categories.reduce(
        (n, cat) => n + cat.products.filter((p) => !p.inStock).length,
        0,
      );
    }
    return modifiers.filter((m) => !m.inStock).length;
  }, [tab, categories, modifiers]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(visibleInStockIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleInStockIds]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleInStockSelected) {
        const next = new Set(prev);
        for (const id of visibleInStockIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleInStockIds) next.add(id);
      return next;
    });
  }

  function patchLocalProduct(
    productId: string,
    patch: { inStock: boolean; unavailableUntil: string | null },
  ) {
    setCategories((cats) =>
      cats.map((cat) => ({
        ...cat,
        products: cat.products.map((p) =>
          p.id === productId
            ? {
                ...p,
                inStock: patch.inStock,
                unavailableUntil: patch.unavailableUntil,
              }
            : p,
        ),
      })),
    );
  }

  function patchLocalModifier(
    modifierId: string,
    patch: { inStock: boolean; unavailableUntil: string | null },
  ) {
    setModifiers((list) =>
      list.map((m) =>
        m.id === modifierId
          ? {
              ...m,
              inStock: patch.inStock,
              unavailableUntil: patch.unavailableUntil,
            }
          : m,
      ),
    );
  }

  async function patchProduct(
    productId: string,
    body: { inStock: true } | { inStock: false; duration: StockDuration },
  ) {
    const token = getAuthToken();
    if (!token) return;
    const res = await apiFetch<{
      data: {
        productId: string;
        inStock: boolean;
        unavailableUntil: string | null;
      };
    }>(`/branches/me/menu/${productId}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    patchLocalProduct(productId, {
      inStock: res.data.inStock,
      unavailableUntil: res.data.unavailableUntil,
    });
  }

  async function patchModifier(
    modifierId: string,
    body: { inStock: true } | { inStock: false; duration: StockDuration },
  ) {
    const token = getAuthToken();
    if (!token) return;
    const res = await apiFetch<{
      data: {
        modifierId: string;
        inStock: boolean;
        unavailableUntil: string | null;
      };
    }>(`/branches/me/modifiers/${modifierId}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    patchLocalModifier(modifierId, {
      inStock: res.data.inStock,
      unavailableUntil: res.data.unavailableUntil,
    });
  }

  async function restoreProducts(productIds: string[]) {
    if (productIds.length === 0) return;
    setBusyKey(`restore:p:${productIds.join(",")}`);
    setError(null);
    try {
      await Promise.all(
        productIds.map((id) => patchProduct(id, { inStock: true })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar");
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function restoreModifiers(modifierIds: string[]) {
    if (modifierIds.length === 0) return;
    setBusyKey(`restore:m:${modifierIds.join(",")}`);
    setError(null);
    try {
      await Promise.all(
        modifierIds.map((id) => patchModifier(id, { inStock: true })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar");
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function applyDuration(duration: StockDuration) {
    if (!pendingOff) return;
    setError(null);
    try {
      if (pendingOff.kind === "product") {
        const ids =
          pendingOff.type === "product"
            ? [pendingOff.id]
            : pendingOff.productIds;
        setBusyKey(
          `off:p:${pendingOff.type === "product" ? pendingOff.id : pendingOff.type === "section" ? pendingOff.id : "bulk"}`,
        );
        await Promise.all(
          ids.map((id) => patchProduct(id, { inStock: false, duration })),
        );
      } else {
        const ids =
          pendingOff.type === "modifier"
            ? [pendingOff.id]
            : pendingOff.modifierIds;
        setBusyKey(
          `off:m:${pendingOff.type === "modifier" ? pendingOff.id : "bulk"}`,
        );
        await Promise.all(
          ids.map((id) => patchModifier(id, { inStock: false, duration })),
        );
      }
      setPendingOff(null);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agotar");
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  function onProductToggle(product: StockProduct, next: boolean) {
    if (next) {
      void restoreProducts([product.id]);
      return;
    }
    setPendingOff({
      kind: "product",
      type: "product",
      id: product.id,
      name: product.name,
    });
  }

  function onSectionToggle(cat: StockCategory, next: boolean) {
    if (next) {
      const out = cat.products.filter((p) => !p.inStock).map((p) => p.id);
      void restoreProducts(out);
      return;
    }
    const inStockIds = cat.products.filter((p) => p.inStock).map((p) => p.id);
    if (inStockIds.length === 0) return;
    setPendingOff({
      kind: "product",
      type: "section",
      id: cat.id,
      name: cat.name,
      productIds: inStockIds,
    });
  }

  function onModifierToggle(modifier: StockModifier, next: boolean) {
    if (next) {
      void restoreModifiers([modifier.id]);
      return;
    }
    setPendingOff({
      kind: "modifier",
      type: "modifier",
      id: modifier.id,
      name: modifier.name,
    });
  }

  function startBulkDisable() {
    if (selectedInStockIds.length === 0) return;
    if (tab === "products") {
      setPendingOff({
        kind: "product",
        type: "bulk",
        productIds: [...selectedInStockIds],
      });
      return;
    }
    setPendingOff({
      kind: "modifier",
      type: "bulk",
      modifierIds: [...selectedInStockIds],
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="page-title">Menú</h2>
          <p className="page-description">Cargando…</p>
        </div>
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  const modalBusy = busyKey?.startsWith("off:") ?? false;
  const showSelectTools = visibleInStockIds.length > 0;
  const searching = q.length > 0;

  function pendingDescription(): string | undefined {
    if (!pendingOff) return undefined;
    if (pendingOff.kind === "product") {
      if (pendingOff.type === "product") {
        return `Sin stock: ${pendingOff.name}`;
      }
      if (pendingOff.type === "section") {
        return `Sin stock en toda la sección “${pendingOff.name}” (${pendingOff.productIds.length} productos)`;
      }
      return `Sin stock en ${pendingOff.productIds.length} productos seleccionados`;
    }
    if (pendingOff.type === "modifier") {
      return `Sin stock: ${pendingOff.name}`;
    }
    return `Sin stock en ${pendingOff.modifierIds.length} modificadores seleccionados`;
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h2 className="page-title">Menú</h2>
        <p className="page-description">
          Activa o desactiva productos, secciones y modificadores. La búsqueda
          filtra ambos listados.
        </p>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto o modificador…"
            className="input-field w-full pl-10"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          aria-pressed={onlyOutOfStock}
          onClick={() => setOnlyOutOfStock((v) => !v)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
            onlyOutOfStock
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-gray-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-border dark:bg-surface-muted dark:text-slate-200 dark:hover:border-orange-700 dark:hover:bg-orange-950/30",
          )}
          title="Mostrar solo sin stock"
        >
          <Filter className="size-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Sin stock</span>
          {outOfStockCount > 0 && (
            <span
              className={cn(
                "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                onlyOutOfStock
                  ? "bg-white/20 text-white"
                  : "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
              )}
            >
              {outOfStockCount}
            </span>
          )}
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Tipo de stock"
        className="flex gap-1 rounded-xl border border-gray-200 bg-slate-50 p-1 dark:border-border dark:bg-surface-muted"
      >
        {(
          [
            {
              id: "products" as const,
              label: "Productos",
              count: searching ? productMatchCount : undefined,
            },
            {
              id: "modifiers" as const,
              label: "Modificadores",
              count: searching ? modifierMatchCount : undefined,
            },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                active
                  ? "bg-white text-slate-900 shadow-sm dark:bg-background dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                    active
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showSelectTools && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            className="btn-secondary btn-compact inline-flex items-center gap-1.5"
          >
            {allVisibleInStockSelected ? (
              <CheckSquare className="size-4" />
            ) : (
              <Square className="size-4" />
            )}
            {allVisibleInStockSelected
              ? "Quitar selección"
              : `Seleccionar visibles (${visibleInStockIds.length})`}
          </button>
          {selectedInStockIds.length > 0 && (
            <button
              type="button"
              disabled={!!busyKey}
              onClick={startBulkDisable}
              className="btn-red btn-compact"
            >
              Agotar seleccionados ({selectedInStockIds.length})
            </button>
          )}
        </div>
      )}

      {tab === "products" ? (
        filteredCategories.length === 0 ? (
          <div className="pwa-card space-y-2 py-8 text-center text-sm text-slate-500">
            <p>
              {onlyOutOfStock && !searching
                ? "No hay productos sin stock."
                : searching
                  ? "Ningún producto coincide con la búsqueda."
                  : "No hay productos habilitados para esta sucursal. El admin debe activarlos en Sucursales → Menú."}
            </p>
            {searching && modifierMatchCount > 0 && (
              <button
                type="button"
                onClick={() => setTab("modifiers")}
                className="link-action"
              >
                Ver {modifierMatchCount} modificador
                {modifierMatchCount === 1 ? "" : "es"} coincidente
                {modifierMatchCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCategories.map((cat) => {
              const allInStock = cat.products.every((p) => p.inStock);
              const sectionBusy =
                busyKey?.includes(cat.id) ||
                cat.products.some((p) => busyKey?.includes(p.id));

              return (
                <section key={cat.id} className="pwa-card space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white">
                      {cat.name}
                    </h3>
                    <StockToggle
                      checked={allInStock}
                      disabled={!!busyKey || sectionBusy}
                      label={`Sección ${cat.name}`}
                      onChange={(next) => onSectionToggle(cat, next)}
                    />
                  </div>

                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-border dark:border-border">
                    {cat.products.map((product) => {
                      const hint = !product.inStock
                        ? stockHint(product.unavailableUntil)
                        : null;
                      const productBusy =
                        busyKey?.includes(product.id) ?? false;
                      const selected = selectedIds.has(product.id);

                      return (
                        <li
                          key={product.id}
                          className={cn(
                            "flex items-start gap-3 bg-white px-3.5 py-3 dark:bg-surface-muted",
                            selected &&
                              "bg-orange-50/80 dark:bg-orange-950/20",
                          )}
                        >
                          {product.inStock ? (
                            <button
                              type="button"
                              aria-pressed={selected}
                              aria-label={
                                selected
                                  ? `Quitar ${product.name} de la selección`
                                  : `Seleccionar ${product.name}`
                              }
                              disabled={!!busyKey}
                              onClick={() => toggleSelected(product.id)}
                              className={cn(
                                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                                selected
                                  ? "border-orange-500 bg-orange-500 text-white"
                                  : "border-gray-300 bg-white text-transparent hover:border-orange-400 dark:border-gray-600 dark:bg-surface-muted",
                              )}
                            >
                              <CheckSquare className="size-3.5" aria-hidden />
                            </button>
                          ) : (
                            <span
                              className="mt-0.5 size-5 shrink-0"
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                product.inStock
                                  ? "text-slate-900 dark:text-white"
                                  : "text-slate-400 line-through",
                              )}
                            >
                              {product.name}
                            </p>
                            <p className="text-xs tabular-nums text-slate-500">
                              {formatMoney(product.basePrice)}
                              {hint ? ` · ${hint}` : ""}
                            </p>
                          </div>
                          <StockToggle
                            checked={product.inStock}
                            disabled={!!busyKey || productBusy}
                            label={product.name}
                            onChange={(next) =>
                              onProductToggle(product, next)
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : filteredModifiers.length === 0 ? (
        <div className="pwa-card space-y-2 py-8 text-center text-sm text-slate-500">
          <p>
            {onlyOutOfStock && !searching
              ? "No hay modificadores sin stock."
              : searching
                ? "Ningún modificador coincide con la búsqueda."
                : "No hay modificadores activos en el catálogo."}
          </p>
          {searching && productMatchCount > 0 && (
            <button
              type="button"
              onClick={() => setTab("products")}
              className="link-action"
            >
              Ver {productMatchCount} producto
              {productMatchCount === 1 ? "" : "s"} coincidente
              {productMatchCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      ) : (
        <section className="pwa-card space-y-3">
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-border dark:border-border">
            {filteredModifiers.map((modifier) => {
              const hint = !modifier.inStock
                ? stockHint(modifier.unavailableUntil)
                : null;
              const modifierBusy = busyKey?.includes(modifier.id) ?? false;
              const selected = selectedIds.has(modifier.id);

              return (
                <li
                  key={modifier.id}
                  className={cn(
                    "flex items-start gap-3 bg-white px-3.5 py-3 dark:bg-surface-muted",
                    selected && "bg-orange-50/80 dark:bg-orange-950/20",
                  )}
                >
                  {modifier.inStock ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={
                        selected
                          ? `Quitar ${modifier.name} de la selección`
                          : `Seleccionar ${modifier.name}`
                      }
                      disabled={!!busyKey}
                      onClick={() => toggleSelected(modifier.id)}
                      className={cn(
                        "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                        selected
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-gray-300 bg-white text-transparent hover:border-orange-400 dark:border-gray-600 dark:bg-surface-muted",
                      )}
                    >
                      <CheckSquare className="size-3.5" aria-hidden />
                    </button>
                  ) : (
                    <span className="mt-0.5 size-5 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        modifier.inStock
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400 line-through",
                      )}
                    >
                      {modifier.name}
                      {modifier.isRequired ? (
                        <span className="ml-1.5 text-[11px] font-medium text-slate-400 no-underline">
                          Obligatorio
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {formatDelta(modifier.priceDelta)}
                      {hint ? ` · ${hint}` : ""}
                    </p>
                  </div>
                  <StockToggle
                    checked={modifier.inStock}
                    disabled={!!busyKey || modifierBusy}
                    label={modifier.name}
                    onChange={(next) => onModifierToggle(modifier, next)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {selectedInStockIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.2)] backdrop-blur dark:border-border dark:bg-background/95">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {selectedInStockIds.length} seleccionados
            </p>
            <button
              type="button"
              disabled={!!busyKey}
              onClick={() => setSelectedIds(new Set())}
              className="btn-secondary btn-compact"
            >
              Limpiar
            </button>
            <button
              type="button"
              disabled={!!busyKey}
              onClick={startBulkDisable}
              className="btn-red btn-compact"
            >
              Agotar
            </button>
          </div>
        </div>
      )}

      <Modal
        open={!!pendingOff}
        onClose={() => {
          if (modalBusy) return;
          setPendingOff(null);
        }}
        title="¿Por cuánto tiempo?"
        description={pendingDescription()}
        footer={
          <button
            type="button"
            disabled={modalBusy}
            onClick={() => setPendingOff(null)}
            className="btn-secondary w-full"
          >
            Cancelar
          </button>
        }
      >
        <div className="grid gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              disabled={modalBusy}
              onClick={() => void applyDuration(opt.value)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50 active:scale-[0.99] disabled:opacity-60 dark:border-border dark:bg-surface-muted dark:hover:border-orange-700 dark:hover:bg-orange-950/30"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {opt.label}
              </span>
              <span className="text-xs text-slate-500">{opt.hint}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
