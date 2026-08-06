"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { BranchDayHours, BranchHours } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { Modal } from "@/components/ui/modal";
import { BranchMenuModal } from "@/components/branch-menu-modal";
import { cn } from "@/lib/utils";

type StaffInfo = {
  id: string;
  email: string;
  name: string | null;
};

type AvailabilityDetail = {
  status: "OPEN" | "PAUSED" | "CLOSED";
  mode: "AUTO" | "OPEN" | "PAUSED" | "CLOSED";
  pausedUntil: string | null;
  acceptingOrders: boolean;
  withinSchedule: boolean;
  source: "schedule" | "manual" | "pause" | "offline";
  offlineCause: "app_closed" | "connection_lost" | null;
  todayHoursLabel: string | null;
  staffLastSeenAt: string | null;
  modeLabel: string;
  statusLabel: string;
  sourceLabel: string;
  offlineCauseLabel: string | null;
};

type Branch = {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: BranchHours | null;
  isActive: boolean;
  staff: StaffInfo | null;
  availabilityDetail?: AvailabilityDetail;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingComplete: boolean;
};

function stripeConnectLabel(branch: Branch) {
  if (!branch.stripeAccountId) return "No conectada";
  if (branch.stripeChargesEnabled) {
    return branch.stripePayoutsEnabled
      ? "Lista · payouts activos"
      : "Lista para cobrar";
  }
  if (branch.stripeDetailsSubmitted) return "En revisión";
  return "Pendiente onboarding";
}

function stripeConnectBadgeClass(branch: Branch) {
  if (!branch.stripeAccountId) return "status-badge-inactive";
  if (branch.stripeChargesEnabled) return "status-badge-active";
  return "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
}

