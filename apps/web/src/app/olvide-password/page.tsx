"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { forgotPassword } from "@/lib/auth";
import {
  isTurnstileConfigured,
  TurnstileWidget,
} from "@/components/turnstile-widget";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
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
      await forgotPassword(
        String(form.get("email")),
        turnstileToken ?? undefined,
      );
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            ¿Olvidaste tu contraseña?
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Te enviamos un enlace a tu correo para restablecerla
          </p>
        </div>

        {sent ? (
          <p className="pwa-alert-brand text-sm">
            Si el correo existe, enviamos un enlace para restablecer la
            contraseña. Revisa tu bandeja de entrada.
          </p>
        ) : (
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
                className="input-field"
                autoComplete="email"
                autoFocus
              />
            </div>
            <TurnstileWidget
              key={turnstileResetKey}
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full"
            >
              {pending ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href={loginHref} className="link-action px-0">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[70vh] items-center px-4 py-10">
      <Suspense fallback={<div className="text-sm text-gray-500">Cargando…</div>}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
