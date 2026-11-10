import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const nativeGlobals = Object.fromEntries(
  [
    '__dirname', '__filename', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'exports',
    'fetch', 'global', 'module', 'process', 'require', 'setImmediate',
    'URL', 'URLSearchParams', 'Request', 'Response', 'Headers', 'crypto',
    'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
    'alert', 'confirm', 'requestAnimationFrame', 'cancelAnimationFrame',
    'HTMLElement', 'Element', 'MutationObserver', 'IntersectionObserver',
    'AbortSignal', 'AbortController',
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
    rules: { 
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      '**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx',
      '**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx',
      '**/tests/**/*', '**/__tests__/**/*',
    ],
    rules: { 
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  {
    files: [
      '**/artifacts/mobile/lib/assistant/**/*.ts', 
      '**/mobile/src/lib/assistant/**/*.ts',
      '**/artifacts/mobile/scripts/**/*.js',
      '**/artifacts/mobile/server/**/*.js',
      '**/artifacts/mobile/plugins/**/*.js',
      '**/artifacts/mobile/metro.config.js'
    ],
    rules: { 
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-undef': 'off',
    },
  }
);
