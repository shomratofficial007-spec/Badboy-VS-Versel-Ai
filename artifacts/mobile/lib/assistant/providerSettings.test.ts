import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderKeyStore } from './providerSettingsCore';

let secureStoreAvailable = true;
const secureValues = new Map<string, string>();
const keyStore = createProviderKeyStore({
  isAvailableAsync: async () => secureStoreAvailable,
  setItemAsync: async (key, value) => { secureValues.set(key, value); },
  getItemAsync: async (key) => secureValues.get(key) ?? null,
  deleteItemAsync: async (key) => { secureValues.delete(key); },
});

test('stores provider API keys only through the secure storage adapter', async () => {
  secureStoreAvailable = true;
  await keyStore.save('openai', '  secret-provider-key  ');
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