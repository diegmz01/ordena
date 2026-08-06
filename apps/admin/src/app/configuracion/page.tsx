"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string | null;
  updatedAt: string;
} | null;

type FormState = {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

const EMPTY_FORM: FormState = {
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
};

function tokenOrThrow() {
  const token = getAuthToken();
  if (!token) throw new Error("Sesión expirada, vuelve a iniciar sesión");
  return token;
}

export default function ConfiguracionPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: SmtpSettings }>(
        "/settings/smtp",
        token,
      );
      if (res.data) {
        setForm({
          host: res.data.host,
          port: String(res.data.port),
          secure: res.data.secure,
          username: res.data.username ?? "",
          password: "",
          fromEmail: res.data.fromEmail,
          fromName: res.data.fromName ?? "",
        });
        setHasPassword(res.data.hasPassword);
      }
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
      const port = Number(form.port);
      const res = await apiFetch<{ data: SmtpSettings }>(
        "/settings/smtp",
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            host: form.host.trim(),
            port,
            secure: form.secure,
            username: form.username.trim() || undefined,
            password: form.password || undefined,
            fromEmail: form.fromEmail.trim(),
            fromName: form.fromName.trim() || undefined,
          }),
        },
      );
      if (res.data) {
        setHasPassword(res.data.hasPassword);
        setForm((f) => ({ ...f, password: "" }));
      }
      setSuccess("Configuración SMTP guardada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: FormEvent) {
    event.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: { message: string } }>(
        "/settings/smtp/test",
        token,
        {
          method: "POST",
          body: JSON.stringify({ to: testTo.trim() || undefined }),
        },
      );
      setTestResult({ ok: true, message: res.data.message });
    } catch (err) {
      setTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : "No se pudo enviar el correo",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h1 className="page-title">Configuración</h1>
            <p className="page-description">
              SMTP para el correo de restablecimiento de contraseña de
              clientes.
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-host">
                    Host
                  </label>
                  <input
                    id="smtp-host"
                    className="input-field"
                    required
                    value={form.host}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, host: e.target.value }))
                    }
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-port">
                    Puerto
                  </label>
                  <input
                    id="smtp-port"
                    type="number"
                    className="input-field"
                    required
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, port: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-username">
                    Usuario
                  </label>
                  <input
                    id="smtp-username"
                    className="input-field"
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-password">
                    Contraseña
                  </label>
                  <input
                    id="smtp-password"
                    type="password"
                    className="input-field"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    autoComplete="new-password"
                    placeholder={
                      hasPassword ? "Dejar en blanco para no cambiar" : ""
                    }
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-from-email">
                    Correo remitente
                  </label>
                  <input
                    id="smtp-from-email"
                    type="email"
                    className="input-field"
                    required
                    value={form.fromEmail}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fromEmail: e.target.value }))
                    }
                    placeholder="no-reply@turestaurante.com"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label" htmlFor="smtp-from-name">
                    Nombre remitente
                  </label>
                  <input
                    id="smtp-from-name"
                    className="input-field"
                    value={form.fromName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fromName: e.target.value }))
                    }
                    placeholder="Ordena"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={form.secure}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, secure: e.target.checked }))
                  }
                />
                Conexión segura (TLS)
              </label>

              <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-700">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {!loading && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h1 className="page-title">Enviar correo de prueba</h1>
              <p className="page-description">
                Verifica que la configuración SMTP guardada funciona.
              </p>
            </div>
          </div>
          <div className="admin-panel-body space-y-4">
            {testResult && (
              <p
                className={
                  testResult.ok ? "pwa-alert-brand" : "admin-alert-error"
                }
              >
                {testResult.message}
              </p>
            )}
            <form onSubmit={sendTest} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="field-label" htmlFor="smtp-test-to">
                  Destinatario
                </label>
                <input
                  id="smtp-test-to"
                  type="email"
                  className="input-field"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="tu@correo.com"
                />
              </div>
              <button
                type="submit"
                className="btn-secondary"
                disabled={testing}
              >
                {testing ? "Enviando…" : "Enviar correo de prueba"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
