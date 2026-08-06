"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirmPassword"));
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      setPending(false);
      return;
    }
    try {
      await resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="login-card">
        <div className="login-card-body text-center">
          <p className="text-sm text-red-600">
            Enlace inválido o expirado.
          </p>
          <p className="mt-5 text-sm text-slate-500">
            <Link href="/olvide-password" className="link-action px-0">
              Solicitar un nuevo enlace
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Crea una nueva contraseña
          </h1>
        </div>

        {done ? (
          <p className="pwa-alert-brand text-sm">
            Contraseña actualizada. Redirigiendo a inicio de sesión…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-y-4">
            <div>
              <label htmlFor="password" className="field-label">
                Contraseña nueva (mín. 10)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                className="input-field"
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="field-label">
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={10}
                className="input-field"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full"
            >
              {pending ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[70vh] items-center px-4 py-10">
      <Suspense fallback={<div className="text-sm text-gray-500">Cargando…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
