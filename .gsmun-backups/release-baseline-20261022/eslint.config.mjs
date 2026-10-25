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
    "dist/**",
    ".agents/**",
    ".local/admin-browser-test/**",
    ".local/offline-next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/assets/stripe-press/source/**",
  ]),
]);

export default eslintConfig;
