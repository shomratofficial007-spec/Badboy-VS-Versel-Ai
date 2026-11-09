import js from "@eslint/js";
import tseslint from "typescript-eslint";

const readonly = "readonly";
const nodeGlobals = Object.fromEntries(
  [
    "__dirname",
    "__filename",
    "Buffer",
    "clearImmediate",
    "clearInterval",
    "clearTimeout",
    "console",
    "exports",
    "global",
    "module",
    "process",
    "require",
    "setImmediate",
    "setInterval",
    "setTimeout",
  ].map((name) => [name, readonly]),
);

const testFiles = [
  "**/*.test.{js,jsx,ts,tsx,mjs,mts,cjs,cts}",
  "**/*.spec.{js,jsx,ts,tsx,mjs,mts,cjs,cts}",
  "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}",
];

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
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      // The repository contains existing CommonJS Expo/Metro configuration files.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // TypeScript's compiler owns identifier/type resolution for TS files.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" },
      ],
    },
  },
  {
    files: testFiles,
    rules: {
      // Surface legacy test-fixture debt without masking production-source errors.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
