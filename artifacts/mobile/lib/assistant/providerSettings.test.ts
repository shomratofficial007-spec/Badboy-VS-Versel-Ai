import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createProviderKeyStore } from './providerSettingsCore';

let secureStoreAvailable = true;
const secureValues = new Map<string, string>();
const keyStore = createProviderKeyStore({
  isAvailableAsync: async () => secureStoreAvailable,
  setItemAsync: async (key, value) => { if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error('Invalid key provided to SecureStore.'); secureValues.set(key, value); },
  getItemAsync: async (key) => secureValues.get(key) ?? null,
  deleteItemAsync: async (key) => { secureValues.delete(key); },
});

let ownerToken: string | null = 'owner-token-test';
let providerResponse: Response = new Response(JSON.stringify({
  data: [{ id: 'model-z' }, { id: 'model-a' }, { id: 'model-a' }, { id: 'bad model' }, { id: 42 }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
let providerRequest: { url: string; init?: RequestInit } | null = null;

mock.module('expo-secure-store', {
  namedExports: {
    isAvailableAsync: async () => secureStoreAvailable,
    setItemAsync: async (key: string, value: string) => { secureValues.set(key, value); },
    getItemAsync: async (key: string) => secureValues.get(key) ?? null,
    deleteItemAsync: async (key: string) => { secureValues.delete(key); },
  },
});
mock.module('expo/fetch', {
  namedExports: {
    fetch: async (input: string | URL, init?: RequestInit) => {
      providerRequest = { url: String(input), init };
      return providerResponse;
    },
  },
});
mock.module('./ownerJsonRequest', {
  namedExports: { apiUrl: (path: string) => 'https://worker.example/api' + path },
});
mock.module('./ownerAuth', {
  namedExports: { getOwnerToken: async () => ownerToken },
});

const providerSettingsPromise = import('./providerSettings');

test('stores provider API keys only through the secure storage adapter', async () => {
  secureStoreAvailable = true;
  await keyStore.save('openai', '  secret-provider-key  ');
  assert.ok([...secureValues.keys()].every((key) => /^[A-Za-z0-9._-]+$/.test(key)), 'SecureStore keys must use only supported characters');
  assert.equal(await keyStore.get('openai'), 'secret-provider-key');
  await keyStore.delete('openai');
  assert.equal(await keyStore.get('openai'), null);
});

test('rejects empty, oversized and multiline provider keys', async () => {
  await assert.rejects(() => keyStore.save('openai', '  '));
  await assert.rejects(() => keyStore.save('openai', 'key\nwith-line-break'));
  await assert.rejects(() => keyStore.save('openai', 'x'.repeat(4097)));
});

test('refuses provider key writes and deletes when secure storage is unavailable', async () => {
  secureStoreAvailable = false;
  await assert.rejects(() => keyStore.save('openai', 'secret'));
  assert.equal(await keyStore.get('openai'), null);
  await assert.rejects(() => keyStore.delete('openai'));
  secureStoreAvailable = true;
});

test('fetchProviderModels sends owner auth and the selected provider key through the Worker', async () => {
  const { fetchProviderModels } = await providerSettingsPromise;
  ownerToken = 'owner-token-test';
  providerRequest = null;
  providerResponse = new Response(JSON.stringify({
    data: [{ id: 'model-z' }, { id: 'model-a' }, { id: 'model-a' }, { id: 'bad model' }, { id: 42 }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const models = await fetchProviderModels('https://api.openai.com/v1', ' provider-key ', 'openai');
  assert.deepEqual(models, ['model-a', 'model-z']);
  assert.equal(providerRequest?.url, 'https://worker.example/api/assistant/provider-models');
  const headers = new Headers(providerRequest?.init?.headers);
  assert.equal(headers.get('Authorization'), 'Bearer owner-token-test');
  assert.equal(headers.get('X-Provider-Key'), 'provider-key');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(providerRequest?.init?.body)), {
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  });
});

test('fetchProviderModels rejects empty keys and missing owner sessions before network access', async () => {
  const { fetchProviderModels } = await providerSettingsPromise;
  providerRequest = null;
  await assert.rejects(fetchProviderModels('https://api.openai.com/v1', '  ', 'openai'), /API Key/);
  ownerToken = null;
  await assert.rejects(fetchProviderModels('https://api.openai.com/v1', 'provider-key', 'openai'), /Owner login is required/);
  assert.equal(providerRequest, null);
});

test('fetchProviderModels reports Worker errors and rejects invalid model payloads', async () => {
  const { fetchProviderModels } = await providerSettingsPromise;
  ownerToken = 'owner-token-test';
  providerResponse = new Response(JSON.stringify({ error: 'Provider unavailable' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(fetchProviderModels('https://api.openai.com/v1', 'provider-key', 'openai'), /Provider unavailable/);

  providerResponse = new Response(JSON.stringify({ models: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(fetchProviderModels('https://api.openai.com/v1', 'provider-key', 'openai'), /OpenAI-compatible \/models response/);
});

test('Local OmniRoute API keys stay in SecureStore and are rejected when storage is unavailable', async () => {
  const { saveLocalOmniRouteApiKey, getLocalOmniRouteApiKey, deleteLocalOmniRouteApiKey } = await providerSettingsPromise;
  secureStoreAvailable = true;
  secureValues.clear();
  await saveLocalOmniRouteApiKey('  local-router-secret  ');
  assert.equal(secureValues.get('badboy-ai-local-omniroute-key-v1'), 'local-router-secret');
  assert.equal(await getLocalOmniRouteApiKey(), 'local-router-secret');
  await assert.rejects(() => saveLocalOmniRouteApiKey('local\nkey'));
  secureStoreAvailable = false;
  assert.equal(await getLocalOmniRouteApiKey(), null);
  await assert.rejects(() => saveLocalOmniRouteApiKey('local-router-secret'));
  await assert.rejects(() => deleteLocalOmniRouteApiKey());
  secureStoreAvailable = true;
  await deleteLocalOmniRouteApiKey();
  assert.equal(await getLocalOmniRouteApiKey(), null);
});

test('provider API key helpers persist and remove keys through SecureStore', async () => {
  const { saveProviderApiKey, getProviderApiKey, deleteProviderApiKey } = await providerSettingsPromise;
  secureStoreAvailable = true;
  secureValues.clear();
  await saveProviderApiKey('openai', '  persisted-provider-key  ');
  assert.equal(await getProviderApiKey('openai'), 'persisted-provider-key');
  await deleteProviderApiKey('openai');
  assert.equal(await getProviderApiKey('openai'), null);
});


test('provider presets include the additional OpenAI-compatible providers from PR #113', async () => {
  const { AI_PROVIDER_PRESETS } = await providerSettingsPromise;
  const ids = AI_PROVIDER_PRESETS.map((provider) => provider.id);
  for (const id of ['cerebras', 'sambanova', 'mistral', 'cloudflare', 'cohere', 'nvidia'] as const) {
    assert.ok(ids.includes(id), 'missing provider preset: ' + id);
  }
  assert.equal(AI_PROVIDER_PRESETS.find((provider) => provider.id === 'cloudflare')?.baseUrl, '');
});
