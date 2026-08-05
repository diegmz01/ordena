"use client";

import { useEffect, useState } from "react";
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

type Props = {
  orderId: string;
  viewToken?: string | null;
  guestEmail?: string | null;
  /** Compacto cuando ya está dentro de un card padre */
  embedded?: boolean;
};

export function PushOptIn({ orderId, viewToken, guestEmail, embedded }: Props) {
  const [status, setStatus] = useState<
    "idle" | "unsupported" | "denied" | "subscribed" | "error" | "loading"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- feature-detect solo disponible en cliente
      setStatus("unsupported");
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

      let t = viewToken ?? undefined;
      if (!t) {
        try {
          t = sessionStorage.getItem(`ordena_order_t:${orderId}`) ?? undefined;
        } catch {
          t = undefined;
        }
      }

      await apiFetch("/push/subscribe", token, {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
          orderId,
          viewToken: t,
          guestEmail: guestEmail ?? undefined,
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

  if (status === "subscribed") {
    return (
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
        Notificaciones activadas. Te avisaremos cuando cambie el estado.
      </p>
    );
  }

  const body = (
    <>
      {!embedded && (
        <>
          <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
            ¿Quieres avisos del estado de tu pedido?
          </p>
          <p className="mt-1 text-xs text-orange-800/80 dark:text-orange-200/80">
            Activa notificaciones push en este dispositivo.
          </p>
        </>
      )}
      {status === "denied" && (
        <p className="mt-2 text-sm text-red-600">
          Permiso denegado. Actívalo en la configuración del navegador.
        </p>
      )}
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
      <button
        type="button"
        onClick={enablePush}
        disabled={status === "loading" || !vapidKey}
        className={embedded ? "btn-primary mt-0 w-full sm:w-auto" : "btn-primary mt-3"}
      >
        {status === "loading" ? "Activando…" : "Activar notificaciones"}
      </button>
    </>
  );

  if (embedded) return <div>{body}</div>;

  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
      {body}
    </div>
  );
}
