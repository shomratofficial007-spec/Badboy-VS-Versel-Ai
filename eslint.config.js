import js from "@eslint/js";
import tseslint from "typescript-eslint";

const readonly = "readonly";
const runtimeGlobals = Object.fromEntries(
  [
    "__dirname", "__filename", "Buffer", "clearImmediate", "clearInterval",
    "clearTimeout", "console", "exports", "global", "module", "process",
    "require", "setImmediate", "setInterval", "setTimeout", "window",
    "document", "navigator", "location", "localStorage", "sessionStorage",
    "alert", "confirm", "requestAnimationFrame", "cancelAnimationFrame",
    "HTMLElement", "Element", "MutationObserver", "IntersectionObserver",
  ].map((name) => [name, readonly]),
);

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.expo/**",
      "**/.wrangler/**",
      "**/android/**",
      "**/ios/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: { globals: runtimeGlobals },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // TypeScript's compiler owns identifier/type resolution for TS files.
      "no-undef": "off",
      // Report pre-existing explicit-any debt while keeping new lint errors actionable.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" },
      ],
      "@typescript-eslint/no-this-alias": "warn",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      // Existing Expo/Metro tooling intentionally uses CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
