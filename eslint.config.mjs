import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import spacingTokenRule from "./eslint-rules/spacing-token.mjs";
import colorTokenRule from "./eslint-rules/color-token.mjs";
import formWrapperRule from "./eslint-rules/form-wrapper.mjs";

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
    "coverage/**",
    "src/generated/**",
  ]),
  // Design system enforcement rules
  {
    plugins: {
      "design-system": {
        rules: {
          "spacing-token": spacingTokenRule,
          "color-token": colorTokenRule,
          "form-wrapper": formWrapperRule,
        },
      },
    },
    rules: {
      "design-system/spacing-token": "error",
      "design-system/color-token": "error",
      "design-system/form-wrapper": "error",
    },
  },
]);

export default eslintConfig;
