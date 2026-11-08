import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const pressHandlers: Array<() => void> = [];
const signInCalls: string[] = [];
let rejectSignIn = false;

const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled, onPress }: any) {
  if (tag === 'button' && typeof onPress === 'function') pressHandlers.push(onPress);
  return React.createElement(tag, {
    ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(typeof disabled === 'boolean' ? { disabled } : {}),
  }, children);
};

mock.module('react-native', {
  namedExports: {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    KeyboardAvoidingView: host('main'),
    Platform: { OS: 'android' },
    Pressable: host('button'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('span'),
    TextInput: host('input'),
    View: host('section'),
  },
});
mock.module('../context/OwnerAuthContext.tsx', {
  namedExports: { useOwnerAuth: () => ({ signIn: async (token: string) => { signInCalls.push(token); if (rejectSignIn) throw new Error('invalid owner token'); } }) },
});

const ownerLoginScreenPromise = import('../app/owner-login');

test('Owner Login starts with a disabled secure-token action and explains local data privacy', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  const html = renderToStaticMarkup(React.createElement(OwnerLoginScreen));
  assert.match(html, /BADBOY/);
  assert.match(html, /Owner Login/);
  assert.match(html, /Paste Owner Token/);
  assert.match(html, /Secure Sign In/);
  assert.match(html, /disabled/);
  assert.match(html, /SecureStore/);
  assert.match(html, /Chat History ও Memory ফোনেই থাকবে/);
});

test('Owner Login submit handler delegates to owner auth and safely handles rejection', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  pressHandlers.length = 0;
  signInCalls.length = 0;
  rejectSignIn = true;
  renderToStaticMarkup(React.createElement(OwnerLoginScreen));
  assert.equal(pressHandlers.length, 1);
  await pressHandlers[0]();
  assert.deepEqual(signInCalls, ['']);
  rejectSignIn = false;
});

test('Owner Login submit handler completes after successful owner authentication', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  pressHandlers.length = 0;
  signInCalls.length = 0;
  rejectSignIn = false;
  renderToStaticMarkup(React.createElement(OwnerLoginScreen));
  await pressHandlers[0]();
  assert.deepEqual(signInCalls, ['']);
});
