import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const stateStore: unknown[] = [];
const pendingEffects: Array<() => void> = [];
let hookCursor = 0;
let loadedState: any = { messages: [], settings: {}, memories: [] };
let loadError: Error | null = null;
let memoryWriteError: Error | null = null;
const calls: Array<{ name: string; value?: any }> = [];
const context: { Provider: object; value: any } = { Provider: {}, value: null };

const ReactMock = {
  createElement: (type: unknown, props: any, children?: unknown) => {
    if (type === context.Provider) context.value = props.value;
    return { type, props: { ...props, children } };
  },
};
mock.module('react/jsx-runtime', {
  namedExports: {
    jsx: (type: unknown, props: any) => {
      if (type === context.Provider) context.value = props.value;
      return { type, props };
    },
    jsxs: (type: unknown, props: any) => {
      if (type === context.Provider) context.value = props.value;
      return { type, props };
    },
    jsxDEV: (type: unknown, props: any) => {
      if (type === context.Provider) context.value = props.value;
      return { type, props };
    },
  },
});
mock.module('react', {
  defaultExport: ReactMock,
  namedExports: {
    createContext: () => context,
    useContext: (value: typeof context) => value.value,
    useState: (initial: unknown) => {
      const index = hookCursor++;
      if (!(index in stateStore)) stateStore[index] = initial;
      return [
        stateStore[index],
        (next: unknown) => {
          stateStore[index] = typeof next === 'function'
            ? (next as (current: unknown) => unknown)(stateStore[index])
            : next;
        },
      ];
    },
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => { pendingEffects.push(effect); },
    useMemo: (factory: () => unknown) => factory(),
  },
});
mock.module('@/lib/assistant/storage', {
  namedExports: {
    readLocalState: async () => {
      calls.push({ name: 'readLocalState' });
      if (loadError) throw loadError;
      return loadedState;
    },
    persistMessages: async (value: unknown) => { calls.push({ name: 'persistMessages', value }); },
    persistSettings: async (value: unknown) => { calls.push({ name: 'persistSettings', value }); },
    storeMemoryNote: async (note: unknown, memories: unknown) => { if (memoryWriteError) throw memoryWriteError; calls.push({ name: 'storeMemoryNote', value: { note, memories } }); },
    updateMemoryNote: async (note: unknown, memories: any[]) => {
      calls.push({ name: 'updateMemoryNote', value: { note, memories } });
      return memories.map((item) => item.id === (note as any).id ? note : item);
    },
    removeMemoryNote: async (id: string, memories: unknown) => { calls.push({ name: 'removeMemoryNote', value: { id, memories } }); },
  },
});

const modulePromise = import('./AssistantContext');

