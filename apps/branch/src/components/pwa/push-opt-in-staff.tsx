"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function PushOptInStaff() {
  const [status, setStatus] = useState<
    "idle" | "unsupported" | "denied" | "subscribed" | "error" | "loading"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      void navigator.serviceWorker.getRegistration("/").then((reg) => {
        if (!reg) return;
        void reg.pushManager.getSubscription().then((sub) => {
          if (sub) setStatus("subscribed");
        });
      });
    }
  }, []);

  async function enablePush() {
    if (!vapidKey) {
      setStatus("error");
      setMessage("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el entorno.");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js").catch(
          async () =>
            navigator.serviceWorker.register("/push-dev-sw.js", {
              scope: "/",
            }),
        );
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = subscription.toJSON();
      const token = getAuthToken();

      await apiFetch("/push/subscribe", token, {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
          staffBranch: true,
        }),
      });

      setStatus("subscribed");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "No se pudo activar");
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-slate-500">
        Este navegador no soporta notificaciones push.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 size-4 shrink-0 text-orange-500" />
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Avisos de pedidos nuevos
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Recibe una notificación aunque la app esté en segundo plano.
          </p>
        </div>
      </div>

      {status === "subscribed" ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Notificaciones activadas en este dispositivo.
        </p>
      ) : (
        <>
          {status === "denied" && (
            <p className="text-sm text-red-600">
              Permiso denegado. Actívalo en la configuración del navegador.
            </p>
          )}
          {message && <p className="text-sm text-red-600">{message}</p>}
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={status === "loading" || !vapidKey}
            className="btn-primary w-full sm:w-auto"
          >
            {status === "loading" ? "Activando…" : "Activar notificaciones"}
          </button>
        </>
      )}
    </div>
  );
}
