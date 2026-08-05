"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

export const STAFF_PRESENCE_EVENT = "ordena:staff-presence";
export const STAFF_HEARTBEAT_INTERVAL_MS = 15_000;

export type StaffPresenceDetail = {
  ok: boolean;
  browserOnline: boolean;
};

function dispatchPresence(detail: StaffPresenceDetail) {
  window.dispatchEvent(
    new CustomEvent(STAFF_PRESENCE_EVENT, { detail }),
  );
}

function signalAppClosed() {
  const token = getAuthToken();
  if (!token) return;

  const body = JSON.stringify({ reason: "APP_CLOSED" });
  void fetch(`${API_URL}/branches/me/away`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ordena-Client": "branch",
    },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => undefined);
}

export function StaffPresence() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [apiOk, setApiOk] = useState(true);

  const sendHeartbeat = useCallback(async () => {
    const token = getAuthToken();
    if (!token || isLogin) return;

    // navigator.onLine solo refleja si hay una interfaz de red activa, no si
    // hay internet real: puede reportar "offline" en falso (VPN, redes
    // corporativas, ciertos adaptadores) aunque el equipo sí tenga conexión.
    // Por eso el heartbeat real al API es la única señal de verdad; onLine
    // solo se usa para matizar el mensaje cuando el heartbeat también falla.
    try {
      await apiFetch<{ data: unknown }>("/branches/me/heartbeat", token, {
        method: "POST",
      });
      setApiOk(true);
      setBrowserOnline(true);
      dispatchPresence({ ok: true, browserOnline: true });
    } catch {
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      setApiOk(false);
      setBrowserOnline(online);
      dispatchPresence({ ok: false, browserOnline: online });
    }
  }, [isLogin]);

  useEffect(() => {
    if (isLogin) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- heartbeat de presencia al montar y en intervalo periódico
    void sendHeartbeat();
    const id = window.setInterval(() => {
      void sendHeartbeat();
    }, STAFF_HEARTBEAT_INTERVAL_MS);

    const onOnline = () => {
      void sendHeartbeat();
    };
    const onOffline = () => {
      // No confiamos ciegamente en el evento "offline": puede ser un falso
      // positivo. Verificamos con un heartbeat real antes de mostrar el banner.
      void sendHeartbeat();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };
    const onPageHide = () => {
      signalAppClosed();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isLogin, sendHeartbeat]);

  if (isLogin) return null;

  const showBanner = !browserOnline || !apiOk;
  if (!showBanner) return null;

  const detail = !browserOnline
    ? "Sin internet"
    : "No hay respuesta de la API";

  return (
    <div className="staff-offline-banner" role="status" aria-live="polite">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">
          Sin conexión · la sucursal no recibe pedidos nuevos
        </p>
        <p className="text-[11px] font-medium opacity-80">{detail}</p>
      </div>
    </div>
  );
}
