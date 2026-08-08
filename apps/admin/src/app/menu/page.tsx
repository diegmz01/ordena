"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderOpen,
  GripVertical,
  SlidersHorizontal,
  UtensilsCrossed,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type MenuTab = "products" | "categories" | "modifiers";

type Category = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  _count?: { products: number };
};

type Modifier = {
  id: string;
  name: string;
  slug: string;
  priceDelta: number;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  _count?: { products: number };
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  isActive: boolean;
  sortOrder: number;
  allowCombo: boolean;
  categoryId: string;
  category: { id: string; name: string };
  modifiers?: { modifier: Modifier }[];
};

type ProductFormState = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  isActive: boolean;
  allowCombo: boolean;
  modifierIds: string[];
};

type CategoryFormState = {
  name: string;
  isActive: boolean;
};

type ModifierFormState = {
  name: string;
  priceDelta: string;
  isRequired: boolean;
  isActive: boolean;
};

const emptyProductForm = (): ProductFormState => ({
  name: "",
  description: "",
  price: "",
  categoryId: "",
  imageUrl: "",
  isActive: true,
  allowCombo: false,
  modifierIds: [],
});

const emptyCategoryForm = (): CategoryFormState => ({
  name: "",
  isActive: true,
});

const emptyModifierForm = (): ModifierFormState => ({
  name: "",
  priceDelta: "0",
  isRequired: false,
  isActive: true,
});

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminMenuPage() {
  const [tab, setTab] = useState<MenuTab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] =
    useState<ProductFormState>(emptyProductForm());
  const [savingProduct, setSavingProduct] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryForm, setCategoryForm] =
    useState<CategoryFormState>(emptyCategoryForm());
  const [savingCategory, setSavingCategory] = useState(false);

  const [modifierModalOpen, setModifierModalOpen] = useState(false);
  const [editingModifierId, setEditingModifierId] = useState<string | null>(null);
  const [modifierForm, setModifierForm] =
    useState<ModifierFormState>(emptyModifierForm());
  const [savingModifier, setSavingModifier] = useState(false);

  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [reorderCategory, setReorderCategory] = useState<Category | null>(
    null,
  );
  const [reorderList, setReorderList] = useState<Product[]>([]);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [savingReorder, setSavingReorder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [categoryReorderModalOpen, setCategoryReorderModalOpen] =
    useState(false);
  const [categoryReorderList, setCategoryReorderList] = useState<Category[]>(
    [],
  );
  const [categoryReorderError, setCategoryReorderError] = useState<
    string | null
  >(null);
  const [savingCategoryReorder, setSavingCategoryReorder] = useState(false);
  const [categoryDragIndex, setCategoryDragIndex] = useState<number | null>(
    null,
  );

  const tokenOrThrow = useCallback(() => {
    const token = getAuthToken();
    if (!token) throw new Error("Inicia sesión como admin");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenOrThrow();
      const [productsRes, categoriesRes, modifiersRes] = await Promise.all([
        apiFetch<{ data: Product[] }>("/menu/admin/products", token),
        apiFetch<{ data: Category[] }>("/menu/admin/categories", token),
        apiFetch<{ data: Modifier[] }>("/menu/admin/modifiers", token),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setModifiers(modifiersRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar menú");
    } finally {
      setLoading(false);
    }
  }, [tokenOrThrow]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del menú al montar
    void load();
  }, [load]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          a.category.name.localeCompare(b.category.name) ||
          a.name.localeCompare(b.name),
      ),
    [products],
  );

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [categories],
  );

  const sortedModifiers = useMemo(
    () => [...modifiers].sort((a, b) => a.name.localeCompare(b.name)),
    [modifiers],
  );

  const activeModifiers = useMemo(
    () => sortedModifiers.filter((m) => m.isActive),
    [sortedModifiers],
  );

  function switchTab(next: MenuTab) {
    setTab(next);
    setSuccess(null);
    setError(null);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm());
    setFormError(null);
  }

  function openCreateProduct() {
    setEditingProductId(null);
    setProductForm({
      ...emptyProductForm(),
      categoryId:
        categories.find((c) => c.isActive)?.id ?? categories[0]?.id ?? "",
    });
    setFormError(null);
    setSuccess(null);
    setProductModalOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      price: (product.basePrice / 100).toFixed(2),
      categoryId: product.categoryId,
      imageUrl: product.imageUrl ?? "",
      isActive: product.isActive,
      allowCombo: product.allowCombo,
      modifierIds: (product.modifiers ?? []).map((m) => m.modifier.id),
    });
    setFormError(null);
    setSuccess(null);
    setProductModalOpen(true);
  }

  function toggleProductModifier(modifierId: string) {
    setProductForm((f) => ({
      ...f,
      modifierIds: f.modifierIds.includes(modifierId)
        ? f.modifierIds.filter((id) => id !== modifierId)
        : [...f.modifierIds, modifierId],
    }));
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setSavingProduct(true);
    setFormError(null);

    try {
      const token = tokenOrThrow();
      const price = Number(productForm.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("Precio inválido");
      }
      if (!productForm.categoryId) {
        throw new Error("Selecciona una categoría");
      }

      const payload = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price,
        categoryId: productForm.categoryId,
        imageUrl: productForm.imageUrl.trim() || null,
        isActive: productForm.isActive,
        allowCombo: productForm.allowCombo,
        modifierIds: productForm.modifierIds,
      };

      if (editingProductId) {
        await apiFetch(`/menu/admin/products/${editingProductId}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setSuccess("Producto actualizado");
      } else {
        await apiFetch("/menu/admin/products", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Producto creado");
      }

      closeProductModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingProduct(false);
    }
  }

  function closeCategoryModal() {
    setCategoryModalOpen(false);
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm());
    setFormError(null);
  }

  function openCreateCategory() {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm());
    setFormError(null);
    setSuccess(null);
    setCategoryModalOpen(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name,
      isActive: category.isActive,
    });
    setFormError(null);
    setSuccess(null);
    setCategoryModalOpen(true);
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    setSavingCategory(true);
    setFormError(null);
    try {
      const token = tokenOrThrow();
      const payload = {
        name: categoryForm.name.trim(),
        isActive: categoryForm.isActive,
      };

      if (editingCategoryId) {
        await apiFetch(`/menu/admin/categories/${editingCategoryId}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setSuccess("Categoría actualizada");
      } else {
        await apiFetch("/menu/admin/categories", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Categoría creada");
      }

      closeCategoryModal();
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar categoría",
      );
    } finally {
      setSavingCategory(false);
    }
  }

  function closeModifierModal() {
    setModifierModalOpen(false);
    setEditingModifierId(null);
    setModifierForm(emptyModifierForm());
    setFormError(null);
  }

  function openCreateModifier() {
    setEditingModifierId(null);
    setModifierForm(emptyModifierForm());
    setFormError(null);
    setSuccess(null);
    setModifierModalOpen(true);
  }

  function openEditModifier(modifier: Modifier) {
    setEditingModifierId(modifier.id);
    setModifierForm({
      name: modifier.name,
      priceDelta: (modifier.priceDelta / 100).toFixed(2),
      isRequired: modifier.isRequired,
      isActive: modifier.isActive,
    });
    setFormError(null);
    setSuccess(null);
    setModifierModalOpen(true);
  }

  async function saveModifier(event: FormEvent) {
    event.preventDefault();
    setSavingModifier(true);
    setFormError(null);
    try {
      const token = tokenOrThrow();
      const priceDelta = Number(modifierForm.priceDelta);
      if (!Number.isFinite(priceDelta) || priceDelta < 0) {
        throw new Error("Incremento de precio inválido");
      }

      const payload = {
        name: modifierForm.name.trim(),
        priceDelta,
        isRequired: modifierForm.isRequired,
        isActive: modifierForm.isActive,
      };

      if (editingModifierId) {
        await apiFetch(`/menu/admin/modifiers/${editingModifierId}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setSuccess("Modificador actualizado");
      } else {
        await apiFetch("/menu/admin/modifiers", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Modificador creado");
      }

      closeModifierModal();
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar modificador",
      );
    } finally {
      setSavingModifier(false);
    }
  }

  function closeReorderModal() {
    setReorderModalOpen(false);
    setReorderCategory(null);
    setReorderList([]);
    setReorderError(null);
    setDragIndex(null);
  }

  function openReorderProducts(category: Category) {
    setReorderCategory(category);
    setReorderList(
      products
        .filter((p) => p.categoryId === category.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    );
    setReorderError(null);
    setSuccess(null);
    setReorderModalOpen(true);
  }

  function moveReorderItem(from: number, to: number) {
    if (to < 0 || to >= reorderList.length || from === to) return;
    setReorderList((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveReorder() {
    if (!reorderCategory) return;
    setSavingReorder(true);
    setReorderError(null);
    try {
      const token = tokenOrThrow();
      await apiFetch(
        `/menu/admin/categories/${reorderCategory.id}/products/reorder`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            productIds: reorderList.map((p) => p.id),
          }),
        },
      );
      setSuccess("Orden de productos actualizado");
      closeReorderModal();
      await load();
    } catch (err) {
      setReorderError(
        err instanceof Error ? err.message : "No se pudo guardar el orden",
      );
    } finally {
      setSavingReorder(false);
    }
  }

  function closeCategoryReorderModal() {
    setCategoryReorderModalOpen(false);
    setCategoryReorderList([]);
    setCategoryReorderError(null);
    setCategoryDragIndex(null);
  }

  function openReorderCategories() {
    setCategoryReorderList(sortedCategories);
    setCategoryReorderError(null);
    setSuccess(null);
    setCategoryReorderModalOpen(true);
  }

  function moveCategoryReorderItem(from: number, to: number) {
    if (to < 0 || to >= categoryReorderList.length || from === to) return;
    setCategoryReorderList((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveCategoryReorder() {
    setSavingCategoryReorder(true);
    setCategoryReorderError(null);
    try {
      const token = tokenOrThrow();
      await apiFetch("/menu/admin/categories/reorder", token, {
        method: "PATCH",
        body: JSON.stringify({
          categoryIds: categoryReorderList.map((c) => c.id),
        }),
      });
      setSuccess("Orden de categorías actualizado");
      closeCategoryReorderModal();
      await load();
    } catch (err) {
      setCategoryReorderError(
        err instanceof Error ? err.message : "No se pudo guardar el orden",
      );
    } finally {
      setSavingCategoryReorder(false);
    }
  }

  const headerAction =
    tab === "categories" ? (
      <>
        <button
          type="button"
          className="btn-secondary"
          onClick={openReorderCategories}
          disabled={categories.length < 2}
          title={
            categories.length < 2
              ? "Se necesitan al menos 2 categorías para ordenar"
              : undefined
          }
        >
          Ordenar categorías
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={openCreateCategory}
        >
          Nueva categoría
        </button>
      </>
    ) : tab === "modifiers" ? (
      <button
        type="button"
        className="btn-primary"
        onClick={openCreateModifier}
      >
        Nuevo modificador
      </button>
    ) : (
      <button
        type="button"
        className="btn-primary"
        onClick={openCreateProduct}
        disabled={categories.length === 0}
        title={
          categories.length === 0 ? "Crea una categoría primero" : undefined
        }
      >
        Nuevo producto
      </button>
    );

  return (
    <div className="space-y-4">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h1 className="page-title">Menú</h1>
            <p className="page-description">
              Administra categorías, productos y modificadores del restaurante.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{headerAction}</div>
        </div>

        <div className="admin-panel-toolbar">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "products" && "admin-tab-pill-active",
              )}
              onClick={() => switchTab("products")}
            >
              <UtensilsCrossed className="h-4 w-4" />
              Productos
              <span className="text-xs opacity-70">({products.length})</span>
            </button>
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "categories" && "admin-tab-pill-active",
              )}
              onClick={() => switchTab("categories")}
            >
              <FolderOpen className="h-4 w-4" />
              Categorías
              <span className="text-xs opacity-70">({categories.length})</span>
            </button>
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "modifiers" && "admin-tab-pill-active",
              )}
              onClick={() => switchTab("modifiers")}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Modificadores
              <span className="text-xs opacity-70">({modifiers.length})</span>
            </button>
          </div>

          {error && <p className="admin-alert-error">{error}</p>}
          {success && <p className="pwa-alert-brand">{success}</p>}
          {!loading && tab === "products" && categories.length === 0 && (
            <p className="pwa-alert-brand">
              Primero crea una categoría en el tab Categorías para poder agregar
              productos.
            </p>
          )}
        </div>

        {loading ? (
          <div className="admin-panel-body">
            <p className="text-sm text-gray-500">Cargando menú…</p>
          </div>
        ) : tab === "products" ? (
          sortedProducts.length === 0 ? (
            <div className="admin-panel-body">
              <div className="admin-empty">
                Aún no hay productos. Usa “Nuevo producto” para agregar el
                primero.
              </div>
            </div>
          ) : (
            <div className="admin-panel-table">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Categoría
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Precio
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Modificadores
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {sortedProducts.map((product) => {
                        const productMods = product.modifiers ?? [];
                        return (
                          <tr
                            key={product.id}
                            className="cursor-pointer transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-950/10"
                            onClick={() => openEditProduct(product)}
                          >
                            <td className="px-4 py-3.5">
                              <p className="font-medium text-gray-800 dark:text-white">
                                {product.name}
                              </p>
                              {product.description && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                                  {product.description}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                              {product.category.name}
                            </td>
                            <td className="px-4 py-3.5 font-medium text-orange-600">
                              {formatMoney(product.basePrice)}
                            </td>
                            <td className="px-4 py-3.5">
                              {productMods.length === 0 ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {productMods.slice(0, 3).map(({ modifier }) => (
                                    <span
                                      key={modifier.id}
                                      className="status-badge-brand"
                                    >
                                      {modifier.name}
                                    </span>
                                  ))}
                                  {productMods.length > 3 && (
                                    <span className="text-xs text-gray-500">
                                      +{productMods.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {product.isActive ? (
                                <span className="status-badge-active">
                                  Activo
                                </span>
                              ) : (
                                <span className="status-badge-inactive">
                                  Inactivo
                                </span>
                              )}
                            </td>
                            <td
                              className="px-4 py-3.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn-secondary btn-compact"
                                  onClick={() => openEditProduct(product)}
                                >
                                  Editar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
          ) : tab === "categories" ? (
            sortedCategories.length === 0 ? (
              <div className="admin-panel-body">
                <div className="admin-empty">
                  Aún no hay categorías. Usa “Nueva categoría” para crear la
                  primera.
                </div>
              </div>
            ) : (
              <div className="admin-panel-table">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Productos
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedCategories.map((category) => (
                      <tr
                        key={category.id}
                        className="cursor-pointer transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-950/10"
                        onClick={() => openEditCategory(category)}
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-800 dark:text-white">
                            {category.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {category.slug}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                          {category._count?.products ?? 0}
                        </td>
                        <td className="px-4 py-3.5">
                          {category.isActive ? (
                            <span className="status-badge-active">Activa</span>
                          ) : (
                            <span className="status-badge-inactive">
                              Inactiva
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-secondary btn-compact"
                              onClick={() => openEditCategory(category)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-compact"
                              onClick={() => openReorderProducts(category)}
                              disabled={(category._count?.products ?? 0) < 2}
                              title={
                                (category._count?.products ?? 0) < 2
                                  ? "Se necesitan al menos 2 productos para ordenar"
                                  : undefined
                              }
                            >
                              Ordenar productos
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : sortedModifiers.length === 0 ? (
            <div className="admin-panel-body">
              <div className="admin-empty">
                Aún no hay modificadores. Crea extras (ej. Extra queso +$20) y
                asígnalos a productos.
              </div>
            </div>
          ) : (
            <div className="admin-panel-table">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Modificador
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Incremento
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Productos
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedModifiers.map((modifier) => (
                    <tr
                      key={modifier.id}
                      className="cursor-pointer transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-950/10"
                      onClick={() => openEditModifier(modifier)}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white">
                          {modifier.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {modifier.slug}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-orange-600">
                        +{formatMoney(modifier.priceDelta)}
                      </td>
                      <td className="px-4 py-3.5">
                        {modifier.isRequired ? (
                          <span className="status-badge-brand">
                            Obligatorio
                          </span>
                        ) : (
                          <span className="status-badge-inactive">
                            Opcional
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {modifier._count?.products ?? 0}
                      </td>
                      <td className="px-4 py-3.5">
                        {modifier.isActive ? (
                          <span className="status-badge-active">Activo</span>
                        ) : (
                          <span className="status-badge-inactive">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => openEditModifier(modifier)}
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal
        open={productModalOpen}
        onClose={closeProductModal}
        title={editingProductId ? "Editar producto" : "Nuevo producto"}
        description="Asigna modificadores para que el cliente pueda incrementar el precio."
        wide
      >
        <form onSubmit={saveProduct} className="space-y-4">
          {formError && <p className="admin-alert-error">{formError}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="product-name">
                Nombre
              </label>
              <input
                id="product-name"
                className="input-field"
                value={productForm.name}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                minLength={2}
                autoFocus
              />
            </div>
            <div>
              <label className="field-label" htmlFor="product-price">
                Precio base (MXN)
              </label>
              <input
                id="product-price"
                type="number"
                step="0.01"
                min="0.01"
                className="input-field"
                value={productForm.price}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, price: e.target.value }))
                }
                required
                placeholder="120.00"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="product-category">
                Categoría
              </label>
              <select
                id="product-category"
                className="input-field"
                value={productForm.categoryId}
                onChange={(e) =>
                  setProductForm((f) => ({
                    ...f,
                    categoryId: e.target.value,
                  }))
                }
                required
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {!cat.isActive ? " (inactiva)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="product-image">
                URL imagen (opcional)
              </label>
              <input
                id="product-image"
                type="url"
                className="input-field"
                value={productForm.imageUrl}
                onChange={(e) =>
                  setProductForm((f) => ({
                    ...f,
                    imageUrl: e.target.value,
                  }))
                }
                placeholder="https://…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="product-description">
                Descripción
              </label>
              <textarea
                id="product-description"
                className="input-field min-h-24 py-2"
                value={productForm.description}
                onChange={(e) =>
                  setProductForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <p className="field-label">Modificadores</p>
              {modifiers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay modificadores. Créalos en el tab Modificadores.
                </p>
              ) : (
                <div className="mt-1 grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-2">
                  {sortedModifiers.map((modifier) => {
                    const checked = productForm.modifierIds.includes(
                      modifier.id,
                    );
                    return (
                      <label
                        key={modifier.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          checked
                            ? "bg-orange-50 dark:bg-orange-950/30"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800/60",
                          !modifier.isActive && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleProductModifier(modifier.id)}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-white">
                            {modifier.name}
                          </span>
                          <span className="ml-1 text-orange-600">
                            +{formatMoney(modifier.priceDelta)}
                          </span>
                          <span className="ml-1 text-xs text-gray-400">
                            · {modifier.isRequired ? "obligatorio" : "opcional"}
                          </span>
                          {!modifier.isActive && (
                            <span className="ml-1 text-xs text-gray-400">
                              (inactivo)
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {activeModifiers.length > 0 &&
                productForm.modifierIds.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {productForm.modifierIds.length} seleccionados · el cliente
                    suma el incremento al precio base.
                  </p>
                )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">
              <input
                type="checkbox"
                checked={productForm.isActive}
                onChange={(e) =>
                  setProductForm((f) => ({
                    ...f,
                    isActive: e.target.checked,
                  }))
                }
              />
              Producto activo (visible en el menú)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">
              <input
                type="checkbox"
                checked={productForm.allowCombo}
                onChange={(e) =>
                  setProductForm((f) => ({
                    ...f,
                    allowCombo: e.target.checked,
                  }))
                }
              />
              Permitir combinar (el cliente puede combinarlo con otro
              producto de la misma categoría; el precio final es el del
              producto más caro)
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeProductModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingProduct}
            >
              {savingProduct
                ? "Guardando…"
                : editingProductId
                  ? "Guardar cambios"
                  : "Crear producto"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={categoryModalOpen}
        onClose={closeCategoryModal}
        title={editingCategoryId ? "Editar categoría" : "Nueva categoría"}
        description="Agrupa productos del menú (ej. Bebidas, Tacos)."
      >
        <form onSubmit={saveCategory} className="space-y-4">
          {formError && <p className="admin-alert-error">{formError}</p>}
          <div>
            <label className="field-label" htmlFor="category-name">
              Nombre
            </label>
            <input
              id="category-name"
              className="input-field"
              placeholder="Ej. Bebidas, Tacos, Postres"
              value={categoryForm.name}
              onChange={(e) =>
                setCategoryForm((f) => ({ ...f, name: e.target.value }))
              }
              required
              minLength={2}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={categoryForm.isActive}
              onChange={(e) =>
                setCategoryForm((f) => ({
                  ...f,
                  isActive: e.target.checked,
                }))
              }
            />
            Categoría activa
          </label>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeCategoryModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingCategory}
            >
              {savingCategory
                ? "Guardando…"
                : editingCategoryId
                  ? "Guardar cambios"
                  : "Crear categoría"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modifierModalOpen}
        onClose={closeModifierModal}
        title={editingModifierId ? "Editar modificador" : "Nuevo modificador"}
        description="Extra opcional reutilizable (ej. Extra queso) con incremento de precio."
      >
        <form onSubmit={saveModifier} className="space-y-4">
          {formError && <p className="admin-alert-error">{formError}</p>}
          <div>
            <label className="field-label" htmlFor="modifier-name">
              Nombre
            </label>
            <input
              id="modifier-name"
              className="input-field"
              placeholder="Ej. Extra queso, Sin cebolla, Doble carne"
              value={modifierForm.name}
              onChange={(e) =>
                setModifierForm((f) => ({ ...f, name: e.target.value }))
              }
              required
              minLength={2}
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="modifier-price">
              Incremento de precio (MXN)
            </label>
            <input
              id="modifier-price"
              type="number"
              step="0.01"
              min="0"
              className="input-field"
              value={modifierForm.priceDelta}
              onChange={(e) =>
                setModifierForm((f) => ({ ...f, priceDelta: e.target.value }))
              }
              required
              placeholder="20.00"
            />
            <p className="mt-1 text-xs text-gray-500">
              Se suma al precio base del producto cuando el cliente lo elige.
              Usa 0 para opciones sin costo.
            </p>
          </div>
          <div>
            <p className="field-label">Tipo</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  "admin-tab-pill",
                  !modifierForm.isRequired && "admin-tab-pill-active",
                )}
                onClick={() =>
                  setModifierForm((f) => ({ ...f, isRequired: false }))
                }
              >
                Opcional
              </button>
              <button
                type="button"
                className={cn(
                  "admin-tab-pill",
                  modifierForm.isRequired && "admin-tab-pill-active",
                )}
                onClick={() =>
                  setModifierForm((f) => ({ ...f, isRequired: true }))
                }
              >
                Obligatorio
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {modifierForm.isRequired
                ? "Se incluye siempre en el producto; el cliente no puede quitarlo."
                : "El cliente decide si agregarlo o no al producto."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={modifierForm.isActive}
              onChange={(e) =>
                setModifierForm((f) => ({
                  ...f,
                  isActive: e.target.checked,
                }))
              }
            />
            Modificador activo
          </label>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeModifierModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingModifier}
            >
              {savingModifier
                ? "Guardando…"
                : editingModifierId
                  ? "Guardar cambios"
                  : "Crear modificador"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={reorderModalOpen}
        onClose={closeReorderModal}
        title="Ordenar productos"
        description={
          reorderCategory
            ? `Arrastra los productos de “${reorderCategory.name}” para definir el orden en que se muestran al cliente.`
            : undefined
        }
      >
        <div className="space-y-4">
          {reorderError && <p className="admin-alert-error">{reorderError}</p>}

          {reorderList.length === 0 ? (
            <p className="text-sm text-gray-500">
              Esta categoría no tiene productos para ordenar.
            </p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {reorderList.map((product, index) => (
                <li
                  key={product.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex === null || dragIndex === index) return;
                    moveReorderItem(dragIndex, index);
                    setDragIndex(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800",
                    dragIndex === index && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" />
                  <span className="w-5 shrink-0 text-xs text-gray-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-white">
                    {product.name}
                  </span>
                  {!product.isActive && (
                    <span className="status-badge-inactive shrink-0">
                      Inactivo
                    </span>
                  )}
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveReorderItem(index, index - 1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveReorderItem(index, index + 1)}
                      disabled={index === reorderList.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeReorderModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveReorder}
              disabled={savingReorder || reorderList.length === 0}
            >
              {savingReorder ? "Guardando…" : "Guardar orden"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryReorderModalOpen}
        onClose={closeCategoryReorderModal}
        title="Ordenar categorías"
        description="Arrastra las categorías para definir el orden en que se muestran en el menú del cliente."
      >
        <div className="space-y-4">
          {categoryReorderError && (
            <p className="admin-alert-error">{categoryReorderError}</p>
          )}

          {categoryReorderList.length === 0 ? (
            <p className="text-sm text-gray-500">No hay categorías.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {categoryReorderList.map((category, index) => (
                <li
                  key={category.id}
                  draggable
                  onDragStart={() => setCategoryDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (
                      categoryDragIndex === null ||
                      categoryDragIndex === index
                    )
                      return;
                    moveCategoryReorderItem(categoryDragIndex, index);
                    setCategoryDragIndex(index);
                  }}
                  onDragEnd={() => setCategoryDragIndex(null)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800",
                    categoryDragIndex === index && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" />
                  <span className="w-5 shrink-0 text-xs text-gray-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-white">
                    {category.name}
                  </span>
                  {!category.isActive && (
                    <span className="status-badge-inactive shrink-0">
                      Inactiva
                    </span>
                  )}
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveCategoryReorderItem(index, index - 1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveCategoryReorderItem(index, index + 1)}
                      disabled={index === categoryReorderList.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeCategoryReorderModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveCategoryReorder}
              disabled={
                savingCategoryReorder || categoryReorderList.length === 0
              }
            >
              {savingCategoryReorder ? "Guardando…" : "Guardar orden"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
