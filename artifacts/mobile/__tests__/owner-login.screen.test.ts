import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const pressHandlers: Array<() => void> = [];
const signInCalls: string[] = [];
const hookState: unknown[] = [];
let hookIndex = 0;
let rejectSignIn = false;
let holdSignIn = false;
let resolvePendingSignIn: (() => void) | null = null;

mock.module('react', {
  defaultExport: React,
  namedExports: {
    useState: (initial: unknown) => {
      const index = hookIndex++;
      if (!(index in hookState)) hookState[index] = initial;
      return [
        hookState[index],
        (next: unknown) => {
          hookState[index] = typeof next === 'function'
            ? (next as (previous: unknown) => unknown)(hookState[index])
            : next;
        },
      ];
    },
  },
});

const textContent = (node: any): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) return textContent((node.props as any).children);
  return '';
};

function renderOwnerLogin(Screen: React.ComponentType) {
  hookIndex = 0;
  return renderToStaticMarkup(React.createElement(Screen));
}

const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled, onPress }: any) {
  if (tag === 'button' && typeof onPress === 'function' && textContent(children).includes('Login Now')) pressHandlers.push(onPress);
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
    Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default ?? options.ios },
    ScrollView: host('main'),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Pressable: host('button'),
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
    Text: host('span'),
    TextInput: host('input'),
    View: host('section'),
  },
});
mock.module('@expo/vector-icons', { namedExports: { Feather: () => null } });
mock.module('expo-linear-gradient', { namedExports: { LinearGradient: ({ children }: any) => React.createElement('div', null, children) } });
mock.module('react-native-svg', {
  defaultExport: Object.assign(
    ({ children }: any) => React.createElement('svg', null, children),
    { Circle: 'circle', Defs: 'defs', Ellipse: 'ellipse', LinearGradient: 'linearGradient', Path: 'path', Stop: 'stop' },
  ),
});
mock.module('react-native-safe-area-context', { namedExports: { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) } });
mock.module('../context/OwnerAuthContext.tsx', {
  namedExports: { useOwnerAuth: () => ({ signIn: async (token: string) => {
    signInCalls.push(token);
    if (holdSignIn) await new Promise<void>((resolve) => { resolvePendingSignIn = resolve; });
    if (rejectSignIn) throw new Error('invalid owner token');
  } }) },
});

const ownerLoginScreenPromise = import('../app/owner-login');

test('Owner Login renders the owner-token gate and keeps submit disabled without a token', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  hookState.length = 0;
  pressHandlers.length = 0;
  const html = renderOwnerLogin(OwnerLoginScreen);
  assert.match(html, /Badboy/);
  assert.match(html, /OWNER/);
  assert.match(html, /Login Now/);
  assert.match(html, /Owner Token/);
  assert.match(html, /Enter your Owner Token to access/);
  assert.match(html, /Without Owner Login,/);
  assert.match(html, /You cannot access the main app!/);
  assert.match(html, /Secure Access/);
  assert.match(html, /Owner Control/);
  assert.match(html, /Full Features Unlocked/);
  assert.match(html, /Badboy AI Premium/);
  assert.match(html, /Built for the Real Power Users/);
  assert.match(html, /disabled/);
  assert.equal(pressHandlers.length, 1);
  await pressHandlers[0]();
  assert.deepEqual(signInCalls, []);
});

test('Owner Login submits the entered token through the existing owner auth provider', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  hookState.length = 0;
  hookState[0] = 'owner-token-test';
  pressHandlers.length = 0;
  signInCalls.length = 0;
  rejectSignIn = false;
  renderOwnerLogin(OwnerLoginScreen);
  assert.equal(pressHandlers.length, 1);
  await pressHandlers[0]();
  assert.deepEqual(signInCalls, ['owner-token-test']);
});

test('Owner Login safely handles rejected owner authentication', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  hookState.length = 0;
  hookState[0] = 'invalid-token';
  pressHandlers.length = 0;
  signInCalls.length = 0;
  rejectSignIn = true;
  renderOwnerLogin(OwnerLoginScreen);
  await pressHandlers[0]();
  assert.deepEqual(signInCalls, ['invalid-token']);
  rejectSignIn = false;
});

test('Owner Login ignores a second submit while an authentication request is pending', async () => {
  const { default: OwnerLoginScreen } = await ownerLoginScreenPromise;
  hookState.length = 0;
  hookState[0] = 'owner-token-test';
  signInCalls.length = 0;
  rejectSignIn = false;
  holdSignIn = true;
  pressHandlers.length = 0;

  renderOwnerLogin(OwnerLoginScreen);
  const firstSubmit = pressHandlers[0]();
  assert.equal(typeof resolvePendingSignIn, 'function');

  hookState[1] = true;
  pressHandlers.length = 0;
  renderOwnerLogin(OwnerLoginScreen);
  assert.equal(pressHandlers.length, 0);
  assert.deepEqual(signInCalls, ['owner-token-test']);

  resolvePendingSignIn?.();
  await firstSubmit;
  holdSignIn = false;
  resolvePendingSignIn = null;
});
