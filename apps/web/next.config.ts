import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  // Auth cookies: proxy via app/api-backend/[...path]/route.ts (not rewrites).
};

// Sentry: captura de errores vía src/instrumentation(-client).ts, opcional
// (sin NEXT_PUBLIC_SENTRY_DSN no hace nada). Subida de source maps fuera de
// alcance por ahora (requeriría SENTRY_AUTH_TOKEN + org/project).
export default withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
