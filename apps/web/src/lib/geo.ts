export type GeoPosition = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Distancia en km entre dos puntos (Haversine). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.max(0.1, Math.round(km * 10) / 10)} km`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Solicita la posición del usuario. Devuelve null si no hay soporte,
 * permiso denegado, timeout o error.
 */
export function requestUserPosition(options?: {
  timeoutMs?: number;
  maximumAgeMs?: number;
}): Promise<GeoPosition | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const maximumAgeMs = options?.maximumAgeMs ?? 60_000;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
      },
    );
  });
}

export type GeoRequestResult =
  | { status: "ready"; position: GeoPosition }
  | { status: "denied" }
  | { status: "unavailable" };

/** Igual que requestUserPosition pero distingue denegado vs no disponible. */
export function requestUserPositionDetailed(options?: {
  timeoutMs?: number;
  maximumAgeMs?: number;
}): Promise<GeoRequestResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "unavailable" });
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const maximumAgeMs = options?.maximumAgeMs ?? 60_000;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          status: "ready",
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ status: "denied" });
          return;
        }
        resolve({ status: "unavailable" });
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
      },
    );
  });
}