function renderProvider() {
  hookCursor = 0;
  pendingEffects.length = 0;
  const { AssistantProvider } = requireModule;
  AssistantProvider({ children: 'child' });
  return context.value;
}
let requireModule: any;
async function loadModule() {
  requireModule ??= await modulePromise;
  return requireModule;
}
async function flushEffects() {
  const effects = pendingEffects.splice(0);
  for (const effect of effects) effect();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function resetHarness() {
  stateStore.length = 0;
  pendingEffects.length = 0;
  hookCursor = 0;
  context.value = null;
  loadedState = { messages: [], settings: {}, memories: [] };
  loadError = null;
  memoryWriteError = null;
  calls.length = 0;
}

test('AssistantProvider restores local messages, settings and memory and exposes merged defaults', async () => {
  resetHarness();
  await loadModule();
  loadedState = {
    messages: [{ id: 'm1', role: 'user', content: 'হ্যালো', createdAt: 'now' }],
    settings: { theme: 'ocean', voiceLanguage: 'en-US', roadmap: { autoQA: false } },
    memories: [{ id: 'n1', title: 'note', content: 'private', createdAt: 'today' }],
  };
  const initial = renderProvider();
  assert.equal(initial.ready, false);
  assert.equal(initial.settings.theme, 'badboy');
  await flushEffects();
  const restored = renderProvider();
  assert.equal(restored.ready, true);
  assert.equal(restored.messages[0].content, 'হ্যালো');
  assert.equal(restored.settings.theme, 'ocean');
  assert.equal(restored.settings.voiceLanguage, 'en-US');
  assert.equal(restored.settings.roadmap.autoQA, false);
  assert.equal(restored.settings.roadmap.projectBrain, true);
  assert.equal(restored.memories[0].content, 'private');
  assert.equal(restored.storageError, null);
  await flushEffects();
  assert.ok(calls.some((call) => call.name === 'persistMessages'));
  assert.ok(calls.some((call) => call.name === 'persistSettings'));
});

test('useAssistant rejects access outside AssistantProvider', async () => {
  resetHarness();
  const { useAssistant } = await loadModule();
  assert.throws(() => useAssistant(), /useAssistant must be used inside AssistantProvider/);
});

test('AssistantProvider reports local storage restore failures without discarding defaults', async () => {
  resetHarness();
  await loadModule();
  loadError = new Error('disk unavailable');
  renderProvider();
  await flushEffects();
  const value = renderProvider();
  assert.equal(value.ready, true);
  assert.match(value.storageError, /Local storage could not be opened/);
  assert.deepEqual(value.messages, []);
  assert.equal(value.settings.theme, 'badboy');
});

test('AssistantContext callbacks persist chat/settings and create, update, delete local memory', async () => {
  resetHarness();
  const { useAssistant } = await loadModule();
  renderProvider();
  await flushEffects();
  let value = renderProvider();
  assert.equal(useAssistant(), value);

  const messages = [{ id: 'm2', role: 'assistant', content: 'উত্তর', createdAt: 'now' }];
  value.setMessages(messages);
  value.updateSettings({ theme: 'purple', wakeWordEnabled: false });
  value.setExpertReviewDraft('review this');
  await value.saveMemory('  শিরোনাম  ', '  গোপন তথ্য  ');
  const saved = calls.find((call) => call.name === 'storeMemoryNote')?.value;
  assert.equal(saved.note.title, 'শিরোনাম');
  assert.equal(saved.note.content, 'গোপন তথ্য');
  assert.equal(saved.memories.length, 0, 'storage receives only pre-existing notes; it appends the new note once');

  const note = { ...saved.note };
  value = renderProvider();
  assert.equal(value.expertReviewDraft, 'review this');
  await value.updateMemory(note.id, 'নতুন শিরোনাম', 'নতুন তথ্য');
  const updated = calls.find((call) => call.name === 'updateMemoryNote')?.value.note;
  assert.equal(updated.title, 'নতুন শিরোনাম');
  assert.equal(updated.content, 'নতুন তথ্য');
  await assert.rejects(value.updateMemory('missing', 'title', 'content'), /Memory note not found/);
  value = renderProvider();
  await value.deleteMemory(note.id);
  assert.ok(calls.some((call) => call.name === 'removeMemoryNote' && call.value.id === note.id));
  await value.clearChat();
  assert.ok(calls.some((call) => call.name === 'persistMessages' && call.value.length === 0));
  value = renderProvider();
  value.clearExpertReviewDraft();
  assert.equal(typeof value.clearExpertReviewDraft, 'function');
});

test('AssistantContext update and draft callbacks remain callable and save errors propagate', async () => {
  resetHarness();
  const { useAssistant } = await loadModule();
  renderProvider();
  await flushEffects();
  const value = renderProvider();
  value.updateSettings({ onlineAI: false });
  value.setExpertReviewDraft('draft');
  assert.equal(typeof useAssistant().updateSettings, 'function');
  const { saveMemory } = value;
  assert.equal(typeof saveMemory, 'function');
  memoryWriteError = new Error('local memory write failed');
  await assert.rejects(saveMemory('title', 'content'), /local memory write failed/);
});
