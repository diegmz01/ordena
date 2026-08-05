import {
  AUTH_PRESENCE_COOKIE,
  type LoginResponse,
  type Role,
} from "@ordena/shared";
import { API_URL } from "@/lib/api";

const MAX_AGE = 60 * 60 * 24 * 7;

function setPresenceCookie() {
  document.cookie = `${AUTH_PRESENCE_COOKIE}=1; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

export function clearAuthCookie() {
  document.cookie = `${AUTH_PRESENCE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${AUTH_PRESENCE_COOKIE}=`));
  return match?.endsWith("=1") ? "session" : null;
}

export async function login(
  email: string,
  password: string,
  expectedRole?: Role,
): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ordena-Client": "branch",
    },
    credentials: "include",
    body: JSON.stringify({ email, password, expectedRole }),
  });
  const data = await response.json().catch(() => ({ error: "Error de login" }));
  if (!response.ok) throw new Error(data.error ?? "Error de login");
  setPresenceCookie();
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ordena-Client": "branch",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ error: "Error de registro" }));
  if (!response.ok) throw new Error(data.error ?? "Error de registro");
  setPresenceCookie();
  return data;
}

export async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "X-Ordena-Client": "branch" },
      credentials: "include",
    });
  } catch {
    // ignore
  }
  clearAuthCookie();
}

export async function getAccessToken(): Promise<string> {
  const token = getAuthToken();
  if (!token) throw new Error("Sesión no válida");
  return token;
}

export function setAuthCookie() {
  setPresenceCookie();
}
