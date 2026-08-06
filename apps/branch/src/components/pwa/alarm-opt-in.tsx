"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { isAlarmEnabled, setAlarmEnabled, unlockAudio } from "@/lib/alarm";

export function AlarmOptIn() {
  const [enabled, setEnabled] = useState(true); // evita flash; se corrige en el efecto

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage, no disponible en SSR
    setEnabled(isAlarmEnabled());
  }, []);

  if (enabled) return null;

  function activate() {
    unlockAudio();
    setAlarmEnabled(true);
    setEnabled(true);
  }

  return (
    <div className="pwa-alert-brand flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Volume2 className="size-4 shrink-0" />
        <p>Activa el sonido para no perderte pedidos nuevos.</p>
      </div>
      <button
        type="button"
        onClick={activate}
        className="pwa-btn-primary shrink-0"
      >
        Activar sonido
      </button>
    </div>
  );
}
