import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('expo-secure-store', {
  namedExports: {
    isAvailableAsync: async () => true,
    setItemAsync: async () => {},
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
  },
});

const { normalizeProviderBaseUrl, AI_PROVIDER_PRESETS } = await import('./providerSettings');

test('provider presets cover major OpenAI-compatible endpoints', () => {
  assert.deepEqual(AI_PROVIDER_PRESETS.map((item) => item.id), [
    'openai', 'openrouter', 'gemini', 'groq', 'together', 'custom',
  ]);
});

test('normalizes HTTPS proxy URLs and removes trailing slashes', () => {
  assert.equal(normalizeProviderBaseUrl('https://proxy.example/v1///'), 'https://proxy.example/v1');
});

test('rejects insecure remote URLs, embedded credentials, query strings and fragments', () => {
  for (const value of [
    'http://proxy.example/v1',
    'https://user:pass@proxy.example/v1',
    'https://proxy.example/v1?key=secret',
    'https://proxy.example/v1#fragment',
    'not-a-url',
  ]) {
    assert.throws(() => normalizeProviderBaseUrl(value));
  }
});

test('allows HTTP only for local development proxy endpoints', () => {
  assert.equal(normalizeProviderBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1');
});
