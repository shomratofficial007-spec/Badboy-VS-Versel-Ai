import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled }: any) {
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
  namedExports: { useOwnerAuth: () => ({ signIn: async () => {} }) },
});

const { default: OwnerLoginScreen } = await import('./owner-login');

test('Owner Login starts with a disabled secure-token action and explains local data privacy', () => {
  const html = renderToStaticMarkup(React.createElement(OwnerLoginScreen));
  assert.match(html, /BADBOY/);
  assert.match(html, /Owner Login/);
  assert.match(html, /Paste Owner Token/);
  assert.match(html, /Secure Sign In/);
  assert.match(html, /disabled/);
  assert.match(html, /SecureStore/);
  assert.match(html, /Chat History ও Memory ফোনেই থাকবে/);
});
