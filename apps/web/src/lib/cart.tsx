"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartPlate = {
  id: string;
  name: string;
};

export type CartItem = {
  lineKey: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifierIds: string[];
  modifierLabels: string[];
  plateId: string | null;
  /** Producto combinado (misma categoría); null = sin combo. */
  secondaryProductId: string | null;
  secondaryName: string | null;
};

type CartState = {
  branchId: string | null;
  branchName: string | null;
  plates: CartPlate[];
  items: CartItem[];
};

type CartContextValue = CartState & {
  /** true una vez que el carrito terminó de leer localStorage al montar */
  hydrated: boolean;
  itemCount: number;
  subtotal: number;
  setBranch: (id: string, name: string) => void;
  /** Quita del carrito productos no disponibles; devuelve nombres únicos removidos. */
  pruneUnavailableProducts: (availableProductIds: Set<string>) => string[];
  /** Quita líneas concretas (producto + modificadores); devuelve nombres únicos. */
  pruneUnavailableLines: (
    lines: { productId: string; modifierIds: string[] }[],
  ) => string[];
  addItem: (
    item: Omit<
      CartItem,
      "lineKey" | "quantity" | "plateId" | "secondaryProductId" | "secondaryName"
    > & {
      quantity?: number;
      plateId?: string | null;
      secondaryProductId?: string | null;
      secondaryName?: string | null;
    },
  ) => void;
  setQuantity: (lineKey: string, quantity: number) => void;
  removeItem: (lineKey: string) => void;
  setItemPlate: (lineKey: string, plateId: string | null) => void;
  addPlate: (name?: string) => string;
  renamePlate: (plateId: string, name: string) => void;
  removePlate: (plateId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "ordena-cart-v2";
export const UNAVAILABLE_ALERT_KEY = "ordena-unavailable-alert";

export function readUnavailableAlert(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(UNAVAILABLE_ALERT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function clearUnavailableAlert() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(UNAVAILABLE_ALERT_KEY);
}

export function writeUnavailableAlert(names: string[]) {
  if (typeof window === "undefined") return;
  if (names.length === 0) {
    clearUnavailableAlert();
    return;
  }
  sessionStorage.setItem(UNAVAILABLE_ALERT_KEY, JSON.stringify(names));
}

const CartContext = createContext<CartContextValue | null>(null);

export function makeLineKey(
  productId: string,
  modifierIds: string[],
  plateId: string | null,
  secondaryProductId?: string | null,
) {
  const mods = [...modifierIds].sort().join(",");
  const plate = plateId ?? "";
  const combo = secondaryProductId ?? "";
  return `${productId}::${combo}::${mods}::${plate}`;
}

function modsKey(modifierIds: string[]) {
  return [...modifierIds].sort().join(",");
}

function lineMatchesUnavailable(
  item: CartItem,
  lines: { productId: string; modifierIds: string[] }[],
) {
  const itemMods = modsKey(item.modifierIds);
  return lines.some(
    (line) =>
      line.productId === item.productId &&
      modsKey(line.modifierIds) === itemMods,
  );
}

function newPlateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadCart(): CartState {
  if (typeof window === "undefined") {
    return { branchId: null, branchName: null, plates: [], items: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { branchId: null, branchName: null, plates: [], items: [] };
    const parsed = JSON.parse(raw) as Partial<CartState>;
    const plates = Array.isArray(parsed.plates) ? parsed.plates : [];
    const plateIds = new Set(plates.map((p) => p.id));
    const items = (Array.isArray(parsed.items) ? parsed.items : []).map(
      (item) => {
        const plateId =
          item.plateId && plateIds.has(item.plateId) ? item.plateId : null;
        const modifierIds = Array.isArray(item.modifierIds)
          ? item.modifierIds
          : [];
        const secondaryProductId = item.secondaryProductId ?? null;
        return {
          ...item,
          plateId,
          modifierIds,
          modifierLabels: Array.isArray(item.modifierLabels)
            ? item.modifierLabels
            : [],
          secondaryProductId,
          secondaryName: item.secondaryName ?? null,
          lineKey: makeLineKey(
            item.productId,
            modifierIds,
            plateId,
            secondaryProductId,
          ),
        } as CartItem;
      },
    );
    return {
      branchId: parsed.branchId ?? null,
      branchName: parsed.branchName ?? null,
      plates,
      items,
    };
  } catch {
    return { branchId: null, branchName: null, plates: [], items: [] };
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [plates, setPlates] = useState<CartPlate[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadCart();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrata el carrito desde localStorage tras montar (SSR-safe)
    setBranchId(saved.branchId);
    setBranchName(saved.branchName);
    setPlates(saved.plates);
    setItems(saved.items);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ branchId, branchName, plates, items }),
    );
  }, [hydrated, branchId, branchName, plates, items]);

  const setBranch = useCallback((id: string, name: string) => {
    setBranchId(id);
    setBranchName(name);
  }, []);

  const pruneUnavailableProducts = useCallback(
    (availableProductIds: Set<string>) => {
      const removed = [
        ...new Set(
          items
            .filter((i) => !availableProductIds.has(i.productId))
            .map((i) => i.name),
        ),
      ];
      if (removed.length > 0) {
        setItems((prev) =>
          prev.filter((i) => availableProductIds.has(i.productId)),
        );
      }
      return removed;
    },
    [items],
  );

  const pruneUnavailableLines = useCallback(
    (lines: { productId: string; modifierIds: string[] }[]) => {
      if (lines.length === 0) return [];
      const removed = [
        ...new Set(
          items
            .filter((i) => lineMatchesUnavailable(i, lines))
            .map((i) => i.name),
        ),
      ];
      if (removed.length > 0) {
        setItems((prev) =>
          prev.filter((i) => !lineMatchesUnavailable(i, lines)),
        );
      }
      return removed;
    },
    [items],
  );

  const addItem = useCallback(
    (
      item: Omit<
        CartItem,
        "lineKey" | "quantity" | "plateId" | "secondaryProductId" | "secondaryName"
      > & {
        quantity?: number;
        plateId?: string | null;
        secondaryProductId?: string | null;
        secondaryName?: string | null;
      },
    ) => {
      const plateId = item.plateId ?? null;
      const secondaryProductId = item.secondaryProductId ?? null;
      const lineKey = makeLineKey(
        item.productId,
        item.modifierIds,
        plateId,
        secondaryProductId,
      );
      const qty = item.quantity ?? 1;
      setItems((prev) => {
        const existing = prev.find((i) => i.lineKey === lineKey);
        if (existing) {
          return prev.map((i) =>
            i.lineKey === lineKey
              ? { ...i, quantity: i.quantity + qty }
              : i,
          );
        }
        return [
          ...prev,
          {
            lineKey,
            productId: item.productId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: qty,
            modifierIds: item.modifierIds,
            modifierLabels: item.modifierLabels,
            plateId,
            secondaryProductId,
            secondaryName: item.secondaryName ?? null,
          },
        ];
      });
    },
    [],
  );

  const setQuantity = useCallback((lineKey: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.lineKey !== lineKey);
      return prev.map((i) =>
        i.lineKey === lineKey ? { ...i, quantity } : i,
      );
    });
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((prev) => prev.filter((i) => i.lineKey !== lineKey));
  }, []);

  const setItemPlate = useCallback((lineKey: string, plateId: string | null) => {
    setItems((prev) => {
      const source = prev.find((i) => i.lineKey === lineKey);
      if (!source || source.plateId === plateId) return prev;

      const nextKey = makeLineKey(
        source.productId,
        source.modifierIds,
        plateId,
        source.secondaryProductId,
      );
      const without = prev.filter((i) => i.lineKey !== lineKey);
      const existing = without.find((i) => i.lineKey === nextKey);
      if (existing) {
        return without.map((i) =>
          i.lineKey === nextKey
            ? { ...i, quantity: i.quantity + source.quantity }
            : i,
        );
      }
      return [
        ...without,
        { ...source, plateId, lineKey: nextKey },
      ];
    });
  }, []);

  const addPlate = useCallback((name?: string) => {
    const id = newPlateId();
    setPlates((prev) => {
      const label =
        name?.trim() ||
        `Persona ${prev.length + 1}`;
      return [...prev, { id, name: label.slice(0, 40) }];
    });
    return id;
  }, []);

  const renamePlate = useCallback((plateId: string, name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    setPlates((prev) =>
      prev.map((p) => (p.id === plateId ? { ...p, name: trimmed } : p)),
    );
  }, []);

  const removePlate = useCallback((plateId: string) => {
    setPlates((prev) => prev.filter((p) => p.id !== plateId));
    setItems((prev) => {
      const result: CartItem[] = [];
      for (const item of prev) {
        if (item.plateId !== plateId) {
          result.push(item);
          continue;
        }
        const nextKey = makeLineKey(
          item.productId,
          item.modifierIds,
          null,
          item.secondaryProductId,
        );
        const existing = result.find((i) => i.lineKey === nextKey);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          result.push({ ...item, plateId: null, lineKey: nextKey });
        }
      }
      return result;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setPlates([]);
  }, []);

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      branchId,
      branchName,
      plates,
      items,
      hydrated,
      itemCount,
      subtotal,
      setBranch,
      pruneUnavailableProducts,
      pruneUnavailableLines,
      addItem,
      setQuantity,
      removeItem,
      setItemPlate,
      addPlate,
      renamePlate,
      removePlate,
      clear,
    }),
    [
      branchId,
      branchName,
      plates,
      items,
      hydrated,
      itemCount,
      subtotal,
      setBranch,
      pruneUnavailableProducts,
      pruneUnavailableLines,
      addItem,
      setQuantity,
      removeItem,
      setItemPlate,
      addPlate,
      renamePlate,
      removePlate,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}

export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Agrupa ítems por plateId. Con platos activos, no hay grupo "sin asignar". */
export function groupCartItemsByPlate(
  items: CartItem[],
  plates: CartPlate[],
): { plate: CartPlate | null; items: CartItem[] }[] {
  const byId = new Map(plates.map((p) => [p.id, p]));
  const groups: { plate: CartPlate | null; items: CartItem[] }[] = [];

  const unassigned = items.filter(
    (i) => !i.plateId || !byId.has(i.plateId),
  );

  for (let index = 0; index < plates.length; index++) {
    const plate = plates[index]!;
    const plateItems = items.filter((i) => i.plateId === plate.id);
    // Ítems huérfanos se muestran en la primera persona
    const merged =
      index === 0 ? [...plateItems, ...unassigned] : plateItems;
    groups.push({ plate, items: merged });
  }

  if (plates.length === 0) {
    groups.push({ plate: null, items });
  }

  return groups;
}
