import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const readonly = [readonly];
const nativeGlobals = Object.fromEntries(
  [
    'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'console', 'exports',
    'fetch', 'global', 'module', 'process', 'require', 'setImmediate',
    'setInterval', 'setTimeout', 'URL', 'URLSearchParams', 'Request',
    'Response', 'Headers', 'crypto', 'window', 'document', 'navigator',
    'location', 'localStorage', 'sessionStorage', 'alert', 'confirm',
    'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'Element',
    'MutationObserver', 'IntersectionObserver',
  ].map((name) => [name, 'readonly'])
);

export default tseslint.config(
  {
    ignores: [
      '**/.expo/**',
      '**/dist/**',
      '**/build/**',
      '**/web-build/**',
      '**/.tamagui/**',
      '**/cache/**',
      '**/.next/**',
      '**/.turbo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: { globals: nativeGlobals },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unsafe-alias': 'warn',
    },
  },
  {
    files: [
      '**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx',
      '**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx',
      '**/tests/**/*', '**/__tests__/**/*',
    ],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/mobile/src/lib/assistant/voice.ts', '**/artifacts/mobile/src/lib/assistant/voice.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  }
);
