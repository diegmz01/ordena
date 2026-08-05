"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LoginResponse } from "@ordena/shared";
import { API_URL } from "@/lib/api";
import { setAuthCookie } from "@/lib/auth";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function needsPhone(phone: string | null | undefined) {
  return !phone?.trim();
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completando inicio de sesión…");

  useEffect(() => {
    const error = searchParams.get("error");
    const next = safeNext(searchParams.get("next"));
    const code = searchParams.get("code");

    if (error) {
      setMessage(error);
      const t = window.setTimeout(() => router.replace(next), 2500);
      return () => window.clearTimeout(t);
    }

    if (!code) {
      setMessage("Falta el código de autorización.");
      const t = window.setTimeout(() => router.replace("/login"), 2500);
      return () => window.clearTimeout(t);
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/oauth/exchange`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Ordena-Client": "customer",
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        const data = (await response.json().catch(() => ({}))) as
          | LoginResponse
          | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in data && data.error
              ? data.error
              : "No se pudo completar el inicio de sesión",
          );
        }
        const login = data as LoginResponse;
        if (cancelled) return;
        setAuthCookie();


        if (needsPhone(login.user.phone)) {
          setMessage("Casi listo · necesitamos tu teléfono…");
          router.replace(
            `/auth/telefono?next=${encodeURIComponent(next)}`,
          );
          return;
        }

        router.replace(next);
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "Error");
        window.setTimeout(() => router.replace("/login"), 2500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-gray-500">
          Cargando…
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
