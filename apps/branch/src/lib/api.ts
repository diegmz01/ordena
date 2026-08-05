const DIRECT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const API_URL =
  typeof window !== "undefined" ? "/api-backend" : DIRECT_API_URL;

export type OrdenaClient = "customer" | "admin" | "branch";

export async function apiFetch<T>(
  path: string,
  token?: string | null,
  init?: RequestInit,
  client: OrdenaClient = "branch",
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Ordena-Client", client);
  if (token && token !== "session") {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `Error ${response.status}`,
    );
  }
  return data as T;
}

export { DIRECT_API_URL };
