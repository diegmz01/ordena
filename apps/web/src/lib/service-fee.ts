"use client";

import { useEffect, useState } from "react";
import type { ServiceFeeSettingsPublic } from "@ordena/shared";
import { apiFetch } from "@/lib/api";

/** Configuración vigente de tarifa de servicios (null mientras carga o si falla). */
export function useServiceFeeSettings() {
  const [settings, setSettings] = useState<ServiceFeeSettingsPublic | null>(
    null,
  );

  useEffect(() => {
    apiFetch<{ data: ServiceFeeSettingsPublic }>("/settings/service-fee")
      .then((res) => setSettings(res.data))
      .catch(() => setSettings(null));
  }, []);

  return settings;
}
