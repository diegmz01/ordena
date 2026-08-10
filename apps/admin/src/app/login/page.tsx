"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";
import {
  isTurnstileConfigured,
  TurnstileWidget,
} from "@/components/turnstile-widget";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTurnstileConfigured() && !turnstileToken) {
      setError("Completa la verificación de seguridad");
      return;
    }
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await login(
        String(form.get("email")),
        String(form.get("password")),
        "ADMIN",
        turnstileToken ?? undefined,
      );
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Inicia sesión
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Panel de administración
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-y-4">
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input-field"
            />
          </div>
          <TurnstileWidget
            key={turnstileResetKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-8">
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
