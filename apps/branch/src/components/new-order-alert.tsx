"use client";

import { useEffect } from "react";
import { BellRing, Check } from "lucide-react";

type NewOrderAlertProps = {
  count: number;
  orders: { label: string; customer: string }[];
  onDismiss: () => void;
};

const MAX_PILLS = 4;

export function NewOrderAlert({ count, orders, onDismiss }: NewOrderAlertProps) {
  // Refuerzo táctil al aparecer (o al sumarse un pedido más mientras ya
  // está en pantalla) — solo Android/Chrome soporta la Vibration API.
  useEffect(() => {
    navigator.vibrate?.([250, 120, 250]);
  }, [count]);

  const visiblePills = orders.slice(0, MAX_PILLS);
  const extraCount = orders.length - visiblePills.length;

  return (
    <div
      className="staff-new-order-alert"
      role="alertdialog"
      aria-live="assertive"
      aria-label={
        count === 1
          ? "1 pedido nuevo sin aceptar"
          : `${count} pedidos nuevos sin aceptar`
      }
    >
      <div className="staff-new-order-alert-icon">
        <BellRing className="size-11" strokeWidth={1.75} />
      </div>

      <div className="space-y-3">
        <p className="staff-new-order-alert-title">
          {count} {count === 1 ? "Nuevo pedido" : "Nuevos pedidos"}
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
          El sonido sigue hasta marcar cada pedido como Visto
        </p>
      </div>
    </div>
  );
}
