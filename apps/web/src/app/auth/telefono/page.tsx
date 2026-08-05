"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthUser } from "@ordena/shared";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function PhoneForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(`/auth/telefono?next=${encodeURIComponent(next)}`)}`);
      return;
    }

    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch<{ user: AuthUser }>("/auth/me/phone", token, {
        method: "PATCH",
        body: JSON.stringify({ phone: String(form.get("phone") || "") }),
      });
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-card-body">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            ¿Cuál es tu teléfono?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Lo usamos solo si hay un problema con tu pedido y necesitamos
            contactarte.
          </p>
        </div>

        <form onSubmit={onSubmit} className="grid gap-y-4">
          <div>
            <label htmlFor="phone" className="field-label">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              minLength={8}
              maxLength={20}
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="Ej. 55 1234 5678"
              className="input-field"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Guardando…" : "Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AuthPhonePage() {
  return (
    <div className="flex min-h-[70vh] items-center px-4 py-10">
      <Suspense fallback={<div className="text-sm text-gray-500">Cargando…</div>}>
        <PhoneForm />
      </Suspense>
    </div>
  );
}
