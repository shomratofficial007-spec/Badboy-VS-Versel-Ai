import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const local = new Map<string, string>();
const secure = new Map<string, string>();
let secureAvailable = true;
let secureThrows = false;
const platform = { OS: 'android' as 'android' | 'web' };

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
mock.module('react-native', {
  namedExports: { Platform: platform },
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
  platform.OS = 'android';
}

test('readLocalState restores notes and migrates legacy plaintext metadata into SecureStore', async () => {
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
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-index-v1')!), [{ id: 'n1' }, { id: 'n2' }]);
  assert.deepEqual(JSON.parse(secure.get('oi-assistant-memory-n1')!), {
    id: 'n1',
    title: 'ব্যক্তিগত নোট',
    createdAt: '2026-01-01',
    content: 'গোপন বিষয়',
  });
});

test('migrates legacy AsyncStorage private notes into SecureStore before deleting plaintext copies', async () => {
  const { readLocalState } = await storagePromise;
  reset();
  local.set('oi-assistant-memory-index-v1', JSON.stringify([
    { id: 'legacy', title: 'পুরোনো নোট', createdAt: '2026-01-02' },
  ]));
  local.set('oi-assistant-memory-legacy', 'পুরোনো ব্যক্তিগত তথ্য');

  const restored = await readLocalState();
  assert.deepEqual(restored.memories, [{
    id: 'legacy',
    title: 'পুরোনো নোট',
    createdAt: '2026-01-02',
    content: 'পুরোনো ব্যক্তিগত তথ্য',
  }]);
  assert.equal(local.has('oi-assistant-memory-legacy'), false);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-index-v1')!), [{ id: 'legacy' }]);
  assert.deepEqual(JSON.parse(secure.get('oi-assistant-memory-legacy')!), restored.memories[0]);
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

test('memory create/update/delete encrypts the complete note and stores only opaque IDs in the index', async () => {
  const { readLocalState, storeMemoryNote, updateMemoryNote, removeMemoryNote } = await storagePromise;
  reset();
  const note = { id: 'n1', title: 'নোট', content: 'গোপন তথ্য', createdAt: 'today' };
  await storeMemoryNote(note, []);
  assert.deepEqual(JSON.parse(secure.get('oi-assistant-memory-n1')!), note);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-index-v1')!), [{ id: 'n1' }]);
  assert.equal(local.get('oi-assistant-memory-index-v1')!.includes('নোট'), false);
  assert.equal(local.get('oi-assistant-memory-index-v1')!.includes('গোপন তথ্য'), false);

  const updated = { ...note, title: 'পরিবর্তিত', content: 'নতুন গোপন তথ্য' };
  const afterUpdate = await updateMemoryNote(updated, [note]);
  assert.deepEqual(afterUpdate, [updated]);
  assert.deepEqual(JSON.parse(secure.get('oi-assistant-memory-n1')!), updated);
  const afterDelete = await removeMemoryNote('n1', afterUpdate);
  assert.deepEqual(afterDelete, []);
  assert.equal(secure.has('oi-assistant-memory-n1'), false);
  assert.deepEqual((await readLocalState()).memories, []);
});

test('native private memory fails closed when SecureStore is unavailable and preserves legacy data', async () => {
  const { readLocalState, storeMemoryNote } = await storagePromise;
  reset();
  secureAvailable = false;
  const note = { id: 'blocked', title: 'Private', content: 'secret', createdAt: 'today' };
  await assert.rejects(storeMemoryNote(note, []), /Encrypted device storage is unavailable/);
  assert.equal(local.has('oi-assistant-memory-blocked'), false);
  assert.equal(local.has('oi-assistant-memory-index-v1'), false);

  secureThrows = true;
  await assert.rejects(storeMemoryNote(note, []), /Encrypted device storage is unavailable/);

  local.set('oi-assistant-memory-legacy', 'old private text');
  local.set('oi-assistant-memory-index-v1', JSON.stringify([
    { id: 'legacy', title: 'Old note', createdAt: 'yesterday' },
  ]));
  await assert.rejects(readLocalState(), /Encrypted device storage is unavailable/);
  assert.equal(local.get('oi-assistant-memory-legacy'), 'old private text');
  assert.equal(secure.has('oi-assistant-memory-legacy'), false);
});

test('web private memory uses browser-local storage and keeps only IDs in the index', async () => {
  const { readLocalState, storeMemoryNote, updateMemoryNote, removeMemoryNote } = await storagePromise;
  reset();
  platform.OS = 'web';
  secureAvailable = false;
  const note = { id: 'web-note', title: 'Browser note', content: 'local only', createdAt: 'today' };
  await storeMemoryNote(note, []);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-web-note')!), note);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-index-v1')!), [{ id: 'web-note' }]);
  assert.deepEqual((await readLocalState()).memories, [note]);

  const updated = { ...note, content: 'updated local only' };
  await updateMemoryNote(updated, [note]);
  assert.deepEqual(JSON.parse(local.get('oi-assistant-memory-web-note')!), updated);
  await removeMemoryNote('web-note', [updated]);
  assert.equal(local.has('oi-assistant-memory-web-note'), false);
});

test('clearLocalAssistantData removes chat, settings, memory index and every stored note', async () => {
  const { clearLocalAssistantData } = await storagePromise;
  reset();
  local.set('oi-assistant-chat-v1', '[]');
  local.set('oi-assistant-settings-v1', '{}');
  local.set('oi-assistant-memory-index-v1', JSON.stringify([{ id: 'one' }, { id: 'two' }]));
  secure.set('oi-assistant-memory-one', JSON.stringify({ id: 'one', title: 'One', createdAt: 'today', content: 'one content' }));
  secure.set('oi-assistant-memory-two', JSON.stringify({ id: 'two', title: 'Two', createdAt: 'today', content: 'two content' }));
  await clearLocalAssistantData();
  assert.deepEqual([...local.keys()], []);
  assert.deepEqual([...secure.keys()], []);
});
