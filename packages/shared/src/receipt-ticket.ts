import { groupItemsByPlateLabel } from "./plate-groups";

export type ReceiptAlign = "left" | "center" | "right";

export type ReceiptLine =
  | { type: "logo" }
  | { type: "text"; text: string; align?: ReceiptAlign; bold?: boolean }
  | { type: "separator" }
  | { type: "blank" }
  | { type: "cut" };

export type ReceiptTicketItem = {
  productName: string;
  variantName?: string | null;
  quantity: number;
  lineTotal: number;
  unavailable?: boolean;
  plateLabel?: string | null;
};

export type ReceiptTicketOrder = {
  orderNumber: string;
  dayNumber?: number | null;
  paidAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  subtotal: number;
  discount?: number;
  total: number;
  currency?: string;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  items: ReceiptTicketItem[];
};

export type BuildReceiptTicketInput = {
  order: ReceiptTicketOrder;
  branchName: string;
  /** Omit unavailable items (default) or include with a marker. */
  unavailableMode?: "omit" | "mark";
  now?: Date;
};

function formatMoney(cents: number, currency = "mxn") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDateTime(iso: string | null | undefined, fallback: Date) {
  const d = iso ? new Date(iso) : fallback;
  if (Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(fallback);
  }
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function customerLabel(order: ReceiptTicketOrder) {
  return (
    order.user?.name?.trim() ||
    order.guestName?.trim() ||
    order.user?.email?.trim() ||
    order.guestEmail?.trim() ||
    "Cliente"
  );
}

function customerPhone(order: ReceiptTicketOrder) {
  return order.user?.phone?.trim() || order.guestPhone?.trim() || null;
}

function itemLabel(item: ReceiptTicketItem) {
  const base = item.variantName?.trim()
    ? `${item.productName} (${item.variantName})`
    : item.productName;
  return `${item.quantity}x ${base}`;
}

/** Líneas de ticket de cocina/mostrador (independientes del transporte). */
export function buildReceiptTicket(
  input: BuildReceiptTicketInput,
): ReceiptLine[] {
  const {
    order,
    branchName,
    unavailableMode = "omit",
    now = new Date(),
  } = input;
  const currency = order.currency ?? "mxn";
  const lines: ReceiptLine[] = [];

  lines.push({ type: "logo" });
  lines.push({
    type: "text",
    text: branchName.trim() || "Ordena",
    align: "center",
    bold: true,
  });
  lines.push({ type: "text", text: "PICKUP", align: "center", bold: true });
  lines.push({ type: "separator" });

  const dayLabel =
    order.dayNumber != null ? `#${order.dayNumber}` : order.orderNumber;
  lines.push({ type: "text", text: dayLabel, align: "center", bold: true });
  lines.push({
    type: "text",
    text: order.orderNumber,
    align: "center",
  });
  lines.push({
    type: "text",
    text: formatDateTime(order.paidAt ?? order.createdAt, now),
    align: "center",
  });
  lines.push({ type: "separator" });

  lines.push({ type: "text", text: customerLabel(order), bold: true });
  const phone = customerPhone(order);
  if (phone) {
    lines.push({ type: "text", text: phone });
  }
  lines.push({ type: "separator" });

  const visibleItems =
    unavailableMode === "omit"
      ? order.items.filter((i) => !i.unavailable)
      : order.items;

  const groups = groupItemsByPlateLabel(visibleItems);
  for (const group of groups) {
    if (group.label) {
      lines.push({
        type: "text",
        text: `— ${group.label} —`,
        align: "center",
        bold: true,
      });
    }
    for (const item of group.items) {
      const mark = item.unavailable ? " [AGOTADO]" : "";
      lines.push({
        type: "text",
        text: `${itemLabel(item)}${mark}`,
        bold: true,
      });
      lines.push({
        type: "text",
        text: formatMoney(item.lineTotal, currency),
        align: "right",
      });
    }
  }

  if (order.notes?.trim()) {
    lines.push({ type: "separator" });
    lines.push({ type: "text", text: "Notas:", bold: true });
    lines.push({ type: "text", text: order.notes.trim() });
  }

  lines.push({ type: "separator" });
  lines.push({
    type: "text",
    text: `Subtotal  ${formatMoney(order.subtotal, currency)}`,
  });
  if ((order.discount ?? 0) > 0) {
    lines.push({
      type: "text",
      text: `Descuento  -${formatMoney(order.discount!, currency)}`,
    });
  }
  lines.push({
    type: "text",
    text: `TOTAL  ${formatMoney(order.total, currency)}`,
    bold: true,
  });
  lines.push({ type: "blank" });
  lines.push({
    type: "text",
    text: "Gracias",
    align: "center",
  });
  lines.push({ type: "blank" });
  lines.push({ type: "cut" });

  return lines;
}

/** Ticket de prueba para conectar la impresora. */
export function buildTestReceiptTicket(branchName = "Ordena"): ReceiptLine[] {
  return buildReceiptTicket({
    branchName,
    order: {
      orderNumber: "TEST-0001",
      dayNumber: 1,
      paidAt: new Date().toISOString(),
      subtotal: 10000,
      discount: 0,
      total: 10000,
      currency: "mxn",
      guestName: "Prueba impresora",
      guestPhone: "5550000000",
      notes: "Ticket de prueba",
      items: [
        {
          productName: "Producto demo",
          quantity: 1,
          lineTotal: 10000,
        },
      ],
    },
  });
}
