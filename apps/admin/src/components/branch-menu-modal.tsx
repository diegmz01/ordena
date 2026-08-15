"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { BranchHours } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { Modal } from "@/components/ui/modal";
import {
  WeeklyHoursEditor,
  defaultWeeklyHours,
  normalizeWeeklyHours,
} from "@/components/weekly-hours-editor";
import { cn } from "@/lib/utils";

type MenuProduct = {
  id: string;
  name: string;
  isActive: boolean;
  basePrice: number;
  available: boolean;
  schedule: BranchHours | null;
};

type MenuCategory = {
  id: string;
  name: string;
  schedule: BranchHours | null;
  products: MenuProduct[];
};

type MenuData = {
  branchId: string;
  branchName: string;
  categories: MenuCategory[];
};

type Props = {
  branchId: string | null;
  branchName?: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BranchMenuModal({
  branchId,
  branchName,
  open,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [titleName, setTitleName] = useState(branchName ?? "");
  const [scheduleOpenFor, setScheduleOpenFor] = useState<string | null>(null);
  const [categoryScheduleOpenFor, setCategoryScheduleOpenFor] = useState<
    string | null
  >(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Inicia sesión como admin");
      const res = await apiFetch<{ data: MenuData }>(
        `/branches/admin/${id}/menu`,
        token,
      );
      setCategories(res.data.categories);
      setTitleName(res.data.branchName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar menú");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && branchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del menú de la sucursal al abrir el modal
      void load(branchId);
    }
    if (!open) {
      setCategories([]);
      setError(null);
      setScheduleOpenFor(null);
      setCategoryScheduleOpenFor(null);
    }
  }, [open, branchId, load]);

  function setProductAvailable(productId: string, available: boolean) {
    setCategories((cats) =>
      cats.map((cat) => ({
        ...cat,
        products: cat.products.map((p) =>
          p.id === productId ? { ...p, available } : p,
        ),
      })),
    );
  }

  function setProductSchedule(productId: string, schedule: BranchHours | null) {
    setCategories((cats) =>
      cats.map((cat) => ({
        ...cat,
        products: cat.products.map((p) =>
          p.id === productId ? { ...p, schedule } : p,
        ),
      })),
    );
  }

  function toggleProductSchedule(product: MenuProduct) {
    if (product.schedule) {
      setProductSchedule(product.id, null);
      setScheduleOpenFor(null);
      return;
    }
    setProductSchedule(product.id, defaultWeeklyHours());
    setScheduleOpenFor(product.id);
  }

  function setCategorySchedule(categoryId: string, schedule: BranchHours | null) {
    setCategories((cats) =>
      cats.map((cat) => (cat.id === categoryId ? { ...cat, schedule } : cat)),
    );
  }

  function toggleCategorySchedule(cat: MenuCategory) {
    if (cat.schedule) {
      setCategorySchedule(cat.id, null);
      setCategoryScheduleOpenFor(null);
      return;
    }
    setCategorySchedule(cat.id, defaultWeeklyHours());
    setCategoryScheduleOpenFor(cat.id);
    setScheduleOpenFor(null);
  }

  function setCategoryAvailable(categoryId: string, available: boolean) {
    setCategories((cats) =>
      cats.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              products: cat.products.map((p) => ({ ...p, available })),
            }
          : cat,
      ),
    );
  }

  function categoryState(cat: MenuCategory): "all" | "none" | "some" {
    if (cat.products.length === 0) return "none";
    const on = cat.products.filter((p) => p.available).length;
    if (on === 0) return "none";
    if (on === cat.products.length) return "all";
    return "some";
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!branchId) return;
    setSaving(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Inicia sesión como admin");
      const items = categories.flatMap((cat) =>
        cat.products.map((p) => ({
          productId: p.id,
          available: p.available,
          schedule: cat.schedule ? null : p.schedule,
        })),
      );
      if (items.length === 0) {
        throw new Error("No hay productos para configurar");
      }
      const categoriesPayload = categories.map((cat) => ({
        categoryId: cat.id,
        schedule: cat.schedule,
      }));
      await apiFetch(`/branches/admin/${branchId}/menu`, token, {
        method: "PUT",
        body: JSON.stringify({ items, categories: categoriesPayload }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Menú de la sucursal"
      description={
        titleName
          ? `Qué vende “${titleName}” del menú global (mismos precios). No es stock temporal.`
          : "Qué vende esta sucursal del menú global (mismos precios). No es stock temporal."
      }
      wide
    >
      <form onSubmit={save} className="space-y-4">
        {error && <p className="admin-alert-error">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Cargando menú…</p>
        ) : categories.length === 0 ? (
          <div className="admin-empty">
            No hay categorías/productos. Créalos primero en Menú.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {categories.map((cat) => {
              const state = categoryState(cat);
              return (
                <div
                  key={cat.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white">
                        {cat.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {cat.products.filter((p) => p.available).length}/
                        {cat.products.length} habilitados
                        {cat.schedule && " · con horario limitado"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium",
                          cat.schedule
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400",
                        )}
                        onClick={() =>
                          setCategoryScheduleOpenFor((cur) =>
                            cur === cat.id ? null : cat.id,
                          )
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Horario
                      </button>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 text-sm",
                          cat.products.length === 0 && "opacity-40",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={state === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = state === "some";
                          }}
                          disabled={cat.products.length === 0}
                          onChange={(e) =>
                            setCategoryAvailable(cat.id, e.target.checked)
                          }
                        />
                        Toda la categoría
                      </label>
                    </div>
                  </div>
                  {categoryScheduleOpenFor === cat.id && (
                    <div className="space-y-2 border-b border-gray-100 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={!!cat.schedule}
                          onChange={() => toggleCategorySchedule(cat)}
                        />
                        Disponible solo en horario limitado
                      </label>
                      <p className="text-xs text-gray-500">
                        Aplica a todos los productos de esta categoría y
                        reemplaza el horario individual de cada uno.
                      </p>
                      {cat.schedule && (
                        <WeeklyHoursEditor
                          value={normalizeWeeklyHours(cat.schedule)}
                          onChange={(schedule) =>
                            setCategorySchedule(cat.id, schedule)
                          }
                        />
                      )}
                    </div>
                  )}
                  {cat.products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">
                      Sin productos en esta categoría.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {cat.products.map((product) => (
                        <li key={product.id} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-800 dark:text-white">
                                {product.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatMoney(product.basePrice)}
                                {!product.isActive && " · inactivo en catálogo"}
                                {cat.schedule
                                  ? " · sigue el horario de la categoría"
                                  : product.schedule &&
                                    " · con horario limitado"}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <button
                                type="button"
                                disabled={!!cat.schedule}
                                title={
                                  cat.schedule
                                    ? "Esta categoría ya tiene un horario asignado"
                                    : undefined
                                }
                                className={cn(
                                  "flex items-center gap-1 text-xs font-medium",
                                  cat.schedule
                                    ? "cursor-not-allowed text-gray-300 dark:text-gray-600"
                                    : product.schedule
                                      ? "text-orange-600 dark:text-orange-400"
                                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400",
                                )}
                                onClick={() =>
                                  setScheduleOpenFor((cur) =>
                                    cur === product.id ? null : product.id,
                                  )
                                }
                              >
                                <Clock className="h-3.5 w-3.5" />
                                Horario
                              </button>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <input
                                  type="checkbox"
                                  checked={product.available}
                                  onChange={(e) =>
                                    setProductAvailable(
                                      product.id,
                                      e.target.checked,
                                    )
                                  }
                                />
                                Habilitado
                              </label>
                            </div>
                          </div>
                          {!cat.schedule && scheduleOpenFor === product.id && (
                            <div className="mt-2.5 space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                                <input
                                  type="checkbox"
                                  checked={!!product.schedule}
                                  onChange={() => toggleProductSchedule(product)}
                                />
                                Disponible solo en horario limitado
                              </label>
                              {product.schedule && (
                                <WeeklyHoursEditor
                                  value={normalizeWeeklyHours(product.schedule)}
                                  onChange={(schedule) =>
                                    setProductSchedule(product.id, schedule)
                                  }
                                />
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || loading || categories.length === 0}
          >
            {saving ? "Guardando…" : "Guardar menú"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
