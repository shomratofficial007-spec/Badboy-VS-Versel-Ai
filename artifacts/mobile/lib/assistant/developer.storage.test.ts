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

test('GitHub token helpers fall back to AsyncStorage when SecureStore is unavailable', async () => {
  const { saveGitHubToken, getGitHubToken, removeGitHubToken } = await loadDeveloper();
  secureAvailable = false;
  secureOperationError = false;
  secureValues.clear();
  asyncValues.clear();

  await saveGitHubToken('  fallback-token  ');
  assert.equal(asyncValues.get('oi-assistant-github-token-v1'), 'fallback-token');
  assert.equal(await getGitHubToken(), 'fallback-token');

  await removeGitHubToken();
  assert.equal(await getGitHubToken(), null);
});

test('GitHub token helpers fall back when SecureStore operations throw', async () => {
  const { saveGitHubToken, getGitHubToken, removeGitHubToken } = await loadDeveloper();
  secureAvailable = true;
  secureOperationError = true;
  secureValues.clear();
  asyncValues.clear();

  await saveGitHubToken('fallback-after-error');
  assert.equal(asyncValues.get('oi-assistant-github-token-v1'), 'fallback-after-error');
  assert.equal(await getGitHubToken(), 'fallback-after-error');

  await removeGitHubToken();
  assert.equal(asyncValues.has('oi-assistant-github-token-v1'), false);
});
