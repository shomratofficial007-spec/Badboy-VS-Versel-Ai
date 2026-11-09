import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const authCalls: string[] = [];
let verificationError: Error | null = null;
mock.module('../lib/assistant/ownerAuth.ts', {
  namedExports: {
    clearOwnerToken: async () => { authCalls.push('clear'); },
    restoreOwnerSession: async () => { authCalls.push('restore'); return true; },
    saveOwnerToken: async () => { authCalls.push('save'); },
    verifyOwnerToken: async () => { authCalls.push('verify'); if (verificationError) throw verificationError; },
  },
});

const ownerAuthContextPromise = import('./OwnerAuthContext');

test('OwnerAuthProvider supplies a safe unauthenticated initial state during server rendering', async () => {
  const { OwnerAuthProvider, useOwnerAuth } = await ownerAuthContextPromise;
  function AuthState() {
    const auth = useOwnerAuth();
    return React.createElement('output', null, `${auth.ready}:${auth.authenticated}`);
  }
  authCalls.length = 0;
  const html = renderToStaticMarkup(
    React.createElement(OwnerAuthProvider, null, React.createElement(AuthState)),
  );
  assert.match(html, /false:false/);
  assert.deepEqual(authCalls, []);
});

test('useOwnerAuth rejects use outside the provider instead of silently granting access', async () => {
  const { useOwnerAuth } = await ownerAuthContextPromise;
  function OutsideProvider() {
    useOwnerAuth();
    return null;
  }
  assert.throws(
    () => renderToStaticMarkup(React.createElement(OutsideProvider)),
    /useOwnerAuth must be used inside OwnerAuthProvider/,
  );
});

test('OwnerAuthProvider validates, verifies, stores and clears owner credentials in order', async () => {
  const { OwnerAuthProvider, useOwnerAuth } = await ownerAuthContextPromise;
  let auth: ReturnType<typeof useOwnerAuth> | undefined;
  function CaptureAuth() {
    auth = useOwnerAuth();
    return React.createElement('output', null, 'captured');
  }
  authCalls.length = 0;
  verificationError = null;
  renderToStaticMarkup(
    React.createElement(OwnerAuthProvider, null, React.createElement(CaptureAuth)),
  );
  assert.ok(auth);
  await assert.rejects(auth.signIn('short-token'), /ফরম্যাট সঠিক নয়/);
  assert.deepEqual(authCalls, []);
  const token = 'A'.repeat(43);
  await auth.signIn(`  ${token}  `);
  assert.deepEqual(authCalls, ['verify', 'save']);
  await auth.signOut();
  assert.deepEqual(authCalls, ['verify', 'save', 'clear']);
});

test('OwnerAuthProvider does not save a token when Worker verification fails', async () => {
  const { OwnerAuthProvider, useOwnerAuth } = await ownerAuthContextPromise;
  let auth: ReturnType<typeof useOwnerAuth> | undefined;
  function CaptureAuth() {
    auth = useOwnerAuth();
    return React.createElement('output', null, 'captured');
  }
  authCalls.length = 0;
  verificationError = new Error('Worker rejected token');
  renderToStaticMarkup(
    React.createElement(OwnerAuthProvider, null, React.createElement(CaptureAuth)),
  );
  assert.ok(auth);
  await assert.rejects(auth.signIn('B'.repeat(43)), /Worker rejected token/);
  assert.deepEqual(authCalls, ['verify']);
  verificationError = null;
});
