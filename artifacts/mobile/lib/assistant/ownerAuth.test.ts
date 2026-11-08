import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
// Expo replaces EXPO_OS at bundle time. Set the Node test target before
// importing the module so this suite exercises the web-safe in-memory branch.
process.env.EXPO_OS = 'web';
const {
  clearOwnerToken,
  getOwnerToken,
  restoreOwnerSession,
  saveOwnerToken,
  verifyOwnerToken,
} = await import('./ownerAuth');

const OWNER_TOKEN = 'a'.repeat(43);
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await clearOwnerToken();
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
