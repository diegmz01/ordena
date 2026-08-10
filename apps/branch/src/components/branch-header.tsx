"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Ban,
  CalendarClock,
  ChevronDown,
  Clock,
  Pause,
  Play,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Modal } from "@/components/ui/modal";
import {
  STAFF_PRESENCE_EVENT,
  isBrowserOnline,
  type StaffPresenceDetail,
} from "@/components/staff-presence";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

type AvailabilityStatus = "OPEN" | "PAUSED" | "CLOSED";
type AvailabilityMode = "AUTO" | "OPEN" | "PAUSED" | "CLOSED";
type AvailabilitySource = "schedule" | "manual" | "pause" | "offline";

type BranchMe = {
  id: string;
  name: string;
  availability: AvailabilityStatus;
  mode: AvailabilityMode;
  pausedUntil: string | null;
  acceptingOrders: boolean;
  withinSchedule: boolean;
  source: AvailabilitySource;
  offlineCause?: "app_closed" | "connection_lost" | null;
  todayHoursLabel: string | null;
  prepTimeMinutes: number;
};

const PAUSE_PRESETS = [
  { minutes: 15 as const, label: "15 min" },
  { minutes: 30 as const, label: "30 min" },
  { minutes: 60 as const, label: "1 h" },
  { minutes: 120 as const, label: "2 h" },
];

function initialPresence(): StaffPresenceDetail {
  const online = isBrowserOnline();
  return { ok: online, browserOnline: online };
}

function badgeMeta(branch: BranchMe, presence: StaffPresenceDetail) {
  // Misma fuente que el banner StaffPresence: red local / heartbeat.
  if (!presence.ok || branch.source === "offline") {
    return {
      label: "Sin conexión",
      hint: !presence.browserOnline
        ? "Sin internet · no recibe pedidos nuevos"
        : branch.offlineCause === "app_closed"
          ? "Pausada: staff cerró la aplicación"
          : "Sin respuesta de red o API · no recibe pedidos nuevos",
      dot: "bg-amber-300",
      pulse: false as const,
    };
  }
  if (branch.availability === "OPEN") {
    return {
      label: "Disponible",
      hint:
        branch.source === "manual"
          ? "Abierta manualmente (fuera del horario automático)"
          : branch.todayHoursLabel
            ? `Según horario · hoy ${branch.todayHoursLabel}`
            : "Aceptando pedidos nuevos",
      dot: "bg-emerald-400",
      pulse: true as const,
    };
  }
  if (branch.availability === "PAUSED") {
    return {
      label: "Pausada",
      hint: "Pedidos nuevos bloqueados",
      dot: "bg-amber-300",
      pulse: false as const,
    };
  }
  if (branch.source === "schedule") {
    return {
      label: "Cerrada",
      hint: branch.todayHoursLabel
        ? `Fuera de horario · hoy ${branch.todayHoursLabel}`
        : "Fuera de horario",
      dot: "bg-rose-400",
      pulse: false as const,
    };
  }
  return {
    label: "Cerrada",
    hint: "Cerrada manualmente por el staff · reabre mañana según horario",
    dot: "bg-rose-400",
    pulse: false as const,
  };
}

