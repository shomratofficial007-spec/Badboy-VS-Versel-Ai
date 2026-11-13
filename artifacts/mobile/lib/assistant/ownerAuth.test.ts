import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';

let clearOwnerToken: typeof import('./ownerAuth').clearOwnerToken;
let getOwnerToken: typeof import('./ownerAuth').getOwnerToken;
let restoreOwnerSession: typeof import('./ownerAuth').restoreOwnerSession;
let saveOwnerToken: typeof import('./ownerAuth').saveOwnerToken;
let verifyOwnerToken: typeof import('./ownerAuth').verifyOwnerToken;
let setOwnerSessionStorageForTests: typeof import('./ownerAuth').__setOwnerSessionStorageForTests;

const mockPlatform = { OS: 'android' };
mock.module('react-native', { namedExports: { Platform: mockPlatform } });

before(async () => {
  ({
    clearOwnerToken,
    getOwnerToken,
    restoreOwnerSession,
    saveOwnerToken,
    verifyOwnerToken,
    __setOwnerSessionStorageForTests: setOwnerSessionStorageForTests,
  } = await import('./ownerAuth'));
});

const OWNER_TOKEN = 'a'.repeat(43);
const SESSION_TOKEN = 'b'.repeat(64);
const originalFetch = globalThis.fetch;
const originalExpoOs = process.env.EXPO_OS;
let secureStoreToken: string | null = null;

beforeEach(() => {
  // Keep tests independent of CI's build-time Expo platform setting.
  process.env.EXPO_OS = 'android';
  setOwnerSessionStorageForTests({
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  }, false);
  globalThis.fetch = (async () => new Response(JSON.stringify({ authenticated: true }), { status: 200 })) as typeof fetch;
});

afterEach(async () => {
  await clearOwnerToken();
  globalThis.fetch = originalFetch;
  mockPlatform.OS = 'android';
  if (originalExpoOs === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOs;
  secureStoreToken = null;
  setOwnerSessionStorageForTests(null);
});

test('keeps the owner token in the active session and restores an existing session', { concurrency: false }, async () => {
  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);

  await saveOwnerToken(SESSION_TOKEN);
  assert.equal(await getOwnerToken(), SESSION_TOKEN);
  setOwnerSessionStorageForTests({
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  }, false, true);
  assert.equal(await restoreOwnerSession(), true);

  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);
});

test('uses SecureStore on native when EXPO_OS is omitted by a custom build', { concurrency: false }, async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const testExpoOs = process.env.EXPO_OS;
  try {
    delete process.env.EXPO_OS;
    // Native runtimes can expose window; its presence must not imply web.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost' } },
    });

    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, SESSION_TOKEN);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);

    // Simulate a fresh app runtime with no in-memory session.
    setOwnerSessionStorageForTests({
      getItemAsync: async () => secureStoreToken,
      setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
      deleteItemAsync: async () => { secureStoreToken = null; },
    }, false, true);
    assert.equal(await restoreOwnerSession(), true);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);

    secureStoreToken = null;
    assert.equal(await restoreOwnerSession(), false);
    assert.equal(await getOwnerToken(), null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as typeof globalThis & { window?: unknown }).window;
    if (testExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = testExpoOs;
  }
});

test('uses SecureStore when Expo runtime identifies Android', { concurrency: false }, async () => {
  await saveOwnerToken(SESSION_TOKEN);
  assert.equal(secureStoreToken, SESSION_TOKEN);
  setOwnerSessionStorageForTests({
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  }, 'native', true);
  assert.equal(await restoreOwnerSession(), true);
});

test('keeps web sessions in memory without writing the native SecureStore', { concurrency: false }, async () => {
  const testExpoOs = process.env.EXPO_OS;
  try {
    process.env.EXPO_OS = 'web';
    mockPlatform.OS = 'web';
    setOwnerSessionStorageForTests({
      getItemAsync: async () => secureStoreToken,
      setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
      deleteItemAsync: async () => { secureStoreToken = null; },
    }, true);
    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, null);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);
  } finally {
    mockPlatform.OS = 'android';
    if (testExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = testExpoOs;
  }
});

test('verifies a valid owner token through the Worker endpoint', { concurrency: false }, async () => {
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

test('rejects a Worker response that does not authenticate the owner token', { concurrency: false }, async () => {
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

test('handles a successful HTTP response without authenticated confirmation as failure', { concurrency: false }, async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ authenticated: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )) as typeof fetch;

  await assert.rejects(verifyOwnerToken(OWNER_TOKEN), /Owner authentication failed/);
});
