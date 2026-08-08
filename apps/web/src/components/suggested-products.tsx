"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import { comboProductName } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatMoney, makeLineKey, useCart } from "@/lib/cart";

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

export function SuggestedProducts({ branchId }: { branchId: string }) {
  const { addItem, setQuantity, items, plates } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  // Trackpads mandan wheel horizontal, pero un mouse normal en desktop solo
  // manda deltaY: sin esto, la fila es inalcanzable con scrollbar oculta.
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    el.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  const targetPlateId = plates.length > 0 ? plates[plates.length - 1]!.id : null;

  function lineKeyFor(s: Suggestion) {
    return makeLineKey(s.productId, s.modifierIds, targetPlateId, s.secondaryProductId);
  }

  function handleAdd(s: Suggestion) {
    addItem({
      productId: s.productId,
      name: s.name,
      unitPrice: s.unitPrice,
      modifierIds: s.modifierIds,
      modifierLabels: s.modifierLabels,
      plateId: targetPlateId,
      secondaryProductId: s.secondaryProductId,
      secondaryName: s.secondaryName,
    });
  }

  return (
    <div className="mb-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-600">
        <Sparkles className="h-3.5 w-3.5" />
        Productos sugeridos para ti
      </p>
      <div
        ref={scrollerRef}
        onWheel={handleWheel}
        className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {suggestions.map((s) => {
          const lineKey = lineKeyFor(s);
          const quantity =
            items.find((i) => i.lineKey === lineKey)?.quantity ?? 0;
          const displayName = comboProductName(s.name, s.secondaryName);
          return (
            <div
              key={lineKey}
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
                {quantity === 0 ? (
                  <button
                    type="button"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600"
                    onClick={() => handleAdd(s)}
                    aria-label={`Agregar ${displayName} al pedido`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="btn-secondary size-7 p-0"
                      onClick={() => setQuantity(lineKey, quantity - 1)}
                      aria-label={`Quitar ${displayName}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-4 text-center text-sm font-semibold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600"
                      onClick={() => setQuantity(lineKey, quantity + 1)}
                      aria-label={`Agregar otro ${displayName}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
