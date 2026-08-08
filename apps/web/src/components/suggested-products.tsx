"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { comboProductName } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatMoney, useCart } from "@/lib/cart";

type Suggestion = {
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  modifierIds: string[];
  modifierLabels: string[];
  secondaryProductId: string | null;
  secondaryName: string | null;
  timesOrdered: number;
};

function suggestionKey(s: Suggestion) {
  return `${s.productId}::${s.secondaryProductId ?? ""}::${s.modifierIds.join(",")}`;
}

export function SuggestedProducts({ branchId }: { branchId: string }) {
  const { addItem, plates } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [addedKey, setAddedKey] = useState<string | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia sugerencias si la sesión se pierde al cambiar de sucursal
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    apiFetch<{ data: Suggestion[] }>(
      `/orders/suggestions?branchId=${branchId}`,
      token,
    )
      .then((res) => {
        if (!cancelled) setSuggestions(res.data);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (suggestions.length === 0) return null;

  function handleAdd(s: Suggestion) {
    addItem({
      productId: s.productId,
      name: s.name,
      unitPrice: s.unitPrice,
      modifierIds: s.modifierIds,
      modifierLabels: s.modifierLabels,
      plateId: plates.length > 0 ? plates[plates.length - 1]!.id : null,
      secondaryProductId: s.secondaryProductId,
      secondaryName: s.secondaryName,
    });
    const key = suggestionKey(s);
    setAddedKey(key);
    setTimeout(() => setAddedKey((prev) => (prev === key ? null : prev)), 1200);
  }

  return (
    <div className="mb-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-600">
        <Sparkles className="h-3.5 w-3.5" />
        Productos sugeridos para ti
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((s) => {
          const key = suggestionKey(s);
          const displayName = comboProductName(s.name, s.secondaryName);
          return (
            <div
              key={key}
              className="customer-card flex w-52 shrink-0 flex-col gap-2 p-3"
            >
              <div>
                <p className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {displayName}
                </p>
                {s.modifierLabels.length > 0 && (
                  <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                    {s.modifierLabels.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-orange-600">
                  {formatMoney(s.unitPrice)}
                </span>
                <button
                  type="button"
                  className={
                    addedKey === key
                      ? "inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-green-600 px-3 text-xs font-semibold text-white transition"
                      : "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600"
                  }
                  onClick={() => handleAdd(s)}
                  aria-label={`Agregar ${displayName} al pedido`}
                >
                  {addedKey === key ? "Agregado" : <Plus className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
