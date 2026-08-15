"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type BranchStatus = {
  id: string;
  name: string;
  acceptingOrders: boolean;
};

// El gate de heartbeat de staff en el API (STAFF_HEARTBEAT_STALE_MS, ver
// apps/api/src/utils/branch-availability.ts) no tiene margen propio: un solo
// heartbeat retrasado (red móvil, pestaña en segundo plano) puede tumbar
// `acceptingOrders` por unos segundos y autocorregirse en el siguiente
// heartbeat. Igual que el staff PWA exige fallos consecutivos antes de
// avisar (OFFLINE_FAILURE_THRESHOLD en staff-presence.tsx), aquí exigimos 2
// chequeos consecutivos como no-disponible antes de reflejarlo, para no
// sacar al cliente de su pedido por un blip transitorio que ya se resolvió.
const UNAVAILABLE_CONFIRM_THRESHOLD = 2;

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
  const consecutiveUnavailable = useRef(0);

  const check = useCallback(async () => {
    if (!branchId) {
      setStatus(undefined);
      return;
    }
    try {
      const res = await apiFetch<{ data: BranchStatus[] }>("/branches?all=1");
      const found = res.data.find((b) => b.id === branchId) ?? null;
      if (found?.acceptingOrders) {
        consecutiveUnavailable.current = 0;
        setStatus(found);
        return;
      }
      consecutiveUnavailable.current += 1;
      setStatus((prev) =>
        prev === undefined ||
        consecutiveUnavailable.current >= UNAVAILABLE_CONFIRM_THRESHOLD
          ? found
          : prev,
      );
    } catch {
      // Sin datos de red: no asumimos disponible ni no-disponible.
    }
  }, [branchId]);

  useEffect(() => {
    consecutiveUnavailable.current = 0;
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
