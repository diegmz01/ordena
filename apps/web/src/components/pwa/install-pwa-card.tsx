"use client";

import { useEffect, useState } from "react";
import { Download, Share, User } from "lucide-react";
import { isIOS, isStandalonePwa } from "@/lib/device";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Status = "checking" | "ios" | "installable" | "installed" | "unavailable";

export function InstallPwaCard() {
  const [status, setStatus] = useState<Status>("checking");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalonePwa()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- feature-detect solo disponible en cliente
      setStatus("installed");
      return;
    }
    if (isIOS()) {
      setStatus("ios");
      return;
    }

    setStatus("unavailable");

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus("installable");
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setStatus("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (status === "checking" || status === "installed" || status === "unavailable") {
    return null;
  }

  return (
    <div className="customer-feature-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
          <User className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">
            Instala la app de El Bajito
          </p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Pide más rápido, sin abrir el navegador, directo desde tu pantalla de
            inicio.
          </p>
          {status === "ios" && (
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-gray-600 dark:text-gray-300">
              <li>
                Toca{" "}
                <Share className="mx-0.5 inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                (Compartir) en la barra de Safari
              </li>
              <li>Elige &quot;Agregar a inicio&quot;</li>
            </ol>
          )}
        </div>
      </div>
      {status === "installable" && (
        <button
          type="button"
          onClick={handleInstall}
          className="btn-primary shrink-0"
        >
          <Download className="size-4" />
          Instalar app
        </button>
      )}
    </div>
  );
}
