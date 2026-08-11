"use client";

import { useEffect } from "react";
import { Check, CircleX } from "lucide-react";

type CustomerCancelAlertProps = {
  count: number;
  orders: { label: string; customer: string }[];
  onDismiss: () => void;
};

const MAX_PILLS = 4;

export function CustomerCancelAlert({
  count,
  orders,
  onDismiss,
}: CustomerCancelAlertProps) {
  // Mismo refuerzo táctil que la alerta de pedido nuevo.
  useEffect(() => {
    navigator.vibrate?.([250, 120, 250]);
  }, [count]);

  const visiblePills = orders.slice(0, MAX_PILLS);
  const extraCount = orders.length - visiblePills.length;

  return (
    <div
      className="staff-new-order-alert staff-new-order-alert-cancel"
      role="alertdialog"
      aria-live="assertive"
      aria-label={
        count === 1
          ? "1 pedido cancelado por el cliente"
          : `${count} pedidos cancelados por clientes`
      }
    >
      <div className="staff-new-order-alert-icon">
        <CircleX className="size-11" strokeWidth={1.75} />
      </div>

      <div className="space-y-3">
        <p className="staff-new-order-alert-title">
          {count === 1
            ? "Pedido cancelado por el cliente"
            : `${count} pedidos cancelados por clientes`}
        </p>
        <p className="staff-new-order-alert-subtitle">
          No lo prepares — el cobro ya fue liberado.
        </p>
        {visiblePills.length > 0 && (
          <div className="staff-new-order-alert-list">
            {visiblePills.map((order, index) => (
              <span key={index} className="staff-new-order-alert-pill">
                {order.label} · {order.customer}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="staff-new-order-alert-pill">
                +{extraCount} más
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={onDismiss}
          className="staff-new-order-alert-btn"
          autoFocus
        >
          <Check className="size-5" strokeWidth={2.5} />
          Entendido
        </button>
        <p className="staff-new-order-alert-hint">
          Sigue marcado en &quot;En vivo&quot; hasta que lo reconozcas ahí
        </p>
      </div>
    </div>
  );
}
