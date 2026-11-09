import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import {
  clearOwnerToken,
  getOwnerToken,
  restoreOwnerSession,
  saveOwnerToken,
  verifyOwnerToken,
} from './ownerAuth';

const OWNER_TOKEN = 'a'.repeat(43);
const originalFetch = globalThis.fetch;
let secureStoreToken: string | null = null;

mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  },
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await clearOwnerToken();
  secureStoreToken = null;
});

test('keeps the owner token in the active session and restores an existing session', async () => {
  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);

  await saveOwnerToken(OWNER_TOKEN);
  assert.equal(await getOwnerToken(), OWNER_TOKEN);
  assert.equal(await restoreOwnerSession(), true);

  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);
});

test('uses SecureStore on native when EXPO_OS is omitted by a custom build', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalExpoOs = process.env.EXPO_OS;
  try {
    delete process.env.EXPO_OS;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });

    await saveOwnerToken(OWNER_TOKEN);
    assert.equal(secureStoreToken, OWNER_TOKEN);
    assert.equal(await getOwnerToken(), OWNER_TOKEN);

    // Simulate a fresh JS runtime: the token must be restored from SecureStore,
    // not merely from the module's in-memory cache.
    await clearOwnerToken();
    assert.equal(secureStoreToken, null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as typeof globalThis & { window?: unknown }).window;
    if (originalExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = originalExpoOs;
  }
});

test('uses SecureStore when Expo explicitly identifies Android', async () => {
  const originalExpoOs = process.env.EXPO_OS;
  try {
    process.env.EXPO_OS = 'android';
    await saveOwnerToken(OWNER_TOKEN);
    assert.equal(secureStoreToken, OWNER_TOKEN);
    assert.equal(await restoreOwnerSession(), true);
  } finally {
    if (originalExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = originalExpoOs;
  }
});

test('keeps web sessions in memory without writing the native SecureStore', async () => {
  const originalExpoOs = process.env.EXPO_OS;
  try {
    process.env.EXPO_OS = 'web';
    await saveOwnerToken(OWNER_TOKEN);
    assert.equal(secureStoreToken, null);
    assert.equal(await getOwnerToken(), OWNER_TOKEN);
  } finally {
    if (originalExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = originalExpoOs;
  }
});

test('verifies a valid owner token through the Worker endpoint', async () => {
  let requestedUrl = '';
  let authorization = '';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await verifyOwnerToken(OWNER_TOKEN);
  assert.match(requestedUrl, /\/api\/auth\/verify$/);
  assert.equal(authorization, `Bearer ${OWNER_TOKEN}`);
});

test('rejects a Worker response that does not authenticate the owner token', async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: 'Personal access key is invalid.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )) as typeof fetch;

  await assert.rejects(
    verifyOwnerToken(OWNER_TOKEN),
    (error: Error & { status?: number }) => {
      assert.match(error.message, /Personal access key is invalid/);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test('handles a successful HTTP response without authenticated confirmation as failure', async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ authenticated: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )) as typeof fetch;

  await assert.rejects(verifyOwnerToken(OWNER_TOKEN), /Owner authentication failed/);
});
