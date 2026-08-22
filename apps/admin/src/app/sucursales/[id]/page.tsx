"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pause,
  Phone,
  Play,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  Wallet,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type AvailabilityDetail = {
  status: "OPEN" | "PAUSED" | "CLOSED";
  mode: "AUTO" | "OPEN" | "PAUSED" | "CLOSED";
  acceptingOrders: boolean;
  source: "schedule" | "manual" | "pause" | "offline";
  offlineCause: "app_closed" | "connection_lost" | null;
  todayHoursLabel: string | null;
  staffLastSeenAt: string | null;
  modeLabel: string;
  statusLabel: string;
  sourceLabel: string;
  offlineCauseLabel: string | null;
  staffOnline: boolean;
};

type AvailabilityMode = "AUTO" | "OPEN" | "PAUSED" | "CLOSED";

const PAUSE_DURATIONS: { minutes: 15 | 30 | 60 | 120; label: string }[] = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
];

type PeriodStats = {
  ordersCount: number;
  capturedCents: number;
  capturedCount: number;
  cancelledCount: number;
};

type ConnectivitySummary = {
  hasData: boolean;
  monthStart: string;
  generatedAt: string;
  scheduledMs: number;
  openMs: number;
  complianceRate: number | null;
  connectivityLossMs: number;
  appClosedMs: number;
  manualClosedMs: number;
  incidents: {
    connectivityLoss: number;
    appClosed: number;
    manualClosed: number;
  };
  lastEventAt: string | null;
};

type BranchDetail = {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string | null;
  isActive: boolean;
  staff: { id: string; email: string; name: string | null } | null;
  availabilityDetail: AvailabilityDetail;
  connectivity: ConnectivitySummary;
  stats: {
    totalOrders: number;
    today: PeriodStats;
    week: PeriodStats;
    month: PeriodStats;
  };
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    customerLabel: string;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Autorizado",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
  ACCEPTED: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  PREPARING:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
  READY:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200",
};

