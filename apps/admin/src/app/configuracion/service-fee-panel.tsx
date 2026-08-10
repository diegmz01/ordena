"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

type ServiceFeeType = "FIXED" | "PERCENTAGE";

type ServiceFeeSettings = {
  type: ServiceFeeType;
  amount: number;
  percentage: number;
  isActive: boolean;
};

type FormState = {
  type: ServiceFeeType;
  /** Pesos (input del usuario), se convierte a centavos al guardar. */
  amountPesos: string;
  /** Porcentaje (input del usuario, ej. "2.5"), se convierte a basis points al guardar. */
  percentageInput: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  type: "FIXED",
  amountPesos: "0",
  percentageInput: "0",
  isActive: false,
};

function tokenOrThrow() {
  const token = getAuthToken();
  if (!token) throw new Error("Sesión expirada, vuelve a iniciar sesión");
  return token;
}

export function ServiceFeePanel() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: ServiceFeeSettings }>(
        "/settings/service-fee",
      );
      setForm({
        type: res.data.type,
        amountPesos: (res.data.amount / 100).toString(),
        percentageInput: (res.data.percentage / 100).toString(),
        isActive: res.data.isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de configuración al montar
    load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = tokenOrThrow();
      const amount = Math.round(Number(form.amountPesos) * 100);
      const percentage = Math.round(Number(form.percentageInput) * 100);
      const res = await apiFetch<{ data: ServiceFeeSettings }>(
        "/settings/service-fee",
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            type: form.type,
            amount,
            percentage,
            isActive: form.isActive,
          }),
        },
      );
      setForm({
        type: res.data.type,
        amountPesos: (res.data.amount / 100).toString(),
        percentageInput: (res.data.percentage / 100).toString(),
        isActive: res.data.isActive,
      });
      setSuccess("Tarifa de servicios guardada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <p className="page-description">
            Cargo extra que se suma al total de todo pedido, en todas las
            sucursales, antes de pagar.
          </p>
        </div>
      </div>
      <div className="admin-panel-body space-y-4">
        {error && <p className="admin-alert-error">{error}</p>}
        {success && <p className="pwa-alert-brand">{success}</p>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cargando…
          </p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
              />
              Cobrar tarifa de servicios
            </label>

            <div>
              <p className="field-label">Tipo de tarifa</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    name="service-fee-type"
                    value="FIXED"
                    checked={form.type === "FIXED"}
                    onChange={() =>
                      setForm((f) => ({ ...f, type: "FIXED" }))
                    }
                  />
                  Monto fijo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    name="service-fee-type"
                    value="PERCENTAGE"
                    checked={form.type === "PERCENTAGE"}
                    onChange={() =>
                      setForm((f) => ({ ...f, type: "PERCENTAGE" }))
                    }
                  />
                  Porcentaje del subtotal
                </label>
              </div>
            </div>

            {form.type === "FIXED" ? (
              <div className="max-w-xs">
                <label className="field-label" htmlFor="service-fee-amount">
                  Monto (MXN)
                </label>
                <input
                  id="service-fee-amount"
                  type="number"
                  className="input-field"
                  min={0}
                  step="0.01"
                  required
                  value={form.amountPesos}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amountPesos: e.target.value }))
                  }
                />
              </div>
            ) : (
              <div className="max-w-xs">
                <label
                  className="field-label"
                  htmlFor="service-fee-percentage"
                >
                  Porcentaje (%)
                </label>
                <input
                  id="service-fee-percentage"
                  type="number"
                  className="input-field"
                  min={0}
                  max={100}
                  step="0.01"
                  required
                  value={form.percentageInput}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      percentageInput: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-700">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
