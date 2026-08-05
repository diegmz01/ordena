"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type MenuProduct = {
  id: string;
  name: string;
  isActive: boolean;
  basePrice: number;
  available: boolean;
};

type MenuCategory = {
  id: string;
  name: string;
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
      void load(branchId);
    }
    if (!open) {
      setCategories([]);
      setError(null);
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
        })),
      );
      if (items.length === 0) {
        throw new Error("No hay productos para configurar");
      }
      await apiFetch(`/branches/admin/${branchId}/menu`, token, {
        method: "PUT",
        body: JSON.stringify({ items }),
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
                      </p>
                    </div>
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
                  {cat.products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">
                      Sin productos en esta categoría.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {cat.products.map((product) => (
                        <li
                          key={product.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-white">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatMoney(product.basePrice)}
                              {!product.isActive && " · inactivo en catálogo"}
                            </p>
                          </div>
                          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
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