function formatPausedUntil(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BranchHeader() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isSettings = pathname === "/configuracion";
  const isMenu = pathname === "/menu";

  const [branch, setBranch] = useState<BranchMe | null>(null);
  const [presence, setPresence] = useState<StaffPresenceDetail>(initialPresence);
  const [loadingBranch, setLoadingBranch] = useState(!isLogin);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBranch = useCallback(async (opts?: { silent?: boolean }) => {
    const token = getAuthToken();
    if (!token || isLogin) {
      setBranch(null);
      setLoadingBranch(false);
      return;
    }
    if (!opts?.silent) setLoadingBranch(true);
    try {
      const res = await apiFetch<{ data: BranchMe }>("/branches/me", token);
      setBranch(res.data);
    } catch {
      // Sin API: alinear con el banner (no deja “Disponible” stale).
      setPresence({
        ok: false,
        browserOnline: isBrowserOnline(),
      });
      if (!opts?.silent) setBranch(null);
    } finally {
      setLoadingBranch(false);
    }
  }, [isLogin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del estado de la sucursal al montar
    void loadBranch();
  }, [loadBranch]);

  // Recalcular al cruzar minutos (horario automático)
  useEffect(() => {
    if (isLogin) return;
    const id = window.setInterval(() => {
      void loadBranch({ silent: true });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isLogin, loadBranch]);

  // Misma señal que el banner StaffPresence
  useEffect(() => {
    if (isLogin) return;
    const onPresence = (event: Event) => {
      const detail = (event as CustomEvent<StaffPresenceDetail>).detail;
      if (!detail) return;
      setPresence({
        ok: detail.ok,
        browserOnline: detail.browserOnline,
      });
      if (detail.ok) {
        void loadBranch({ silent: true });
      }
    };
    window.addEventListener(STAFF_PRESENCE_EVENT, onPresence);
    return () => window.removeEventListener(STAFF_PRESENCE_EVENT, onPresence);
  }, [isLogin, loadBranch]);

  async function updateAvailability(
    availability: AvailabilityMode,
    pauseMinutes?: 15 | 30 | 60 | 120 | null,
  ) {
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: BranchMe }>(
        "/branches/me/availability",
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            availability,
            ...(availability === "PAUSED"
              ? { pauseMinutes: pauseMinutes ?? null }
              : {}),
          }),
        },
      );
      setBranch(res.data);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  const meta = branch ? badgeMeta(branch, presence) : null;
  const resumeAt = formatPausedUntil(branch?.pausedUntil ?? null);
  const acceptingOrders = Boolean(branch?.acceptingOrders && presence.ok);
  const showFollowSchedule = branch && branch.mode !== "AUTO";
  const showForceOpen = branch && !acceptingOrders;
  const showForceClose = branch && branch.mode !== "CLOSED";

  if (isLogin) return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-[0_8px_24px_-12px_rgba(194,65,12,0.55)]">
        <div className="mx-auto flex h-[4.25rem] max-w-3xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/"
              className="shrink-0 rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="Inicio · pedidos"
            >
              <BrandLogo height={45} priority onBrand />
            </Link>

            <div
              className="hidden h-8 w-px shrink-0 bg-white/25 sm:block"
              aria-hidden
            />

            {loadingBranch && !branch ? (
              <div
                className="h-3.5 w-24 animate-pulse rounded bg-white/25"
                aria-hidden
              />
            ) : branch ? (
              <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-white">
                {branch.name}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {loadingBranch && !branch ? (
              <div
                className="h-10 w-[7.5rem] animate-pulse rounded-xl bg-white/20"
                aria-hidden
              />
            ) : (
              branch &&
              meta && (
                <button
                  type="button"
                    onClick={() => {
                      setError(null);
                      setModalOpen(true);
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 backdrop-blur-sm transition hover:bg-white/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    aria-haspopup="dialog"
                    aria-expanded={modalOpen}
                    aria-label={`Estado: ${meta.label}`}
                  >
                    <span
                      className={`relative size-2.5 shrink-0 rounded-full ${meta.dot}`}
                    >
                      {meta.pulse && (
                        <span
                          className={`absolute inset-0 animate-ping rounded-full ${meta.dot} opacity-60`}
                        />
                      )}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {meta.label}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-white/80" />
                  </button>
                )
              )}
            <ThemeToggle />
            <Link
              href="/menu"
              aria-label="Menú"
              aria-current={isMenu ? "page" : undefined}
              className={`inline-flex size-10 items-center justify-center rounded-xl transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                isMenu
                  ? "bg-white text-orange-600 shadow-sm"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <UtensilsCrossed className="size-4" />
            </Link>
            <Link
              href="/configuracion"
              aria-label="Configuración"
              aria-current={isSettings ? "page" : undefined}
              className={`inline-flex size-10 items-center justify-center rounded-xl transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                isSettings
                  ? "bg-white text-orange-600 shadow-sm"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <Modal
        open={modalOpen}
        onClose={() => !busy && setModalOpen(false)}
        title="Disponibilidad"
        description={
          branch
            ? `Horario del admin + control manual de ${branch.name}.`
            : undefined
        }
      >
        <div className="space-y-5">
          {branch && meta && (
            <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-800/80">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-full ${meta.dot}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {meta.label}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {meta.hint}
                  {branch.source !== "offline" &&
                  branch.availability === "PAUSED" &&
                  resumeAt
                    ? ` · reabre ~${resumeAt}`
                    : branch.source !== "offline" &&
                        branch.availability === "PAUSED" &&
                        !resumeAt
                      ? " · hasta que reapertas"
                      : ""}
                </p>
                {branch.todayHoursLabel && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    <CalendarClock className="size-3" />
                    Hoy: {branch.todayHoursLabel}
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="space-y-2">
            {showFollowSchedule && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateAvailability("AUTO")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-60"
              >
                <CalendarClock className="size-4" />
                Seguir horario
              </button>
            )}

            {showForceOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateAvailability("OPEN")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.99] disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
              >
                <Play className="size-4" />
                Abrir ahora
              </button>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Pause className="size-3.5" />
              Pausar temporalmente
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAUSE_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void updateAvailability("PAUSED", preset.minutes)
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:border-amber-300 hover:bg-amber-50 active:scale-[0.99] disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-amber-600 dark:hover:bg-amber-950/30"
                >
                  <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateAvailability("PAUSED", null)}
                className="col-span-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-amber-400 hover:bg-amber-50 active:scale-[0.99] disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:border-amber-600 dark:hover:bg-amber-950/30"
              >
                Pausar indefinidamente
              </button>
            </div>
          </div>

          {showForceClose && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateAvailability("CLOSED")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99] disabled:opacity-60 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
            >
              <Ban className="size-4" />
              Cerrar ahora
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
