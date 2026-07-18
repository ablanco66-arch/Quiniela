import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app intentionally synchronizes remote/prop state into editable forms.
      "react-hooks/set-state-in-effect": "off",
      // Local branded assets are served directly by the Cloudflare Worker.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".site-stage-*/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
