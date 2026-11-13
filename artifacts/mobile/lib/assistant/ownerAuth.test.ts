import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Platform } from 'react-native';
import {
  clearOwnerToken,
  getOwnerToken,
  restoreOwnerSession,
  saveOwnerToken,
  verifyOwnerToken,
} from './ownerAuth';

const OWNER_TOKEN = 'a'.repeat(43);
const SESSION_TOKEN = 'b'.repeat(64);
const originalFetch = globalThis.fetch;
let secureStoreToken: string | null = null;

mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  },
});

beforeEach(() => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ authenticated: true }), { status: 200 })) as typeof fetch;
});

afterEach(async () => {
  await clearOwnerToken();
  globalThis.fetch = originalFetch;
  secureStoreToken = null;
});

test('keeps the owner token in the active session and restores an existing session', async () => {
  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);

  await saveOwnerToken(SESSION_TOKEN);
  assert.equal(await getOwnerToken(), SESSION_TOKEN);
  assert.equal(await restoreOwnerSession(), true);

  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);
});

test('uses SecureStore on native when EXPO_OS is omitted by a custom build', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalPlatformOs = Platform.OS;
  const originalExpoOs = process.env.EXPO_OS;
  try {
    delete process.env.EXPO_OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    // Native runtimes can expose window; its presence must not imply web.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost' } },
    });

    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, SESSION_TOKEN);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);

    // A fresh app runtime must recover the token from SecureStore.
    assert.equal(await restoreOwnerSession(), true);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);

    secureStoreToken = null;
    assert.equal(await restoreOwnerSession(), false);
    assert.equal(await getOwnerToken(), null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as typeof globalThis & { window?: unknown }).window;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOs });
    if (originalExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = originalExpoOs;
  }
});

test('uses SecureStore when the React Native runtime identifies Android', async () => {
  const originalPlatformOs = Platform.OS;
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, SESSION_TOKEN);
    assert.equal(await restoreOwnerSession(), true);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOs });
  }
});

test('keeps web sessions in memory without writing the native SecureStore', async () => {
  const originalPlatformOs = Platform.OS;
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, null);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOs });
  }
});

test('verifies a valid owner token through the Worker endpoint', async () => {
  let requestedUrl = '';
  let authorization = '';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify({ authenticated: true, sessionToken: SESSION_TOKEN }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  assert.equal(await verifyOwnerToken(OWNER_TOKEN), SESSION_TOKEN);
  assert.match(requestedUrl, /\/api\/auth\/session$/);
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