function availabilityBadgeClass(detail: AvailabilityDetail) {
  if (detail.acceptingOrders) return "status-badge-active";
  if (detail.source === "offline") {
    return detail.offlineCause === "app_closed"
      ? "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      : "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  }
  if (detail.status === "PAUSED") {
    return "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  }
  return "status-badge-inactive";
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0h";
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function complianceTone(rate: number | null) {
  if (rate == null) return "text-gray-500";
  if (rate >= 0.95) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 0.85) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function AdminBranchDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [controlError, setControlError] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<AvailabilityMode | null>(
    null,
  );

  async function applyAvailability(
    mode: AvailabilityMode,
    pauseMinutes?: 15 | 30 | 60 | 120,
  ) {
    if (!branch) return;
    const token = getAuthToken();
    if (!token) return;
    setControlError(null);
    setPendingMode(mode);
    try {
      const res = await apiFetch<{ data: AvailabilityDetail }>(
        `/branches/admin/${branch.id}/availability`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ availability: mode, pauseMinutes }),
        },
      );
      setBranch((prev) =>
        prev ? { ...prev, availabilityDetail: res.data } : prev,
      );
    } catch (err) {
      setControlError(
        err instanceof Error ? err.message : "No se pudo actualizar",
      );
    } finally {
      setPendingMode(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    const token = getAuthToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin sesión no hay fetch que hacer al montar
      setError("Inicia sesión como admin");
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ data: BranchDetail }>(`/branches/admin/${id}`, token)
      .then((res) => setBranch(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="space-y-5">
      <Link
        href="/sucursales"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Sucursales
      </Link>

      {error && <p className="admin-alert-error">{error}</p>}

      {loading && (
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100 lg:col-span-2 dark:bg-gray-800" />
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      )}

      {branch && !loading && (
        <>
          <header className="overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-white dark:border-orange-900/40 dark:from-orange-950/40 dark:via-gray-900 dark:to-gray-900">
            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={availabilityBadgeClass(
                      branch.availabilityDetail,
                    )}
                  >
                    {branch.availabilityDetail.statusLabel}
                  </span>
                  {branch.isActive ? (
                    <span className="status-badge-active">Activa</span>
                  ) : (
                    <span className="status-badge-inactive">Inactiva</span>
                  )}
                </div>
                <div>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                    {branch.name}
                  </h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Código {branch.slug} · {branch.address}
                  </p>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-3">
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {branch.stats.today.ordersCount}
                  </p>
                  <p className="text-[11px] text-gray-500">Hoy</p>
                </div>
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {branch.stats.week.ordersCount}
                  </p>
                  <p className="text-[11px] text-gray-500">7 días</p>
                </div>
                <div className="rounded-xl border border-orange-200/70 bg-white/80 px-4 py-2.5 text-center backdrop-blur dark:border-orange-900/30 dark:bg-gray-950/50">
                  <p className="text-lg font-bold tabular-nums text-orange-600">
                    {formatMoney(branch.stats.month.capturedCents)}
                  </p>
                  <p className="text-[11px] text-gray-500">Cobrado / mes</p>
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["today", "Hoy", branch.stats.today],
                ["week", "Últimos 7 días", branch.stats.week],
                ["month", "Este mes", branch.stats.month],
              ] as const
            ).map(([key, label, stat]) => (
              <div key={key} className="admin-panel">
                <div className="admin-panel-body">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatMoney(stat.capturedCents)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {stat.ordersCount} pedidos · {stat.capturedCount} cobrados
                    {stat.cancelledCount > 0
                      ? ` · ${stat.cancelledCount} cancelados`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <section className="admin-panel overflow-hidden">
                <div className="admin-panel-header">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      Pedidos recientes
                    </h2>
                    <p className="text-xs text-gray-500">
                      {branch.stats.totalOrders} pedidos en total
                    </p>
                  </div>
                </div>
                {branch.recentOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
                    <ShoppingBag className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500">
                      Esta sucursal aún no tiene pedidos.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {branch.recentOrders.map((order) => (
                      <li key={order.id}>
                        <Link
                          href={`/pedidos/${order.id}`}
                          className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-orange-50/70 sm:px-6 dark:hover:bg-orange-950/20"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                            <ShoppingBag className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {order.orderNumber}
                              </p>
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  STATUS_TONE[order.status] ??
                                    STATUS_TONE.COMPLETED,
                                )}
                              >
                                {STATUS_LABEL[order.status] ?? order.status}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {order.customerLabel} ·{" "}
                              {formatDate(order.createdAt)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-orange-600">
                            {formatMoney(order.total)}
                          </p>
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-orange-500" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="space-y-4 lg:col-span-2">
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Ubicación y contacto
                  </h2>
                </div>
                <div className="admin-panel-body space-y-2">
                  <div className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-gray-800 dark:text-gray-100">
                      {branch.address}
                    </span>
                  </div>
                  {branch.phone ? (
                    <a
                      href={`tel:${branch.phone}`}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition hover:border-orange-300 hover:bg-orange-50/50 dark:border-gray-700 dark:hover:border-orange-800 dark:hover:bg-orange-950/20"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {branch.phone}
                      </span>
                    </a>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                      Sin teléfono
                    </p>
                  )}
                  {branch.staff ? (
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700">
                      <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0 break-all text-gray-800 dark:text-gray-100">
                        {branch.staff.email}
                      </span>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                      Sin usuario staff asignado
                    </p>
                  )}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Disponibilidad
                  </h2>
                </div>
                <div className="admin-panel-body">
                  <dl className="space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="inline-flex items-center gap-1.5 text-gray-500">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Modo
                      </dt>
                      <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                        {branch.availabilityDetail.modeLabel}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Origen</dt>
                      <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                        {branch.availabilityDetail.sourceLabel}
                      </dd>
                    </div>
                    {branch.availabilityDetail.todayHoursLabel && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="inline-flex items-center gap-1.5 text-gray-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          Horario de hoy
                        </dt>
                        <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                          {branch.availabilityDetail.todayHoursLabel}
                        </dd>
                      </div>
                    )}
                    {branch.availabilityDetail.offlineCauseLabel && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-gray-500">Aviso</dt>
                        <dd className="text-right font-medium text-amber-700 dark:text-amber-300">
                          {branch.availabilityDetail.offlineCauseLabel}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500">Última presencia staff</dt>
                      <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                        {formatDate(branch.availabilityDetail.staffLastSeenAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 space-y-2.5">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {branch.availabilityDetail.staffOnline ? (
                        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                      )}
                      Control remoto
                    </p>

                    {!branch.availabilityDetail.staffOnline ? (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        El personal de la sucursal no tiene conexión activa
                        ahora mismo, así que no se puede pausar ni cerrar
                        desde aquí.
                      </p>
                    ) : (
                      <>
                        {controlError && (
                          <p className="admin-alert-error text-xs">
                            {controlError}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={pendingMode !== null}
                            onClick={() => applyAvailability("AUTO")}
                            className={cn(
                              "btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs",
                              branch.availabilityDetail.mode === "AUTO" &&
                                "ring-2 ring-orange-400",
                            )}
                          >
                            <Clock3 className="h-3.5 w-3.5" />
                            Automático
                          </button>
                          <button
                            type="button"
                            disabled={pendingMode !== null}
                            onClick={() => applyAvailability("OPEN")}
                            className={cn(
                              "btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs",
                              branch.availabilityDetail.mode === "OPEN" &&
                                "ring-2 ring-orange-400",
                            )}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Abrir
                          </button>
                          {PAUSE_DURATIONS.map(({ minutes, label }) => (
                            <button
                              key={minutes}
                              type="button"
                              disabled={pendingMode !== null}
                              onClick={() =>
                                applyAvailability("PAUSED", minutes)
                              }
                              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                            >
                              <Pause className="h-3.5 w-3.5" />
                              Pausar {label}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={pendingMode !== null}
                            onClick={() => applyAvailability("CLOSED")}
                            className={cn(
                              "btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs",
                              branch.availabilityDetail.mode === "CLOSED" &&
                                "ring-2 ring-orange-400",
                            )}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cerrar hoy
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    Conectividad
                  </h2>
                  <p className="text-xs text-gray-500">
                    Resumen del mes en curso
                  </p>
                </div>
                <div className="admin-panel-body">
                  {!branch.connectivity.hasData ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-700">
                      <Wifi className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500">
                        Aún no hay datos de monitoreo para este mes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-gray-500">
                            Horario respetado
                          </p>
                          <p
                            className={cn(
                              "text-lg font-bold tabular-nums",
                              complianceTone(
                                branch.connectivity.complianceRate,
                              ),
                            )}
                          >
                            {branch.connectivity.complianceRate != null
                              ? `${Math.round(branch.connectivity.complianceRate * 100)}%`
                              : "—"}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Abierta {formatDuration(branch.connectivity.openMs)}{" "}
                          de{" "}
                          {formatDuration(branch.connectivity.scheduledMs)}{" "}
                          programadas
                        </p>
                      </div>

                      <dl className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                          <dt className="inline-flex items-center gap-1.5 text-gray-500">
                            <WifiOff className="h-3.5 w-3.5" />
                            Sin conexión
                          </dt>
                          <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                            {formatDuration(
                              branch.connectivity.connectivityLossMs,
                            )}
                            {branch.connectivity.incidents.connectivityLoss >
                              0 && (
                              <span className="ml-1 text-xs text-gray-400">
                                ·{" "}
                                {branch.connectivity.incidents
                                  .connectivityLoss}{" "}
                                {branch.connectivity.incidents
                                  .connectivityLoss === 1
                                  ? "vez"
                                  : "veces"}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                          <dt className="text-gray-500">
                            App cerrada en horario
                          </dt>
                          <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                            {formatDuration(branch.connectivity.appClosedMs)}
                            {branch.connectivity.incidents.appClosed > 0 && (
                              <span className="ml-1 text-xs text-gray-400">
                                · {branch.connectivity.incidents.appClosed}{" "}
                                {branch.connectivity.incidents.appClosed === 1
                                  ? "vez"
                                  : "veces"}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                          <dt className="text-gray-500">
                            Cierre manual en horario
                          </dt>
                          <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                            {formatDuration(
                              branch.connectivity.manualClosedMs,
                            )}
                            {branch.connectivity.incidents.manualClosed >
                              0 && (
                              <span className="ml-1 text-xs text-gray-400">
                                ·{" "}
                                {branch.connectivity.incidents.manualClosed}{" "}
                                {branch.connectivity.incidents
                                  .manualClosed === 1
                                  ? "vez"
                                  : "veces"}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>

                      {(branch.connectivity.incidents.connectivityLoss > 0 ||
                        branch.connectivity.incidents.appClosed > 0) && (
                        <p className="inline-flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Revisa la conexión a internet o el dispositivo de la
                          sucursal si estos incidentes se repiten seguido.
                        </p>
                      )}

                      <p className="text-right text-[11px] text-gray-400">
                        Último cambio de estado:{" "}
                        {formatDate(branch.connectivity.lastEventAt)}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <Link
                href="/sucursales"
                className="admin-panel flex items-center justify-between px-4 py-3.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 dark:text-gray-200"
              >
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-gray-400" />
                  Editar datos, credenciales o menú
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
