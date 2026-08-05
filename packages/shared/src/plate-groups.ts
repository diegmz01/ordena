/** Agrupa ítems de pedido por plateLabel para UI de cocina/cliente. */
export function groupItemsByPlateLabel<
  T extends { plateLabel?: string | null },
>(items: T[]): { label: string | null; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string | null, T[]>();

  for (const item of items) {
    const key = item.plateLabel?.trim() || null;
    if (!map.has(key)) {
      map.set(key, []);
      if (key != null) order.push(key);
    }
    map.get(key)!.push(item);
  }

  const groups: { label: string | null; items: T[] }[] = order.map((label) => ({
    label,
    items: map.get(label)!,
  }));

  const unassigned = map.get(null);
  if (unassigned?.length) {
    groups.push({ label: null, items: unassigned });
  }

  return groups;
}
