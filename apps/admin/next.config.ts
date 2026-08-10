import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Auth cookies: proxy via app/api-backend/[...path]/route.ts (not rewrites).
};

// Sentry: captura de errores vía src/instrumentation(-client).ts, opcional
// (sin NEXT_PUBLIC_SENTRY_DSN no hace nada). Subida de source maps fuera de
// alcance por ahora (requeriría SENTRY_AUTH_TOKEN + org/project).
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
