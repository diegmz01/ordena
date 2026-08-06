import { INVOICE_BASE_URL } from "@ordena/shared";

type InvoiceableOrder = {
  status: string;
  ptvTicket: number | null;
  total: number;
  createdAt: string;
  branch: { slug: string };
};

/** Solo pedidos entregados y dentro del mismo mes/año del pedido se pueden facturar. */
export function canInvoiceOrder(order: InvoiceableOrder): boolean {
  if (order.status !== "COMPLETED" || order.ptvTicket == null) return false;
  const orderDate = new Date(order.createdAt);
  const now = new Date();
  return (
    orderDate.getFullYear() === now.getFullYear() &&
    orderDate.getMonth() === now.getMonth()
  );
}

function formatInvoiceDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function buildInvoiceUrl(order: InvoiceableOrder): string {
  const params = new URLSearchParams({
    branchId: order.branch.slug,
    ticket: String(order.ptvTicket),
    total: (order.total / 100).toFixed(2),
    fecha: formatInvoiceDate(order.createdAt),
  });
  return `${INVOICE_BASE_URL}?${params.toString()}`;
}
