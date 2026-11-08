import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const local = new Map<string, string>();
const secure = new Map<string, string>();
let secureAvailable = true;
let secureThrows = false;

const asyncStorage = {
  getItem: async (key: string) => local.get(key) ?? null,
  setItem: async (key: string, value: string) => { local.set(key, value); },
  removeItem: async (key: string) => { local.delete(key); },
  multiRemove: async (keys: string[]) => { for (const key of keys) local.delete(key); },
};
mock.module('@react-native-async-storage/async-storage', {
  defaultExport: asyncStorage,
  namedExports: { default: asyncStorage },
});
mock.module('expo-secure-store', {
  namedExports: {
    isAvailableAsync: async () => {
      if (secureThrows) throw new Error('secure store unavailable');
      return secureAvailable;
    },
    setItemAsync: async (key: string, value: string) => { secure.set(key, value); },
    getItemAsync: async (key: string) => secure.get(key) ?? null,
    deleteItemAsync: async (key: string) => { secure.delete(key); },
  },
});

const storagePromise = import('./storage');

function reset() {
  local.clear();
  secure.clear();
  secureAvailable = true;
  secureThrows = false;
}

test('readLocalState returns empty defaults and restores messages, settings and indexed memory', async () => {
  const { readLocalState } = await storagePromise;
  reset();
  assert.deepEqual(await readLocalState(), { messages: [], settings: {}, memories: [] });
  local.set('oi-assistant-chat-v1', JSON.stringify([{ id: 'm1', role: 'user', content: 'হ্যালো' }]));
  local.set('oi-assistant-settings-v1', JSON.stringify({ theme: 'ocean' }));
  local.set('oi-assistant-memory-index-v1', JSON.stringify([
    { id: 'n1', title: 'ব্যক্তিগত নোট', createdAt: '2026-01-01' },
    { id: 'n2', title: 'ফাঁকা নোট', createdAt: '2026-01-02' },
  ]));
  secure.set('oi-assistant-memory-n1', 'গোপন বিষয়');
  const restored = await readLocalState();
  assert.equal(restored.messages[0].content, 'হ্যালো');
  assert.deepEqual(restored.settings, { theme: 'ocean' });
  assert.deepEqual(restored.memories, [
    { id: 'n1', title: 'ব্যক্তিগত নোট', createdAt: '2026-01-01', content: 'গোপন বিষয়' },
    { id: 'n2', title: 'ফাঁকা নোট', createdAt: '2026-01-02', content: '' },
  ]);
});

test('persistMessages and persistSettings serialize local data', async () => {
  const { persistMessages, persistSettings } = await storagePromise;
  reset();
  const messages = [{ id: '1', role: 'assistant', content: 'Hello', createdAt: 'now' }];
  const settings = { theme: 'badboy', onlineAI: true };
  await persistMessages(messages as any);
  await persistSettings(settings as any);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-chat-v1')!), messages);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-settings-v1')!), settings);
});

test('memory create/update/delete stores content securely and maintains only index metadata', async () => {
  const { readLocalState, storeMemoryNote, updateMemoryNote, removeMemoryNote } = await storagePromise;
  reset();
  const note = { id: 'n1', title: 'নোট', content: 'গোপন তথ্য', createdAt: 'today' };
  await storeMemoryNote(note, [note]);
  assert.equal(secure.get('oi-assistant-memory-n1'), 'গোপন তথ্য');
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-index-v1')!), [
    { id: 'n1', title: 'নোট', createdAt: 'today' },
  ]);
  assert.equal(local.get('oi-assistant-memory-index-v1')!.includes('গোপন তথ্য'), false);

  const updated = { ...note, title: 'পরিবর্তিত', content: 'নতুন গোপন তথ্য' };
  const afterUpdate = await updateMemoryNote(updated, [note]);
  assert.deepEqual(afterUpdate, [updated]);
  assert.equal(secure.get('oi-assistant-memory-n1'), 'নতুন গোপন তথ্য');
  const afterDelete = await removeMemoryNote('n1', afterUpdate);
  assert.deepEqual(afterDelete, []);
  assert.equal(secure.has('oi-assistant-memory-n1'), false);
  assert.deepEqual((await readLocalState()).memories, []);
});

test('memory data falls back to AsyncStorage when SecureStore is unavailable or throws', async () => {
  const { readLocalState, storeMemoryNote, updateMemoryNote, removeMemoryNote } = await storagePromise;
  reset();
  secureAvailable = false;
  const note = { id: 'fallback', title: 'Fallback', content: 'local fallback', createdAt: 'today' };
  await storeMemoryNote(note, [note]);
  assert.equal(local.get('oi-assistant-memory-fallback'), 'local fallback');
  assert.equal((await readLocalState()).memories[0].content, 'local fallback');
  secureThrows = true;
  const updated = { ...note, content: 'updated fallback' };
  await updateMemoryNote(updated, [note]);
  assert.equal(local.get('oi-assistant-memory-fallback'), 'updated fallback');
  await removeMemoryNote('fallback', [updated]);
  assert.equal(local.has('oi-assistant-memory-fallback'), false);
});

test('clearLocalAssistantData removes chat, settings, memory index and every stored note', async () => {
  const { clearLocalAssistantData } = await storagePromise;
  reset();
  local.set('oi-assistant-chat-v1', '[]');
  local.set('oi-assistant-settings-v1', '{}');
  local.set('oi-assistant-memory-index-v1', JSON.stringify([
    { id: 'one', title: 'One', createdAt: 'today' },
    { id: 'two', title: 'Two', createdAt: 'today' },
  ]));
  secure.set('oi-assistant-memory-one', 'one content');
  secure.set('oi-assistant-memory-two', 'two content');
  await clearLocalAssistantData();
  assert.deepEqual([...local.keys()], []);
  assert.deepEqual([...secure.keys()], []);
});
