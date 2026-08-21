"use client";

import { FormEvent, useState } from "react";
import { formatMoney } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { SocialAuthButtons } from "@/components/social-auth-buttons";
import {
  isTurnstileConfigured,
  TurnstileWidget,
} from "@/components/turnstile-widget";

type PagarMode = "guest" | "register" | "login";

type PagarModalProps = {
  open: boolean;
  onClose: () => void;
  returnPath: string;
  total: number;
  pending: boolean;
  error: string | null;
  onSubmitGuest: (form: {
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    turnstileToken: string | null;
  }) => Promise<void>;
  onSubmitRegister: (form: {
    regName: string;
    regEmail: string;
    regPassword: string;
    regPhone: string;
    turnstileToken: string | null;
  }) => Promise<void>;
  onSubmitLogin: (form: {
    email: string;
    password: string;
    turnstileToken: string | null;
  }) => Promise<void>;
};

export function PagarModal({
  open,
  onClose,
  returnPath,
  total,
  pending,
  error,
  onSubmitGuest,
  onSubmitRegister,
  onSubmitLogin,
}: PagarModalProps) {
  const [mode, setMode] = useState<PagarMode>("guest");
  const [showAltForm, setShowAltForm] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  function openMode(next: PagarMode) {
    setMode(next);
    setShowAltForm(true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTurnstileConfigured() && !turnstileToken) return;
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        await onSubmitRegister({
          regName: String(form.get("regName") || ""),
          regEmail: String(form.get("regEmail") || ""),
          regPassword: String(form.get("regPassword") || ""),
          regPhone: String(form.get("regPhone") || ""),
          turnstileToken,
        });
      } else if (mode === "login") {
        await onSubmitLogin({
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
          turnstileToken,
        });
      } else {
        await onSubmitGuest({
          guestName: String(form.get("guestName") || ""),
          guestEmail: String(form.get("guestEmail") || ""),
          guestPhone: String(form.get("guestPhone") || ""),
          turnstileToken,
        });
      }
    } catch {
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Entra para pagar más rápido"
      description="Un toque con redes y el pedido queda en tu cuenta"
    >
      <div className="space-y-4">
        <SocialAuthButtons next={returnPath} variant="primary" />

        <button
          type="button"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => openMode("login")}
        >
          Iniciar sesión con correo y contraseña
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-500">otras opciones</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        {!showAltForm ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300"
              onClick={() => openMode("guest")}
            >
              Continuar como invitado
            </button>
            <button
              type="button"
              className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:text-orange-700 dark:border-gray-600 dark:text-gray-300"
              onClick={() => openMode("register")}
            >
              Registro con email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(
                  "admin-tab-pill",
                  mode === "login" && "admin-tab-pill-active",
                )}
                onClick={() => setMode("login")}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={cn(
                  "admin-tab-pill",
                  mode === "guest" && "admin-tab-pill-active",
                )}
                onClick={() => setMode("guest")}
              >
                Invitado
              </button>
              <button
                type="button"
                className={cn(
                  "admin-tab-pill",
                  mode === "register" && "admin-tab-pill-active",
                )}
                onClick={() => setMode("register")}
              >
                Crear cuenta
              </button>
              <button
                type="button"
                className="ml-auto text-xs text-gray-500 underline"
                onClick={() => setShowAltForm(false)}
              >
                Volver
              </button>
            </div>

            {mode === "login" ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Entra con tu cuenta y sigue directo al pago.
                </p>
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  required
                  className="input-field"
                  autoComplete="email"
                />
                <input
                  name="password"
                  type="password"
                  placeholder="Contraseña"
                  required
                  className="input-field"
                  autoComplete="current-password"
                />
              </div>
            ) : mode === "guest" ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Pedirás sin registrarte. Solo usamos estos datos para el
                  pedido.
                </p>
                <input
                  name="guestName"
                  placeholder="Nombre"
                  required
                  minLength={2}
                  className="input-field"
                />
                <input
                  name="guestEmail"
                  type="email"
                  placeholder="Email"
                  required
                  className="input-field"
                />
                <input
                  name="guestPhone"
                  placeholder="Teléfono"
                  required
                  minLength={8}
                  className="input-field"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Crea tu cuenta y paga en el mismo paso.
                </p>
                <input
                  name="regName"
                  placeholder="Nombre"
                  required
                  minLength={2}
                  className="input-field"
                />
                <input
                  name="regEmail"
                  type="email"
                  placeholder="Email"
                  required
                  className="input-field"
                />
                <input
                  name="regPhone"
                  placeholder="Teléfono (opcional)"
                  className="input-field"
                />
                <input
                  name="regPassword"
                  type="password"
                  placeholder="Contraseña (mín. 10)"
                  required
                  minLength={10}
                  className="input-field"
                  autoComplete="new-password"
                />
              </div>
            )}

            <TurnstileWidget
              key={turnstileResetKey}
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />

            {error && <p className="admin-alert-error">{error}</p>}

            <button
              type="submit"
              disabled={pending || (isTurnstileConfigured() && !turnstileToken)}
              className="btn-primary w-full py-3.5 text-base"
            >
              {pending
                ? mode === "register"
                  ? "Creando cuenta y pagando…"
                  : mode === "login"
                    ? "Iniciando sesión…"
                    : "Preparando el pago…"
                : mode === "login"
                  ? `Entrar y pagar · ${formatMoney(total)}`
                  : `Continuar al pago · ${formatMoney(total)}`}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-500">
          Autorización segura con Stripe · Se cobra al quedar listo
        </p>
      </div>
    </Modal>
  );
}
