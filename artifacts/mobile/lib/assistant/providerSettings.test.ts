import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let secureStoreAvailable = true;
const secureValues = new Map<string, string>();

mock.module('expo-secure-store', {
  namedExports: {
    isAvailableAsync: async () => secureStoreAvailable,
    setItemAsync: async (key: string, value: string) => { secureValues.set(key, value); },
    getItemAsync: async (key: string) => secureValues.get(key) ?? null,
    deleteItemAsync: async (key: string) => { secureValues.delete(key); },
  },
});

test('provider presets cover major OpenAI-compatible endpoints', async () => {
  const { AI_PROVIDER_PRESETS } = await import('./providerSettings');
  assert.deepEqual(AI_PROVIDER_PRESETS.map((item) => item.id), [
    'openai', 'openrouter', 'gemini', 'groq', 'together', 'custom',
  ]);
});

test('normalizes HTTPS proxy URLs and removes trailing slashes', async () => {
  const { normalizeProviderBaseUrl } = await import('./providerSettings');
  assert.equal(normalizeProviderBaseUrl('https://proxy.example/v1///'), 'https://proxy.example/v1');
});

test('rejects insecure remote URLs, embedded credentials, query strings, fragments and empty values', async () => {
  const { normalizeProviderBaseUrl } = await import('./providerSettings');
  for (const value of [
    '',
    'http://proxy.example/v1',
    'https://user:pass@proxy.example/v1',
    'https://proxy.example/v1?key=secret',
    'https://proxy.example/v1#fragment',
    'not-a-url',
  ]) {
    assert.throws(() => normalizeProviderBaseUrl(value));
  }
});

test('allows HTTP only for local development proxy endpoints', async () => {
  const { normalizeProviderBaseUrl } = await import('./providerSettings');
  assert.equal(normalizeProviderBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1');
});

test('saves, reloads and deletes provider keys through secure storage', async () => {
  const { saveProviderApiKey, getProviderApiKey, deleteProviderApiKey } = await import('./providerSettings');
  secureStoreAvailable = true;
  await saveProviderApiKey('openai', '  secret-provider-key  ');
  assert.equal(await getProviderApiKey('openai'), 'secret-provider-key');
  await deleteProviderApiKey('openai');
  assert.equal(await getProviderApiKey('openai'), null);
});

test('rejects empty, oversized and multiline keys', async () => {
  const { saveProviderApiKey } = await import('./providerSettings');
  await assert.rejects(() => saveProviderApiKey('openai', '  '));
  await assert.rejects(() => saveProviderApiKey('openai', 'key\nwith-line-break'));
  await assert.rejects(() => saveProviderApiKey('openai', 'x'.repeat(4097)));
});

test('refuses key writes and deletes when secure storage is unavailable', async () => {
  const { saveProviderApiKey, getProviderApiKey, deleteProviderApiKey } = await import('./providerSettings');
  secureStoreAvailable = false;
  await assert.rejects(() => saveProviderApiKey('openai', 'secret'));
  assert.equal(await getProviderApiKey('openai'), null);
  await assert.rejects(() => deleteProviderApiKey('openai'));
  secureStoreAvailable = true;
});

test('fetches, filters, deduplicates and sorts OpenAI-compatible model IDs', async () => {
  const { fetchProviderModels } = await import('./providerSettings');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }, { id: 42 }, { id: 'bad id' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    assert.deepEqual(await fetchProviderModels('https://proxy.example/v1', 'test-key'), ['a-model', 'z-model']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects model discovery for missing keys, HTTP failures and non-compatible payloads', async () => {
  const { fetchProviderModels } = await import('./providerSettings');
  await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', '  '));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', 'bad-key'));
    globalThis.fetch = (async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
    await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', 'valid-key'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
