const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/**
 * Proxy same-origin `/api-backend/*` → API, reescribiendo Set-Cookie
 * al host de la app Next (evita Domain de la API y problemas de rewrite en Vercel).
 */
export async function proxyApiBackend(
  request: Request,
  pathParts: string[],
  apiBaseUrl: string,
): Promise<Response> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const subpath = pathParts.map(encodeURIComponent).join("/");
  const incoming = new URL(request.url);
  const target = `${base}/${subpath}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    outHeaders.append(key, value);
  });

  const rawCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];

  for (const cookie of rawCookies) {
    outHeaders.append(
      "set-cookie",
      cookie.replace(/;\s*Domain=[^;]*/gi, ""),
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
