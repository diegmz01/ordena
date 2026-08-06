import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker generado por Serwist en build (ver .gitignore); no es código fuente.
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    // Copias duplicadas accidentales del build (ver commit 8832484): un
    // build/proceso concurrente puede dejar "sw 2.js", "sw 3.js", etc. sin
    // trackear en public/. No son código fuente tampoco.
    "public/sw *.js",
  ]),
]);

export default eslintConfig;
