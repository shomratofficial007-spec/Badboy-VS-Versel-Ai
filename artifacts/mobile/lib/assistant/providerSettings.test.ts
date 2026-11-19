import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderKeyStore, fetchProviderModels, normalizeProviderBaseUrl } from './providerSettingsCore';

let secureStoreAvailable = true;
const secureValues = new Map<string, string>();
const keyStore = createProviderKeyStore({
  isAvailableAsync: async () => secureStoreAvailable,
  setItemAsync: async (key, value) => { secureValues.set(key, value); },
  getItemAsync: async (key) => secureValues.get(key) ?? null,
  deleteItemAsync: async (key) => { secureValues.delete(key); },
});

test('normalizes HTTPS proxy URLs and removes trailing slashes', () => { assert.equal(normalizeProviderBaseUrl('https://proxy.example/v1///'), 'https://proxy.example/v1'); });
test('rejects insecure remote URLs, embedded credentials, query strings, fragments and empty values', () => {
  for (const value of ['', 'http://proxy.example/v1', 'https://user:pass@proxy.example/v1', 'https://proxy.example/v1?key=secret', 'https://proxy.example/v1#fragment', 'not-a-url']) assert.throws(() => normalizeProviderBaseUrl(value));
});
test('allows HTTP only for local development proxy endpoints', () => { assert.equal(normalizeProviderBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1'); });
test('saves, reloads and deletes provider keys through the secure storage adapter', async () => {
  secureStoreAvailable = true; await keyStore.save('openai', '  secret-provider-key  ');
  assert.equal(await keyStore.get('openai'), 'secret-provider-key'); await keyStore.delete('openai'); assert.equal(await keyStore.get('openai'), null);
});
test('rejects empty, oversized and multiline keys', async () => {
  await assert.rejects(() => keyStore.save('openai', '  ')); await assert.rejects(() => keyStore.save('openai', 'key\nwith-line-break')); await assert.rejects(() => keyStore.save('openai', 'x'.repeat(4097)));
});
test('refuses key writes and deletes when secure storage is unavailable', async () => {
  secureStoreAvailable = false; await assert.rejects(() => keyStore.save('openai', 'secret')); assert.equal(await keyStore.get('openai'), null); await assert.rejects(() => keyStore.delete('openai')); secureStoreAvailable = true;
});
test('fetches, filters, deduplicates and sorts OpenAI-compatible model IDs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }, { id: 42 }, { id: 'bad id' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try { assert.deepEqual(await fetchProviderModels('https://proxy.example/v1', 'test-key'), ['a-model', 'z-model']); } finally { globalThis.fetch = originalFetch; }
});
test('rejects model discovery for missing keys, HTTP failures and non-compatible payloads', async () => {
  await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', '  '));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch; await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', 'bad-key'));
    globalThis.fetch = (async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch; await assert.rejects(() => fetchProviderModels('https://proxy.example/v1', 'valid-key'));
  } finally { globalThis.fetch = originalFetch; }
});
