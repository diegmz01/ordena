"use client";

type NewOrderAlertProps = {
  count: number;
  onDismiss: () => void;
};

export function NewOrderAlert({ count, onDismiss }: NewOrderAlertProps) {
  return (
    <div className="staff-new-order-alert" role="alertdialog" aria-live="assertive">
      <p className="staff-new-order-alert-title">
        {count} {count === 1 ? "Nuevo pedido" : "Nuevos pedidos"}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="staff-new-order-alert-btn"
        autoFocus
      >
        Entendido
      </button>
    </div>
  );
}
