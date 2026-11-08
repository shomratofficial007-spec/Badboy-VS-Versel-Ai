import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let assistantState = {
  memories: [] as Array<{ id: string; title: string; content: string; createdAt: number }>,
  storageError: null as string | null,
  saveMemory: async () => {},
  updateMemory: async () => {},
  deleteMemory: async () => {},
};

const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, ...props }: any) {
  return React.createElement(tag, {
    ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(typeof props.disabled === 'boolean' ? { disabled: props.disabled } : {}),
  }, children);
};

mock.module('react-native', {
  namedExports: {
    Alert: { alert: () => {} },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('span'),
    TextInput: host('input'),
    View: host('section'),
  },
});
mock.module('@expo/vector-icons', { namedExports: { Feather: () => null } });
mock.module('react-native-safe-area-context', {
  namedExports: { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
});
mock.module('../context/AssistantContext.tsx', {
  namedExports: { useAssistant: () => assistantState },
});
mock.module('../hooks/useColors.ts', {
  namedExports: {
    useColors: () => ({
      background: '#000', foreground: '#fff', mutedForeground: '#aaa',
      primary: '#00d9ff', primaryForeground: '#000', card: '#111',
      border: '#333', input: '#444', destructive: '#f44',
    }),
  },
});

const memoryScreenPromise = import('../app/(tabs)/memory');

test('Memory screen renders the private local-storage empty state', async () => {
  const { default: MemoryScreen } = await memoryScreenPromise;
  assistantState = { ...assistantState, memories: [], storageError: null };
  const html = renderToStaticMarkup(React.createElement(MemoryScreen));
  assert.match(html, /Private Memory/);
  assert.match(html, /LOCAL DEVICE STORAGE/);
  assert.match(html, /এখনো কোনো প্রাইভেট মেমোরি সংরক্ষিত হয়নি/);
  assert.doesNotMatch(html, /নোট খুঁজুন/);
});

test('Memory screen renders saved notes, search and storage errors without moving data to cloud', async () => {
  const { default: MemoryScreen } = await memoryScreenPromise;
  assistantState = {
    ...assistantState,
    memories: [{ id: 'note-1', title: 'কাজের নোট', content: 'আগামীকাল কাজ শেষ করব', createdAt: 1_760_000_000_000 }],
    storageError: 'Local secure storage warning',
  };
  const html = renderToStaticMarkup(React.createElement(MemoryScreen));
  assert.match(html, /কাজের নোট/);
  assert.match(html, /আগামীকাল কাজ শেষ করব/);
  assert.match(html, /নোট খুঁজুন/);
  assert.match(html, /Local secure storage warning/);
  assert.match(html, /এই তথ্যটি সম্পূর্ণ লোকাল|সম্পূর্ণ লোকাল/);
});
