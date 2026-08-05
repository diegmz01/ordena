"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = "google" | "apple" | "facebook";

const ALL_PROVIDERS: Provider[] = ["google", "apple", "facebook"];

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
};

type SocialAuthButtonsProps = {
  next?: string;
  className?: string;
  /** primary = redes como camino principal (sin divider superior) */
  variant?: "primary" | "secondary";
};

export function SocialAuthButtons({
  next = "/",
  className,
  variant = "primary",
}: SocialAuthButtonsProps) {
  const [configured, setConfigured] = useState<Provider[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/oauth/providers`)
      .then((res) => res.json())
      .then((data: { providers?: Provider[] }) => {
        if (cancelled) return;
        setConfigured(
          (data.providers ?? []).filter(
            (p): p is Provider =>
              p === "google" || p === "apple" || p === "facebook",
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setConfigured([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextPath =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";

  function start(provider: Provider) {
    setHint(null);
    if (!configured.includes(provider)) {
      setHint(
        `${PROVIDER_LABEL[provider]} aún no está configurado. Agrega las variables en el .env de la API.`,
      );
      return;
    }
    const url = new URL(
      `${API_URL}/auth/oauth/${provider}/start`,
      window.location.origin,
    );
    url.searchParams.set("next", nextPath);
    window.location.assign(url.toString());
  }

  return (
    <div className={cn("space-y-3", className)}>
      {variant === "secondary" && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-500">o continúa con</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>
      )}
      <div className="grid gap-2.5">
        {ALL_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => start(provider)}
            className={cn(
              "flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition",
              provider === "google" &&
                "border-gray-200 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800",
              provider === "apple" &&
                "border-gray-900 bg-gray-900 text-white hover:bg-black dark:border-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100",
              provider === "facebook" &&
                "border-[#1877F2] bg-[#1877F2] text-white hover:bg-[#166FE5]",
            )}
          >
            <ProviderIcon provider={provider} />
            Continuar con {PROVIDER_LABEL[provider]}
          </button>
        ))}
      </div>
      {hint && <p className="text-center text-xs text-amber-600">{hint}</p>}
    </div>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z"
        />
        <path
          fill="#34A853"
          d="M6.6 14.3l-.7.5-2.4 1.9C5.1 19.3 8.3 21 12 21c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-6-4.4z"
        />
        <path
          fill="#4A90E2"
          d="M3.5 7.3C2.6 9 2 10.9 2 13s.6 4 1.5 5.7l3.1-2.4C6 15.1 5.7 14.1 5.7 13s.3-2.1.8-3l-3-2.7z"
        />
        <path
          fill="#FBBC05"
          d="M12 5.3c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 2.2 14.6 1 12 1 8.3 1 5.1 2.7 3.5 5.3l3.1 2.4C7 5.2 9.2 3.3 12 3.3z"
        />
      </svg>
    );
  }

  if (provider === "apple") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden
        fill="currentColor"
      >
        <path d="M16.4 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.7.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1-.1 1.5-.7 2.8-.7s1.7.7 2.8.7 1.9-1.1 2.6-2.1c.8-1.2 1.1-2.3 1.2-2.4-.1 0-2.2-.8-2.2-3.5zM14.3 6.4c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 1.9-.4 2.5-1.2z" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="#fff">
      <path d="M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1C0 18.1 4.4 23.1 10.1 24v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8v2.2h3.3l-.5 3.5h-2.8V24C19.6 23.1 24 18.1 24 12.1z" />
    </svg>
  );
}
