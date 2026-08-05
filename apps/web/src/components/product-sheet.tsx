"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, UserRoundPlus, X } from "lucide-react";
import { formatMoney, useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

export type MenuModifier = {
  id: string;
  name: string;
  priceDelta: number;
  isRequired: boolean;
  isActive: boolean;
  inStock?: boolean;
};

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  inStock?: boolean;
  category: { id: string; name: string; sortOrder?: number };
  modifiers?: { modifier: MenuModifier }[];
};

type Props = {
  product: MenuProduct | null;
  open: boolean;
  onClose: () => void;
};

export function ProductSheet({ product, open, onClose }: Props) {
  const { addItem, branchId, plates, addPlate, items, setItemPlate } = useCart();
  const [qty, setQty] = useState(1);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [plateId, setPlateId] = useState<string>("");

  const mods = useMemo(() => {
    if (!product)
      return { required: [] as MenuModifier[], optional: [] as MenuModifier[] };
    const list = (product.modifiers ?? [])
      .map((m) => m.modifier)
      .filter((m) => m.isActive);
    return {
      required: list.filter((m) => m.isRequired),
      optional: list.filter((m) => !m.isRequired),
    };
  }, [product]);

  const productInStock = product?.inStock !== false;
  const requiredOutOfStock = mods.required.some((m) => m.inStock === false);
  const canAddToCart = productInStock && !requiredOutOfStock;

  useEffect(() => {
    if (!product) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetea el formulario del sheet al abrir otro producto
    setQty(1);
    setSelectedOptional([]);
    setPlateId(plates.length > 0 ? plates[plates.length - 1]!.id : "");
    // Solo al abrir otro producto; plates se lee al momento de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !product) return null;

  const selectedMods = [
    ...mods.required.filter((m) => m.inStock !== false),
    ...mods.optional.filter(
      (m) => selectedOptional.includes(m.id) && m.inStock !== false,
    ),
  ];
  const unitPrice =
    product.basePrice +
    selectedMods.reduce((sum, m) => sum + m.priceDelta, 0);

  function toggleOptional(id: string) {
    const mod = mods.optional.find((m) => m.id === id);
    if (mod?.inStock === false) return;
    setSelectedOptional((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function startSplit() {
    const person1Id = addPlate("Persona 1");
    const person2Id = addPlate("Persona 2");
    // Lo que ya está en el carrito pertenece a Persona 1
    for (const item of items) {
      setItemPlate(item.lineKey, person1Id);
    }
    // Si ya había productos → este va a Persona 2; si el carrito estaba vacío → Persona 1
    setPlateId(items.length > 0 ? person2Id : person1Id);
  }

  function handleAddPerson() {
    const id = addPlate();
    setPlateId(id);
  }

  function handleAdd() {
    if (!branchId || !canAddToCart) return;
    addItem({
      productId: product!.id,
      name: product!.name,
      unitPrice,
      quantity: qty,
      modifierIds: selectedMods.map((m) => m.id),
      modifierLabels: selectedMods.map((m) => m.name),
      plateId: plateId || (plates[0]?.id ?? null),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {product.name}
              </h2>
              {!productInStock && (
                <span className="status-badge-inactive">Agotado</span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-orange-600">
              desde {formatMoney(product.basePrice)}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary size-9 shrink-0 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {product.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {product.description}
            </p>
          )}

          {!productInStock && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
              Este producto no está disponible por el momento.
            </p>
          )}

          {productInStock && requiredOutOfStock && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
              No se puede pedir: un complemento obligatorio está agotado.
            </p>
          )}

          {mods.required.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Incluido
              </p>
              <ul className="space-y-2">
                {mods.required.map((m) => {
                  const soldOut = m.inStock === false;
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                        soldOut
                          ? "bg-gray-100 dark:bg-gray-800/60"
                          : "bg-orange-50 dark:bg-orange-950/30",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "font-medium",
                            soldOut
                              ? "text-gray-400 line-through dark:text-gray-500"
                              : "text-gray-800 dark:text-white",
                          )}
                        >
                          {m.name}
                        </span>
                        {soldOut && (
                          <span className="status-badge-inactive shrink-0">
                            Agotado
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          soldOut ? "text-gray-400" : "text-orange-600",
                        )}
                      >
                        {m.priceDelta > 0
                          ? `+${formatMoney(m.priceDelta)}`
                          : "Sin costo"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {mods.optional.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Extras opcionales
              </p>
              <ul className="space-y-2">
                {mods.optional.map((m) => {
                  const soldOut = m.inStock === false;
                  const checked =
                    !soldOut && selectedOptional.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        soldOut
                          ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-80 dark:border-gray-800 dark:bg-gray-800/40"
                          : checked
                            ? "cursor-pointer border-orange-400 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/30"
                            : "cursor-pointer border-gray-200 dark:border-gray-700",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={soldOut || !productInStock}
                          onChange={() => toggleOptional(m.id)}
                        />
                        <span
                          className={cn(
                            "font-medium",
                            soldOut
                              ? "text-gray-400 line-through dark:text-gray-500"
                              : "text-gray-800 dark:text-white",
                          )}
                        >
                          {m.name}
                        </span>
                        {soldOut && (
                          <span className="status-badge-inactive shrink-0">
                            Agotado
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          soldOut ? "text-gray-400" : "text-orange-600",
                        )}
                      >
                        {m.priceDelta > 0
                          ? `+${formatMoney(m.priceDelta)}`
                          : "Sin costo"}
                      </span>
                    </label>
                  );
                })}
              </ul>
            </div>
          )}

          {canAddToCart && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Asignar a persona
              </p>
              {plates.length === 0 ? (
                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={startSplit}
                >
                  <UserRoundPlus className="h-4 w-4" />
                  Asignar por persona
                </button>
              ) : (
                <div className="space-y-3">
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Asignar producto a persona"
                  >
                    {plates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlateId(p.id)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          plateId === p.id
                            ? "bg-orange-500 text-white"
                            : "border border-gray-200 bg-white text-gray-600 hover:border-orange-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300",
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-compact w-full sm:w-auto"
                    onClick={handleAddPerson}
                  >
                    <UserRoundPlus className="h-3.5 w-3.5" />
                    Asignar nueva persona
                  </button>
                </div>
              )}
            </div>
          )}

          {canAddToCart && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Cantidad
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary size-9 p-0"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-semibold">{qty}</span>
                <button
                  type="button"
                  className="btn-secondary size-9 p-0"
                  onClick={() => setQty((q) => q + 1)}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          {canAddToCart ? (
            <button
              type="button"
              className="btn-primary w-full py-3"
              onClick={handleAdd}
              disabled={!branchId}
            >
              Agregar al pedido · {formatMoney(unitPrice * qty)}
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary w-full py-3"
              disabled
            >
              Agotado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
