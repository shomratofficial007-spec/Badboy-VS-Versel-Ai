import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';

const mockPlatform = { OS: 'android' };
let clearOwnerToken: typeof import('./ownerAuth').clearOwnerToken;
let getOwnerToken: typeof import('./ownerAuth').getOwnerToken;
let restoreOwnerSession: typeof import('./ownerAuth').restoreOwnerSession;
let saveOwnerToken: typeof import('./ownerAuth').saveOwnerToken;
let verifyOwnerToken: typeof import('./ownerAuth').verifyOwnerToken;

mock.module('react-native', { namedExports: { Platform: mockPlatform }, cache: false });

const OWNER_TOKEN = 'a'.repeat(43);
const SESSION_TOKEN = 'b'.repeat(64);
const originalFetch = globalThis.fetch;
const originalExpoOs = process.env.EXPO_OS;
let secureStoreToken: string | null = null;

mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async () => secureStoreToken,
    setItemAsync: async (_key: string, value: string) => { secureStoreToken = value; },
    deleteItemAsync: async () => { secureStoreToken = null; },
  },
  cache: false,
});

before(async () => {
  ({
    clearOwnerToken,
    getOwnerToken,
    restoreOwnerSession,
    saveOwnerToken,
    verifyOwnerToken,
  } = await import('./ownerAuth'));
});

beforeEach(() => {
  process.env.EXPO_OS = 'android';
  mockPlatform.OS = 'android';
  Reflect.set(globalThis, '__BADBOY_TEST_PLATFORM__', 'native');
  globalThis.fetch = (async () => new Response(JSON.stringify({ authenticated: true }), { status: 200 })) as typeof fetch;
});

afterEach(async () => {
  await clearOwnerToken();
  globalThis.fetch = originalFetch;
  mockPlatform.OS = 'android';
  Reflect.deleteProperty(globalThis, '__BADBOY_TEST_PLATFORM__');
  if (originalExpoOs === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOs;
  secureStoreToken = null;
});

test('keeps the owner session in SecureStore and restores it', { concurrency: false }, async () => {
  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);

  await saveOwnerToken(SESSION_TOKEN);
  assert.equal(secureStoreToken, SESSION_TOKEN);
  assert.equal(await getOwnerToken(), SESSION_TOKEN);

  // Simulate a fresh app runtime by clearing the in-memory cache.
  await clearOwnerToken();
  secureStoreToken = SESSION_TOKEN;
  assert.equal(await restoreOwnerSession(), true);
  assert.equal(await getOwnerToken(), SESSION_TOKEN);

  await clearOwnerToken();
  assert.equal(await getOwnerToken(), null);
  assert.equal(await restoreOwnerSession(), false);
});

test('uses SecureStore on native when EXPO_OS is omitted by a custom build', { concurrency: false }, async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const testExpoOs = process.env.EXPO_OS;
  try {
    delete process.env.EXPO_OS;
    mockPlatform.OS = 'android';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost' } },
    });

    await saveOwnerToken(SESSION_TOKEN);
    assert.equal(secureStoreToken, SESSION_TOKEN);
    assert.equal(await getOwnerToken(), SESSION_TOKEN);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as typeof globalThis & { window?: unknown }).window;
    if (testExpoOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = testExpoOs;
  }
});

test('uses SecureStore when React Native runtime identifies Android', { concurrency: false }, async () => {
  mockPlatform.OS = 'android';
  process.env.EXPO_OS = 'android';
  await saveOwnerToken(SESSION_TOKEN);
  assert.equal(secureStoreToken, SESSION_TOKEN);
  assert.equal(await restoreOwnerSession(), true);
});

test('keeps web sessions in memory without writing the native SecureStore', { concurrency: false }, async () => {
  const testExpoOs = process.env.EXPO_OS;
  try {
    process.env.EXPO_OS = 'web';
    mockPlatform.OS = 'web';
    Reflect.set(globalThis, '__BADBOY_TEST_PLATFORM__', 'web');
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
