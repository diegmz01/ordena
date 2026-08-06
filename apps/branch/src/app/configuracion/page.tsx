"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Printer } from "lucide-react";
import { BackToLiveOrders } from "@/components/back-to-live";
import { PushOptInStaff } from "@/components/pwa/push-opt-in-staff";
import { apiFetch } from "@/lib/api";
import { getAuthToken, logout } from "@/lib/auth";
import {
  getConnectedSerialPort,
  getPrintSettings,
  isWebSerialSupported,
  printTestTicket,
  requestSerialPort,
  setPaperWidth,
  type PaperWidth,
} from "@/lib/print";
import { cn } from "@/lib/utils";

type BranchMe = {
  id: string;
  name: string;
  prepTimeMinutes: number;
};

const PREP_PRESETS = [10, 15, 20, 25, 30, 45, 60] as const;

export default function ConfiguracionPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<BranchMe | null>(null);
  const [prepTime, setPrepTime] = useState(20);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paperWidth, setPaperWidthState] = useState<PaperWidth>(80);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialSupported, setSerialSupported] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printInfo, setPrintInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: BranchMe }>("/branches/me", token);
      setBranch(res.data);
      setPrepTime(res.data.prepTimeMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de configuración al montar
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature-detect e impresora solo disponibles en cliente
    setSerialSupported(isWebSerialSupported());
    setPaperWidthState(getPrintSettings().paperWidth);
    void getConnectedSerialPort().then((port) => setSerialConnected(!!port));
  }, []);

  async function connectPrinter() {
    setError(null);
    setPrintInfo(null);
    try {
      await requestSerialPort();
      setSerialConnected(true);
      setPrintInfo("Impresora conectada (Web Serial)");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo conectar la impresora",
      );
      setSerialConnected(false);
    }
  }

  async function runTestPrint() {
    setPrintBusy(true);
    setError(null);
    setPrintInfo(null);
    try {
      const result = await printTestTicket(branch?.name ?? "Ordena");
      setPrintInfo(
        result.mode === "serial"
          ? "Ticket de prueba enviado a la impresora"
          : "Se abrió el diálogo de impresión del navegador (sin puerto Serial)",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo imprimir la prueba",
      );
    } finally {
      setPrintBusy(false);
    }
  }

  function changePaperWidth(width: PaperWidth) {
    setPaperWidth(width);
    setPaperWidthState(width);
    setPrintInfo(`Ancho guardado: ${width} mm`);
  }

  async function saveSettings(patch: { prepTimeMinutes?: number }) {
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch<{ data: BranchMe }>(
        "/branches/me/settings",
        token,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
      setBranch(res.data);
      setPrepTime(res.data.prepTimeMinutes);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <BackToLiveOrders />
          <h2 className="page-title">Configuración</h2>
          <p className="page-description">Cargando…</p>
        </div>
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <BackToLiveOrders />
        <h2 className="page-title">Configuración</h2>
        <p className="page-description">
          {branch?.name ?? "Ajustes de la sucursal"}
        </p>
      </div>

      {error && <p className="admin-alert-error">{error}</p>}
      {saved && !error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          Guardado
        </p>
      )}

      <section className="pwa-card space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Tiempo de preparación
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Tiempo estimado que verán los clientes al pedir.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PREP_PRESETS.map((minutes) => {
            const active = prepTime === minutes;
            return (
              <button
                key={minutes}
                type="button"
                disabled={busy}
                onClick={() => void saveSettings({ prepTimeMinutes: minutes })}
                className={cn("staff-chip", active && "staff-chip-active")}
              >
                {minutes} min
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          Actual:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {prepTime} min
          </span>
        </p>
      </section>

      <section className="pwa-card">
        <PushOptInStaff />
      </section>

      <section className="pwa-card space-y-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Printer className="size-4 text-orange-500" />
            Impresora térmica
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Al aceptar un pedido se imprime el ticket de cocina antes de pedir el
            número PTV. Recomendado: Chrome o Edge en Windows.
          </p>
        </div>

        <div>
          <p className="field-label">Ancho de papel</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([58, 80] as const).map((width) => (
              <button
                key={width}
                type="button"
                onClick={() => changePaperWidth(width)}
                className={cn(
                  "staff-chip",
                  paperWidth === width && "staff-chip-active",
                )}
              >
                {width} mm
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-3 text-sm dark:border-border dark:bg-surface-muted/50">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            Estado:{" "}
            {serialSupported
              ? serialConnected
                ? "Puerto Serial conectado"
                : "Sin puerto Serial (usará impresión del navegador)"
              : "Web Serial no disponible en este navegador"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sin Serial se abre el diálogo de impresión del sistema con layout
            estrecho.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {serialSupported && (
            <button
              type="button"
              disabled={printBusy}
              onClick={() => void connectPrinter()}
              className="btn-secondary w-full sm:flex-1"
            >
              Conectar impresora
            </button>
          )}
          <button
            type="button"
            disabled={printBusy}
            onClick={() => void runTestPrint()}
            className="btn-primary w-full sm:flex-1"
          >
            {printBusy ? "Imprimiendo…" : "Probar ticket"}
          </button>
        </div>

        {printInfo && !error && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {printInfo}
          </p>
        )}
      </section>

      <section className="pwa-card">
        <button
          type="button"
          onClick={handleLogout}
          className="btn-red w-full py-3"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}
