const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * Verifica un token de Cloudflare Turnstile contra siteverify. El token es
 * de un solo uso: Cloudflare lo invalida apenas se verifica una vez.
 */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp?: string,
): Promise<{ success: boolean; errorCodes?: string[] }> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      return { success: false };
    }

    const data = (await response.json()) as SiteverifyResponse;
    return { success: !!data.success, errorCodes: data["error-codes"] };
  } catch (error) {
    console.error("[turnstile] Error al verificar token:", error);
    return { success: false };
  }
}
