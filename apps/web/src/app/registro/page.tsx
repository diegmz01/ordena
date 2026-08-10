"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { register } from "@/lib/auth";
import { SocialAuthButtons } from "@/components/social-auth-buttons";
import {
  isTurnstileConfigured,
  TurnstileWidget,
} from "@/components/turnstile-widget";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
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
      await register({
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        phone: String(form.get("phone") || "") || undefined,
        turnstileToken: turnstileToken ?? undefined,
      });
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  const loginHref =
    next === "/"
      ? "/login"
      : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Empieza en un toque
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Crea tu cuenta con redes y sigue con tu pedido
          </p>
        </div>

        <SocialAuthButtons next={next} variant="primary" />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-500">o registro manual</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-orange-700 dark:hover:text-orange-300"
          >
            Registrarme con email
          </button>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-y-4">
            <div>
              <label htmlFor="name" className="field-label">
                Nombre
              </label>
              <input
                id="name"
                name="name"
                required
                className="input-field"
                autoFocus
              />
            </div>
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
              />
            </div>
            <div>
              <label htmlFor="phone" className="field-label">
                Teléfono
              </label>
              <input id="phone" name="phone" className="input-field" />
            </div>
            <div>
              <label htmlFor="password" className="field-label">
                Contraseña (mín. 10)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                className="input-field"
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
              {pending ? "Creando…" : "Crear cuenta"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{" "}
          <Link href={loginHref} className="link-action px-0">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-[70vh] items-center px-4 py-10">
      <Suspense fallback={<div className="text-sm text-gray-500">Cargando…</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
