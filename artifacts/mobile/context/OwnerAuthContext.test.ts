import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const authCalls: string[] = [];
mock.module('../lib/assistant/ownerAuth.ts', {
  namedExports: {
    clearOwnerToken: async () => { authCalls.push('clear'); },
    restoreOwnerSession: async () => { authCalls.push('restore'); return true; },
    saveOwnerToken: async () => { authCalls.push('save'); },
    verifyOwnerToken: async () => { authCalls.push('verify'); },
  },
});

const { OwnerAuthProvider, useOwnerAuth } = await import('./OwnerAuthContext');

function AuthState() {
  const auth = useOwnerAuth();
  return React.createElement('output', null, `${auth.ready}:${auth.authenticated}`);
}

test('OwnerAuthProvider supplies a safe unauthenticated initial state during server rendering', () => {
  authCalls.length = 0;
  const html = renderToStaticMarkup(
    React.createElement(OwnerAuthProvider, null, React.createElement(AuthState)),
  );
  assert.match(html, /false:false/);
  assert.deepEqual(authCalls, []);
});

test('useOwnerAuth rejects use outside the provider instead of silently granting access', () => {
  function OutsideProvider() {
    useOwnerAuth();
    return null;
  }
  assert.throws(
    () => renderToStaticMarkup(React.createElement(OutsideProvider)),
    /useOwnerAuth must be used inside OwnerAuthProvider/,
  );
});
