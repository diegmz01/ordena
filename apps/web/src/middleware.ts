import { NextResponse } from "next/server";

/**
 * Cabeceras de hardening en todas las respuestas HTML. No reemplaza al gate
 * de auth (apps/web no tiene uno; el checkout de invitado es intencional) —
 * solo agrega CSP/anti-clickjacking, que faltaban por completo.
 *
 * Sin nonce a propósito: Next.js solo propaga un nonce de CSP a sus propios
 * scripts (hidratación RSC, next-themes) en páginas con renderizado
 * dinámico — de usarlo, cada página estática del sitio (home, menú, faq...)
 * pasaría a renderizarse en cada request. En vez de forzar eso, se allowlistea
 * explícitamente cada origen de script conocido (Stripe, Turnstile) y se deja
 * 'unsafe-inline' para el bootstrap propio de Next. No detiene XSS por script
 * inline, pero sí bloquea que un HTML/atributo inyectado cargue un <script
 * src> de un dominio ajeno — el vector más común en la práctica — y las
 * directivas frame-src/connect-src/frame-ancestors de abajo no dependen del
 * nonce en absoluto.
 */
export function middleware() {
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://elbajito.com https://*.elbajito.com`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.stripe.com https://js.stripe.com https://m.stripe.com https://errors.stripe.com https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io`,
    `frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.stripe.com https://challenges.cloudflare.com`,
    `frame-ancestors 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  // Respaldo para navegadores sin soporte de frame-ancestors (CSP2+).
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    // Todo menos assets estáticos y el service worker: un Service Worker
    // hereda la CSP de la respuesta de su propio script, y esta política
    // (pensada para documentos HTML) no le corresponde.
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|images/|logos/|sw\\.js|push-dev-sw\\.js|manifest\\.webmanifest).*)",
  ],
};
