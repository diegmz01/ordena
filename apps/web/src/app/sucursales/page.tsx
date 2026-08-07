"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  LocateFixed,
  MapPin,
  Navigation,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useCart, writeUnavailableAlert } from "@/lib/cart";
import {
  formatDistanceKm,
  haversineKm,
  requestUserPositionDetailed,
  type GeoPosition,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

type Branch = {
  id: string;
  name: string;
  address: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  acceptingOrders: boolean;
};

type BranchWithDistance = Branch & { distanceKm: number | null };

type GeoStatus = "idle" | "loading" | "ready" | "denied" | "unavailable";

function BranchSkeleton() {
  return (
    <div className="branch-row">
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="skeleton size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-5 w-1/3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
      <div className="skeleton h-10 w-full rounded-lg sm:w-32" />
    </div>
  );
}

function BranchesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromCart = searchParams.get("from") === "carrito";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [userPos, setUserPos] = useState<GeoPosition | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [stockNotice, setStockNotice] = useState<string[] | null>(null);
  const { branchId, items, setBranch, pruneUnavailableProducts } = useCart();
  const autoSelectedRef = useRef(false);
  const branchIdRef = useRef(branchId);
  useEffect(() => {
    branchIdRef.current = branchId;
  });

  const applyGeoResult = useCallback(
    (result: Awaited<ReturnType<typeof requestUserPositionDetailed>>) => {
      if (result.status === "ready") {
        setUserPos(result.position);
        setGeoStatus("ready");
        return;
      }
      setUserPos(null);
      setGeoStatus(result.status);
    },
    [],
  );

  const locate = useCallback(async () => {
    setGeoStatus("loading");
    const result = await requestUserPositionDetailed();
    applyGeoResult(result);
  }, [applyGeoResult]);

  const refreshBranches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: Branch[] }>("/branches?all=1");
      setBranches(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de sucursales al montar
    void refreshBranches();
  }, [refreshBranches]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- geolocalización del usuario al montar
    void locate();
  }, [locate]);

  const ranked: BranchWithDistance[] = useMemo(() => {
    const withDistance = branches.map((branch) => {
      let distanceKm: number | null = null;
      if (userPos && branch.latitude != null && branch.longitude != null) {
        distanceKm = haversineKm(
          userPos.lat,
          userPos.lng,
          branch.latitude,
          branch.longitude,
        );
      }
      return { ...branch, distanceKm };
    });

    return withDistance.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) {
        return a.name.localeCompare(b.name);
      }
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [branches, userPos]);

  const nearestId = useMemo(() => {
    const nearest = ranked.find(
      (b) => b.distanceKm != null && b.acceptingOrders,
    );
    return nearest?.id ?? null;
  }, [ranked]);

  useEffect(() => {
    if (fromCart) return;
    if (geoStatus !== "ready" || !nearestId || autoSelectedRef.current) return;
    if (branchIdRef.current) {
      autoSelectedRef.current = true;
      return;
    }
    const nearest = ranked.find((b) => b.id === nearestId);
    if (!nearest) return;
    setBranch(nearest.id, nearest.name);
    autoSelectedRef.current = true;
  }, [fromCart, geoStatus, nearestId, ranked, setBranch]);

  async function choose(branch: Branch) {
    setSwitchingId(branch.id);
    setStockNotice(null);
    setError(null);
    try {
      if (branchId !== branch.id && items.length > 0) {
        const menu = await apiFetch<{
          data: { id: string; name: string; inStock?: boolean }[];
        }>(`/menu?branchId=${branch.id}`);
        const availableIds = new Set(
          menu.data.filter((p) => p.inStock !== false).map((p) => p.id),
        );
        setBranch(branch.id, branch.name);
        const removed = pruneUnavailableProducts(availableIds);
        if (removed.length > 0) {
          writeUnavailableAlert(removed);
          setStockNotice(removed);
        }
      } else {
        setBranch(branch.id, branch.name);
      }

      if (fromCart) {
        router.push("/carrito");
      } else {
        router.push(`/menu?branch=${branch.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cambiar de sucursal",
      );
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <div className="pb-28">
      <div className="border-b border-orange-100 bg-gradient-to-b from-orange-50 to-transparent dark:border-orange-950/40 dark:from-orange-950/30">
        <div className="container-page !pb-6 !pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Paso 1
          </p>
          <h1 className="page-title mt-1">¿Dónde recoges?</h1>
          <p className="page-description">
            {fromCart
              ? "Elige otra sucursal. Quitaremos del carrito lo que no se venda o esté agotado ahí."
              : "Elige la sucursal y arma tu pedido para pickup."}
          </p>
        </div>
      </div>

      <div className="container-page !pt-6">
        {error && <p className="admin-alert-error mb-4">{error}</p>}

        {stockNotice && stockNotice.length > 0 && (
          <div className="mb-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">
                Productos no disponibles en esta sucursal
              </p>
              <p className="mt-1 text-xs opacity-90">
                Se quitaron del carrito (no se venden aquí o sin stock):{" "}
                {stockNotice.join(", ")}.
              </p>
            </div>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {geoStatus === "loading" && (
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200">
              <LocateFixed className="h-3.5 w-3.5 animate-pulse" />
              Buscando tu ubicación…
            </p>
          )}
          {geoStatus === "ready" && (
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              <Navigation className="h-3.5 w-3.5" />
              Ordenadas por cercanía
            </p>
          )}
          {(geoStatus === "denied" || geoStatus === "unavailable") && (
            <>
              <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <MapPin className="h-3.5 w-3.5" />
                {geoStatus === "denied"
                  ? "Ubicación no permitida"
                  : "No pudimos obtener tu ubicación"}
              </p>
              <button
                type="button"
                onClick={() => void locate()}
                className="btn-secondary btn-compact"
              >
                <LocateFixed className="h-3.5 w-3.5" />
                Usar mi ubicación
              </button>
            </>
          )}
          {geoStatus === "ready" && (
            <button
              type="button"
              onClick={() => {
                void locate();
                void refreshBranches();
              }}
              className="btn-secondary btn-compact"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              Actualizar
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            <BranchSkeleton />
            <BranchSkeleton />
          </div>
        ) : (
          <ul className="space-y-3">
            {ranked.map((branch) => {
              const selected = branchId === branch.id;
              const unavailable = !branch.acceptingOrders;
              const isNearest =
                nearestId === branch.id && branch.distanceKm != null;
              const busy = switchingId === branch.id;

              return (
                <li key={branch.id}>
                  <article
                    className={cn(
                      "branch-row",
                      selected && "branch-row-selected",
                      unavailable && "opacity-60 grayscale",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-xl",
                          unavailable
                            ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                            : selected
                              ? "bg-orange-500 text-white"
                              : "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
                        )}
                      >
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            {branch.name}
                          </h2>
                          {unavailable && (
                            <span className="status-badge-inactive">
                              No disponible
                            </span>
                          )}
                          {!unavailable && selected && (
                            <span className="status-badge-active">Elegida</span>
                          )}
                          {!unavailable && isNearest && (
                            <span className="status-badge-brand">
                              Más cercana
                            </span>
                          )}
                          {branch.distanceKm != null && (
                            <span className="text-xs font-medium tabular-nums text-gray-500">
                              {formatDistanceKm(branch.distanceKm)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
                          {branch.address}
                        </p>
                      </div>
                    </div>
                    {!unavailable && (
                      <button
                        type="button"
                        disabled={!!switchingId}
                        className="btn-primary w-full shrink-0 sm:w-auto sm:min-w-[8.5rem]"
                        onClick={() => void choose(branch)}
                      >
                        {busy
                          ? "Validando…"
                          : fromCart
                            ? "Elegir"
                            : "Ver menú"}
                        {!busy && (
                          <ChevronRight className="h-4 w-4 opacity-80" />
                        )}
                      </button>
                    )}
                  </article>
                </li>
              );
            })}
            {!error && ranked.length === 0 && (
              <li className="customer-empty">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  No hay sucursales disponibles
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Vuelve más tarde o prueba en otro momento.
                </p>
                {fromCart && (
                  <Link
                    href="/carrito"
                    className="btn-secondary mt-4 inline-flex"
                  >
                    Volver al carrito
                  </Link>
                )}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function BranchesPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10 text-sm text-gray-500">
          Cargando sucursales…
        </div>
      }
    >
      <BranchesPageInner />
    </Suspense>
  );
}
