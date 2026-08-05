"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

type LastOrder = {
  orderNumber: string;
  status: string;
  createdAt: string;
  total: number;
};

type Customer = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  ordersCount: number;
  lastOrder: LastOrder | null;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Inicia sesión como admin");
      const res = await apiFetch<{ data: Customer[] }>(
        "/customers/admin",
        token,
      );
      setCustomers(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar clientes",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de clientes al montar
    void load();
  }, [load]);

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-description">
            Usuarios registrados en la app de clientes.
          </p>
        </div>
      </div>
      <div className="admin-panel-body space-y-4">
        {error && <p className="admin-alert-error">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Cargando clientes…</p>
        ) : customers.length === 0 ? (
          <div className="admin-empty">
            Aún no hay clientes registrados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Teléfono
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Pedidos
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Último pedido
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Alta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-800 dark:text-white">
                        {customer.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-500">{customer.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                      {customer.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                      {customer.ordersCount}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                      {customer.lastOrder ? (
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white">
                            {customer.lastOrder.orderNumber}
                          </p>
                          <p className="text-xs text-gray-500">
                            {customer.lastOrder.status} ·{" "}
                            {formatMoney(customer.lastOrder.total)} ·{" "}
                            {formatDate(customer.lastOrder.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Sin pedidos</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                      {formatDate(customer.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
