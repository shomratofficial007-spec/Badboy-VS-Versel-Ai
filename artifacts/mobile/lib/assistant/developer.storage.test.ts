import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const asyncValues = new Map<string, string>();
const secureValues = new Map<string, string>();
let secureAvailable = true;
let secureOperationError = false;
const asyncStorage = {
  getItem: async (key: string) => asyncValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { asyncValues.set(key, value); },
  removeItem: async (key: string) => { asyncValues.delete(key); },
};

mock.module('@react-native-async-storage/async-storage', { defaultExport: asyncStorage });
// Token-helper tests do not exercise local-state persistence; isolate the
// React Native storage adapter so Node does not transform react-native internals.
mock.module('./storage', {
  namedExports: {
    readLocalState: async () => ({ messages: [], settings: {}, memories: [] }),
    storeMemoryNote: async () => undefined,
  },
});
mock.module('expo-secure-store', {
  namedExports: {
    isAvailableAsync: async () => secureAvailable,
    getItemAsync: async (key: string) => {
      if (secureOperationError) throw new Error('secure store unavailable');
      return secureValues.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string) => {
      if (secureOperationError) throw new Error('secure store unavailable');
      secureValues.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      if (secureOperationError) throw new Error('secure store unavailable');
      secureValues.delete(key);
    },
  },
});

const loadDeveloper = () => import('./developer');

test('GitHub token helpers prefer SecureStore and trim saved credentials', async () => {
  const { saveGitHubToken, getGitHubToken, removeGitHubToken } = await loadDeveloper();
  secureAvailable = true;
  secureOperationError = false;
  secureValues.clear();
  asyncValues.clear();

  await saveGitHubToken('  ghp-test-token  ');
  assert.equal(secureValues.get('oi-assistant-github-token-v1'), 'ghp-test-token');
  assert.equal(await getGitHubToken(), 'ghp-test-token');
  assert.equal(asyncValues.size, 0);

  await removeGitHubToken();
  assert.equal(await getGitHubToken(), null);
  assert.equal(secureValues.has('oi-assistant-github-token-v1'), false);
});

test('GitHub token helpers fail closed when SecureStore is unavailable', async () => {
  const { saveGitHubToken, getGitHubToken, removeGitHubToken } = await loadDeveloper();
  secureAvailable = false;
  secureOperationError = false;
  secureValues.clear();
  asyncValues.clear();

  await assert.rejects(saveGitHubToken('  fallback-token  '), /not saved in unencrypted storage/);
  assert.equal(asyncValues.has('oi-assistant-github-token-v1'), false);
  assert.equal(await getGitHubToken(), null);

  await removeGitHubToken();
  assert.equal(await getGitHubToken(), null);
});

test('GitHub token helpers fail closed when SecureStore operations throw', async () => {
  const { saveGitHubToken, getGitHubToken, removeGitHubToken } = await loadDeveloper();
  secureAvailable = true;
  secureOperationError = true;
  secureValues.clear();
  asyncValues.clear();

  await assert.rejects(saveGitHubToken('fallback-after-error'), /secure store unavailable/);
  assert.equal(asyncValues.has('oi-assistant-github-token-v1'), false);
  assert.equal(await getGitHubToken(), null);

  await removeGitHubToken();
  assert.equal(asyncValues.has('oi-assistant-github-token-v1'), false);
});