function formatLastSeen(iso: string | null | undefined) {
  if (!iso) return "Nunca";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function availabilityBadgeClass(detail: AvailabilityDetail | undefined) {
  if (!detail) return "status-badge-inactive";
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

type DayKey = keyof BranchHours;

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

function defaultDay(): BranchDayHours {
  return { closed: false, open: "09:00", close: "22:00" };
}

function defaultHours(): BranchHours {
  return {
    mon: defaultDay(),
    tue: defaultDay(),
    wed: defaultDay(),
    thu: defaultDay(),
    fri: defaultDay(),
    sat: defaultDay(),
    sun: { closed: true },
  };
}

function normalizeHours(raw: unknown): BranchHours {
  const base = defaultHours();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<Record<DayKey, Partial<BranchDayHours>>>;
  for (const key of DAY_KEYS) {
    const day = obj[key];
    if (!day) continue;
    if (day.closed) {
      base[key] = { closed: true };
    } else {
      base[key] = {
        closed: false,
        open: day.open ?? "09:00",
        close: day.close ?? "22:00",
      };
    }
  }
  return base;
}

type FormState = {
  name: string;
  code: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  hours: BranchHours;
  isActive: boolean;
  staffEmail: string;
  staffPassword: string;
};

const emptyForm = (): FormState => ({
  name: "",
  code: "",
  address: "",
  phone: "",
  latitude: "",
  longitude: "",
  hours: defaultHours(),
  isActive: true,
  staffEmail: "",
  staffPassword: "",
});

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialsBranch, setCredentialsBranch] = useState<Branch | null>(
    null,
  );
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  const [menuBranch, setMenuBranch] = useState<Branch | null>(null);
  const [stripeBusyId, setStripeBusyId] = useState<string | null>(null);

  const tokenOrThrow = useCallback(() => {
    const token = getAuthToken();
    if (!token) throw new Error("Inicia sesión como admin");
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: Branch[] }>("/branches/admin", token);
      setBranches(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar sucursales",
      );
    } finally {
      setLoading(false);
    }
  }, [tokenOrThrow]);

  const refreshStripeStatus = useCallback(
    async (branchId: string, opts?: { silent?: boolean }) => {
      const token = tokenOrThrow();
      setStripeBusyId(branchId);
      try {
        const res = await apiFetch<{
          data: {
            stripeAccountId: string | null;
            stripeChargesEnabled: boolean;
            stripePayoutsEnabled: boolean;
            stripeDetailsSubmitted: boolean;
            stripeOnboardingComplete: boolean;
          };
        }>(`/branches/admin/${branchId}/stripe/refresh`, token, {
          method: "POST",
        });
        setBranches((prev) =>
          prev.map((b) =>
            b.id === branchId
              ? {
                  ...b,
                  stripeAccountId: res.data.stripeAccountId,
                  stripeChargesEnabled: res.data.stripeChargesEnabled,
                  stripePayoutsEnabled: res.data.stripePayoutsEnabled,
                  stripeDetailsSubmitted: res.data.stripeDetailsSubmitted,
                  stripeOnboardingComplete: res.data.stripeOnboardingComplete,
                }
              : b,
          ),
        );
        if (!opts?.silent) {
          setSuccess("Estado de Stripe actualizado");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo actualizar el estado de Stripe",
        );
      } finally {
        setStripeBusyId(null);
      }
    },
    [tokenOrThrow],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de sucursales al montar
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    const branch = params.get("branch");
    if (!stripe || !branch) return;
    if (stripe !== "return" && stripe !== "refresh") return;

    void (async () => {
      await refreshStripeStatus(branch, { silent: true });
      setSuccess(
        stripe === "return"
          ? "Onboarding de Stripe finalizado. Revisa el estado de la sucursal."
          : "Enlace de onboarding renovado. Continúa la conexión de Stripe.",
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe");
      url.searchParams.delete("branch");
      window.history.replaceState({}, "", url.pathname);
    })();
  }, [refreshStripeStatus]);

  async function startStripeOnboard(branch: Branch) {
    setError(null);
    setSuccess(null);
    setStripeBusyId(branch.id);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: { url: string } }>(
        `/branches/admin/${branch.id}/stripe/onboard`,
        token,
        { method: "POST" },
      );
      window.location.assign(res.data.url);
    } catch (err) {
      setStripeBusyId(null);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar el onboarding de Stripe",
      );
    }
  }

  async function openStripeDashboard(branch: Branch) {
    setError(null);
    setStripeBusyId(branch.id);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: { url: string } }>(
        `/branches/admin/${branch.id}/stripe/dashboard`,
        token,
        { method: "POST" },
      );
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir el dashboard de Stripe",
      );
    } finally {
      setStripeBusyId(null);
    }
  }

  const sorted = useMemo(
    () => [...branches].sort((a, b) => a.name.localeCompare(b.name)),
    [branches],
  );

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setSuccess(null);
    setModalOpen(true);
  }

  function openEdit(branch: Branch) {
    setEditingId(branch.id);
    setForm({
      name: branch.name,
      code: branch.slug,
      address: branch.address,
      phone: branch.phone ?? "",
      latitude:
        branch.latitude === null || branch.latitude === undefined
          ? ""
          : String(branch.latitude),
      longitude:
        branch.longitude === null || branch.longitude === undefined
          ? ""
          : String(branch.longitude),
      hours: normalizeHours(branch.hours),
      isActive: branch.isActive,
      staffEmail: "",
      staffPassword: "",
    });
    setFormError(null);
    setSuccess(null);
    setModalOpen(true);
  }

  function openCredentials(branch: Branch) {
    setCredentialsBranch(branch);
    setCredEmail(branch.staff?.email ?? "");
    setCredPassword("");
    setCredError(null);
    setSuccess(null);
    setCredentialsOpen(true);
  }

  function closeCredentials() {
    setCredentialsOpen(false);
    setCredentialsBranch(null);
    setCredEmail("");
    setCredPassword("");
    setCredError(null);
  }

  function updateDay(day: DayKey, patch: Partial<BranchDayHours>) {
    setForm((f) => {
      const current = f.hours[day];
      if (patch.closed === true) {
        return { ...f, hours: { ...f.hours, [day]: { closed: true } } };
      }
      const open =
        patch.open ??
        (!current.closed ? current.open : undefined) ??
        "09:00";
      const close =
        patch.close ??
        (!current.closed ? current.close : undefined) ??
        "22:00";
      return {
        ...f,
        hours: {
          ...f.hours,
          [day]: { closed: false, open, close },
        },
      };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const token = tokenOrThrow();
      const latRaw = form.latitude.trim();
      const lngRaw = form.longitude.trim();
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (latRaw || lngRaw) {
        latitude = Number(latRaw);
        longitude = Number(lngRaw);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
          throw new Error("Latitud inválida (−90 a 90)");
        }
        if (
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new Error("Longitud inválida (−180 a 180)");
        }
      }

      const base = {
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || null,
        latitude,
        longitude,
        hours: form.hours,
        isActive: form.isActive,
      };

      if (editingId) {
        await apiFetch(`/branches/admin/${editingId}`, token, {
          method: "PATCH",
          body: JSON.stringify(base),
        });
        setSuccess("Sucursal actualizada");
      } else {
        if (!form.code.trim()) {
          throw new Error("El código de sucursal es requerido");
        }
        if (!form.staffEmail.trim()) {
          throw new Error("El email del staff es requerido");
        }
        if (!form.staffPassword.trim()) {
          throw new Error("La contraseña del staff es requerida");
        }
        await apiFetch("/branches/admin", token, {
          method: "POST",
          body: JSON.stringify({
            ...base,
            staffEmail: form.staffEmail.trim(),
            staffPassword: form.staffPassword,
          }),
        });
        setSuccess("Sucursal creada");
      }

      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveCredentials(event: FormEvent) {
    event.preventDefault();
    if (!credentialsBranch) return;
    setSavingCredentials(true);
    setCredError(null);
    try {
      const token = tokenOrThrow();
      const payload: Record<string, string> = {
        staffEmail: credEmail.trim(),
      };
      if (credPassword.trim()) {
        payload.staffPassword = credPassword;
      } else if (!credentialsBranch.staff) {
        throw new Error("La contraseña es requerida para crear el usuario");
      }
      await apiFetch(`/branches/admin/${credentialsBranch.id}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setSuccess("Credenciales actualizadas");
      closeCredentials();
      await load();
    } catch (err) {
      setCredError(
        err instanceof Error ? err.message : "No se pudieron guardar",
      );
    } finally {
      setSavingCredentials(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h1 className="page-title">Sucursales</h1>
            <p className="page-description">
              Alta de sucursales, horarios y usuario staff para la app de
              sucursal.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={openCreate}>
            Nueva sucursal
          </button>
        </div>

        <div className="admin-panel-body space-y-4">
          {error && <p className="admin-alert-error">{error}</p>}
          {success && <p className="pwa-alert-brand">{success}</p>}

          {loading ? (
            <p className="text-sm text-gray-500">Cargando sucursales…</p>
          ) : sorted.length === 0 ? (
            <div className="admin-empty">
              Aún no hay sucursales. Usa “Nueva sucursal” para crear la primera.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Sucursal
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Dirección
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Teléfono
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Staff
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Disponibilidad
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Stripe
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sorted.map((branch) => (
                    <tr
                      key={branch.id}
                      className="cursor-pointer transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-950/10"
                      onClick={() => openEdit(branch)}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white">
                          {branch.name}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums text-gray-500">
                          Código {branch.slug}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {branch.address}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {branch.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {branch.staff?.email ?? (
                          <span className="text-xs text-gray-400">
                            Sin staff
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {branch.availabilityDetail ? (
                          <div className="min-w-[14rem] space-y-1">
                            <span
                              className={availabilityBadgeClass(
                                branch.availabilityDetail,
                              )}
                            >
                              {branch.availabilityDetail.statusLabel}
                            </span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Modo: {branch.availabilityDetail.modeLabel}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Origen: {branch.availabilityDetail.sourceLabel}
                              {branch.availabilityDetail.todayHoursLabel
                                ? ` · hoy ${branch.availabilityDetail.todayHoursLabel}`
                                : ""}
                            </p>
                            {branch.availabilityDetail.offlineCauseLabel && (
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                {branch.availabilityDetail.offlineCauseLabel}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400">
                              Última presencia:{" "}
                              {formatLastSeen(
                                branch.availabilityDetail.staffLastSeenAt,
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              Pedidos nuevos:{" "}
                              {branch.availabilityDetail.acceptingOrders
                                ? "Sí"
                                : "No"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {branch.isActive ? (
                          <span className="status-badge-active">Activa</span>
                        ) : (
                          <span className="status-badge-inactive">
                            Inactiva
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="min-w-[11rem] space-y-2">
                          <span className={stripeConnectBadgeClass(branch)}>
                            {stripeConnectLabel(branch)}
                          </span>
                          {branch.stripeAccountId && (
                            <p className="truncate text-[11px] text-gray-400">
                              {branch.stripeAccountId}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {!branch.stripeChargesEnabled ? (
                              <button
                                type="button"
                                className="btn-primary btn-compact"
                                disabled={stripeBusyId === branch.id}
                                onClick={() => void startStripeOnboard(branch)}
                              >
                                {branch.stripeAccountId
                                  ? "Continuar onboarding"
                                  : "Conectar Stripe"}
                              </button>
                            ) : null}
                            {branch.stripeAccountId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary btn-compact"
                                  disabled={stripeBusyId === branch.id}
                                  onClick={() =>
                                    void refreshStripeStatus(branch.id)
                                  }
                                >
                                  Actualizar
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-compact"
                                  disabled={stripeBusyId === branch.id}
                                  onClick={() =>
                                    void openStripeDashboard(branch)
                                  }
                                >
                                  Dashboard
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => openEdit(branch)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => openCredentials(branch)}
                          >
                            Credenciales
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => setMenuBranch(branch)}
                          >
                            Menú
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Editar sucursal" : "Nueva sucursal"}
        description={
          editingId
            ? "Actualiza datos y horarios de la sucursal."
            : "Define datos, horarios y el usuario staff inicial."
        }
        wide
      >
        <form onSubmit={save} className="space-y-4">
          {formError && <p className="admin-alert-error">{formError}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="branch-name">
                Nombre
              </label>
              <input
                id="branch-name"
                className="input-field"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                minLength={2}
                autoFocus
              />
            </div>
            <div>
              <label className="field-label" htmlFor="branch-code">
                Código
              </label>
              <input
                id="branch-code"
                className="input-field uppercase"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/gi, ""),
                  }))
                }
                required
                minLength={1}
                maxLength={12}
                placeholder="S01"
                pattern="[A-Za-z0-9]+"
                title="Solo letras y números (ej. S01)"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-gray-500">
                Identificador único: letras y números (ej. S01).
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="branch-address">
                Dirección
              </label>
              <input
                id="branch-address"
                className="input-field"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                required
                minLength={5}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="branch-phone">
                Teléfono
              </label>
              <input
                id="branch-phone"
                className="input-field"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="555-0000"
              />
            </div>
            <div className="hidden sm:block" aria-hidden />
            <div>
              <label className="field-label" htmlFor="branch-lat">
                Latitud
              </label>
              <input
                id="branch-lat"
                type="number"
                step="any"
                className="input-field"
                value={form.latitude}
                onChange={(e) =>
                  setForm((f) => ({ ...f, latitude: e.target.value }))
                }
                placeholder="19.4326"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="branch-lng">
                Longitud
              </label>
              <input
                id="branch-lng"
                type="number"
                step="any"
                className="input-field"
                value={form.longitude}
                onChange={(e) =>
                  setForm((f) => ({ ...f, longitude: e.target.value }))
                }
                placeholder="-99.1332"
              />
            </div>
          </div>

          <div>
            <p className="field-label mb-2">Horarios</p>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              {DAY_KEYS.map((day) => {
                const hours = form.hours[day];
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[8rem_auto_1fr_auto_1fr]"
                  >
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {DAY_LABELS[day]}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={hours.closed}
                        onChange={(e) =>
                          updateDay(day, { closed: e.target.checked })
                        }
                      />
                      Cerrado
                    </label>
                    <input
                      type="time"
                      className={cn(
                        "input-field",
                        hours.closed && "opacity-40",
                      )}
                      disabled={hours.closed}
                      value={hours.closed ? "" : (hours.open ?? "09:00")}
                      onChange={(e) =>
                        updateDay(day, { closed: false, open: e.target.value })
                      }
                    />
                    <span className="hidden text-center text-xs text-gray-400 sm:block">
                      a
                    </span>
                    <input
                      type="time"
                      className={cn(
                        "input-field",
                        hours.closed && "opacity-40",
                      )}
                      disabled={hours.closed}
                      value={hours.closed ? "" : (hours.close ?? "22:00")}
                      onChange={(e) =>
                        updateDay(day, {
                          closed: false,
                          close: e.target.value,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {!editingId && (
            <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 dark:border-gray-700">
              <p className="field-label sm:col-span-2">Usuario staff</p>
              <div>
                <label className="field-label" htmlFor="staff-email">
                  Email (usuario)
                </label>
                <input
                  id="staff-email"
                  type="email"
                  className="input-field"
                  value={form.staffEmail}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, staffEmail: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="staff-password">
                  Contraseña (mín. 12)
                </label>
                <input
                  id="staff-password"
                  type="password"
                  className="input-field"
                  value={form.staffPassword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, staffPassword: e.target.value }))
                  }
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.checked }))
              }
            />
            Sucursal activa
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeModal}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving
                ? "Guardando…"
                : editingId
                  ? "Guardar cambios"
                  : "Crear sucursal"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={credentialsOpen}
        onClose={closeCredentials}
        title="Credenciales staff"
        description={
          credentialsBranch
            ? `Usuario de acceso para “${credentialsBranch.name}”.`
            : undefined
        }
      >
        <form onSubmit={saveCredentials} className="space-y-4">
          {credError && <p className="admin-alert-error">{credError}</p>}
          <div>
            <label className="field-label" htmlFor="cred-email">
              Email (usuario)
            </label>
            <input
              id="cred-email"
              type="email"
              className="input-field"
              value={credEmail}
              onChange={(e) => setCredEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cred-password">
              Contraseña
            </label>
            <input
              id="cred-password"
              type="password"
              className="input-field"
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
              required={!credentialsBranch?.staff}
              minLength={12}
              placeholder={
                credentialsBranch?.staff
                  ? "Dejar vacío para no cambiar"
                  : undefined
              }
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeCredentials}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingCredentials}
            >
              {savingCredentials ? "Guardando…" : "Guardar credenciales"}
            </button>
          </div>
        </form>
      </Modal>

      <BranchMenuModal
        open={!!menuBranch}
        branchId={menuBranch?.id ?? null}
        branchName={menuBranch?.name}
        onClose={() => setMenuBranch(null)}
        onSaved={() => {
          setSuccess("Menú de sucursal actualizado");
        }}
      />
    </div>
  );
}
