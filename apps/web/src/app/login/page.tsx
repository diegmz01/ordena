"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";
import { SocialAuthButtons } from "@/components/social-auth-buttons";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await login(
        String(form.get("email")),
        String(form.get("password")),
        "CUSTOMER",
      );
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  }

  const registerHref =
    next === "/"
      ? "/registro"
      : `/registro?next=${encodeURIComponent(next)}`;

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Entra en un toque
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Más rápido para pedir y pagar
          </p>
        </div>

        <SocialAuthButtons next={next} variant="primary" />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-500">o con email</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-orange-700 dark:hover:text-orange-300"
          >
            Usar email y contraseña
          </button>
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
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="field-label">
                  Contraseña
                </label>
                <Link
                  href={
                    next === "/"
                      ? "/olvide-password"
                      : `/olvide-password?next=${encodeURIComponent(next)}`
                  }
                  className="link-action px-0 text-xs"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="input-field"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full"
            >
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          ¿Primera vez?{" "}
          <Link href={registerHref} className="link-action px-0">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center px-4 py-10">
      <Suspense fallback={<div className="text-sm text-gray-500">Cargando…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
