import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const store = new Map<string, string>();
mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { store.set(key, value); },
    deleteItemAsync: async (key: string) => { store.delete(key); },
  },
});

const managerPromise = import('./providerManager');

test('provider catalog has unique ids and resolves providers', async () => {
  const { PROVIDERS, getProvider } = await managerPromise;
  const ids = PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('gemini') && ids.includes('omniroute') && ids.includes('custom'));
  assert.equal(getProvider('groq')?.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(getProvider('gemini')?.compatible, 'gemini');
});

test('provider keys are trimmed, listed as connected and removed together with their settings', async () => {
  const { getConnectedProviderIds, getProviderKey, removeProviderKey, saveProviderBaseUrl, saveProviderKey, getProviderBaseUrl } = await managerPromise;
  store.clear();
  await assert.rejects(() => saveProviderKey('groq', '   '));
  await saveProviderKey('groq', '  groq-secret  ');
  assert.equal(await getProviderKey('groq'), 'groq-secret');
  assert.deepEqual(await getConnectedProviderIds(), ['groq']);

  await saveProviderKey('custom', 'custom-secret');
  await saveProviderBaseUrl('custom', 'https://llm.example.com/v1/');
  assert.equal(await getProviderBaseUrl('custom'), 'https://llm.example.com/v1');
  await removeProviderKey('custom');
  assert.equal(await getProviderKey('custom'), null);
  assert.equal(await getProviderBaseUrl('custom'), '');
  assert.deepEqual(await getConnectedProviderIds(), ['groq']);
});

test('base URLs require HTTPS except OmniRoute loopback', async () => {
  const { getProviderBaseUrl, saveProviderBaseUrl } = await managerPromise;
  store.clear();
  assert.equal(await getProviderBaseUrl('omniroute'), 'http://127.0.0.1:20128/v1');
  await saveProviderBaseUrl('omniroute', 'http://127.0.0.1:20128/v1/');
  assert.equal(await getProviderBaseUrl('omniroute'), 'http://127.0.0.1:20128/v1');
  await saveProviderBaseUrl('omniroute', 'http://localhost:8080/v1');
  await assert.rejects(() => saveProviderBaseUrl('omniroute', 'http://192.168.1.5:20128/v1'));
  await assert.rejects(() => saveProviderBaseUrl('custom', 'http://127.0.0.1:11434/v1'));
  await assert.rejects(() => saveProviderBaseUrl('custom', 'http://example.com/v1'));
  await assert.rejects(() => saveProviderBaseUrl('custom', 'ftp://example.com/v1'));
  await saveProviderBaseUrl('custom', 'https://example.com/v1');
  assert.equal(await getProviderBaseUrl('custom'), 'https://example.com/v1');
});

test('Cloudflare Account ID must be a 32-character hex ID', async () => {
  const { getCloudflareAccountId, saveCloudflareAccountId } = await managerPromise;
  store.clear();
  await assert.rejects(() => saveCloudflareAccountId('not-an-account-id'));
  assert.equal(await getCloudflareAccountId(), null);
  await saveCloudflareAccountId(` ${'a1'.repeat(16)} `);
  assert.equal(await getCloudflareAccountId(), 'a1'.repeat(16));
});

test('default, custom and discovered models persist and tolerate corrupted storage', async () => {
  const {
    getAllDiscoveredModels, getCustomModels, getDefaultModel,
    saveCustomModels, saveDefaultModel, saveDiscoveredModels,
  } = await managerPromise;
  store.clear();
  assert.equal(await getDefaultModel(), null);
  assert.deepEqual(await getCustomModels(), []);
  assert.deepEqual(await getAllDiscoveredModels(), {});

  const choice = { providerId: 'gemini' as const, modelId: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' };
  await saveDefaultModel(choice);
  await saveCustomModels([{ providerId: 'groq', modelId: 'custom-model', label: 'Custom' }]);
  await saveDiscoveredModels('gemini', [choice]);
  await saveDiscoveredModels('groq', [{ providerId: 'groq', modelId: 'llama', label: 'Llama' }]);
  assert.deepEqual(await getDefaultModel(), choice);
  assert.equal((await getCustomModels())[0]?.modelId, 'custom-model');
  const discovered = await getAllDiscoveredModels();
  assert.equal(discovered.gemini?.[0]?.modelId, 'gemini-2.5-flash');
  assert.equal(discovered.groq?.[0]?.modelId, 'llama');

  for (const key of store.keys()) store.set(key, '{not-json');
  assert.equal(await getDefaultModel(), null);
  assert.deepEqual(await getCustomModels(), []);
  assert.deepEqual(await getAllDiscoveredModels(), {});
});
