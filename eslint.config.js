import js from "@eslint/js";
import tseslint from "typescript-eslint";

const readonly = "readonly";
const runtimeGlobals = Object.fromEntries(
  [
    "__dirname", "__filename", "AbortController", "AbortSignal", "Buffer",
    "clearImmediate", "clearInterval", "clearTimeout", "console", "exports",
    "fetch", "global", "module", "process", "require", "setImmediate",
    "setInterval", "setTimeout", "URL", "URLSearchParams", "Request",
    "Response", "Headers", "crypto", "window", "document", "navigator",
    "location", "localStorage", "sessionStorage", "alert", "confirm",
    "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement", "Element",
    "MutationObserver", "IntersectionObserver",
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
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: { globals: runtimeGlobals },
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" },
      ],
      "@typescript-eslint/no-this-alias": "warn",
    },
  },
  {
    files: [
      "**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.jsx",
      "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx",
      "**/__tests__/**/*.ts", "**/__tests__/**/*.tsx",
      "**/__tests__/**/*.js", "**/__tests__/**/*.jsx",
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "artifacts/mobile/lib/assistant/voice.ts", "artifacts/mobile/lib/assistant/wakeWord.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
