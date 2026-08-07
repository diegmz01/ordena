"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type BranchStatus = {
  id: string;
  name: string;
  acceptingOrders: boolean;
};

/**
 * Disponibilidad en vivo de una sucursal (poll cada 30s + al recuperar foco).
 * `branch` es `undefined` mientras se resuelve el primer chequeo y `null` si
 * la sucursal no existe/está inactiva.
 */
export function useBranchStatus(
  branchId: string | null,
): BranchStatus | null | undefined {
  const [status, setStatus] = useState<BranchStatus | null | undefined>(
    undefined,
  );

  const check = useCallback(async () => {
    if (!branchId) {
      setStatus(undefined);
      return;
    }
    try {
      const res = await apiFetch<{ data: BranchStatus[] }>("/branches?all=1");
      setStatus(res.data.find((b) => b.id === branchId) ?? null);
    } catch {
      // Sin datos de red: no asumimos disponible ni no-disponible.
    }
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se resetea a "cargando" cada vez que cambia la sucursal seleccionada
    setStatus(undefined);
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de disponibilidad al montar y en poll periódico
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [check]);

  return status;
}
