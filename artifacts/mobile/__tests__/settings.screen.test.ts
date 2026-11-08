import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const hookState: unknown[] = [];
let hookCursor = 0;
const useMockState = <T,>(initial: T): [T, (next: T | ((current: T) => T)) => void] => {
  const index = hookCursor++;
  if (!(index in hookState)) hookState[index] = initial;
  return [
    hookState[index] as T,
    (next) => {
      const current = hookState[index] as T;
      hookState[index] = typeof next === 'function'
        ? (next as (value: T) => T)(current)
        : next;
    },
  ];
};
const resetHooks = () => { hookState.length = 0; hookCursor = 0; };
const pressables: Array<{ label: string; onPress: () => void }> = [];
const textInputs: Array<{ placeholder: string; onChangeText: (value: string) => void }> = [];
const shareCalls: string[] = [];
let streamReplyImpl = async (_prompt: string, _settings: unknown, onChunk: (chunk: string) => void) => {
  onChunk('Verified Expert Review report');
};
let streamDeveloperAnalysisImpl = async (
  _prompt: string, _context: string, _engine: string, onChunk: (chunk: string) => void,
) => {
  onChunk('Developer Agent analysis report');
  return { taskId: 'task-test-123' };
};
let inspectRepositoryImpl: () => Promise<any> = async () => ({
  status: 'not_connected', repository: 'shomratofficial007-spec/Badboy-VS-Versel-Ai',
  checkedAt: '2026-11-09T00:00:00.000Z', filePaths: [], note: 'GitHub PAT is not connected.',
});
let resolveEngineResult: { status: string; activeEngine?: string; reason?: string } = {
  status: 'available', activeEngine: 'native',
};
const switchHandlers: Array<{ label: string; onValueChange: (value: boolean) => void }> = [];
const alerts: Array<{ title: string; message: string; buttons: any[] }> = [];
const signOutCalls: string[] = [];
const clearChatCalls: string[] = [];
const settingsUpdates: unknown[] = [];
const textContent = (node: any): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) return textContent((node.props as any).children);
  return '';
};
const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled, onPress, onValueChange, onChangeText }: any) {
  if (tag === 'button' && typeof onPress === 'function') pressables.push({ label: accessibilityLabel ?? textContent(children), onPress });
  if (typeof onValueChange === 'function') switchHandlers.push({ label: accessibilityLabel ?? '', onValueChange });
  if (typeof onChangeText === 'function') textInputs.push({ placeholder: placeholder ?? '', onChangeText });
  return React.createElement(tag, {
    ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(typeof disabled === 'boolean' ? { disabled } : {}),
  }, children);
};
const colors = {
  card: '#111', border: '#333', background: '#000', primary: '#00d9ff',
  primaryForeground: '#000', foreground: '#fff', mutedForeground: '#aaa',
  input: '#444', secondary: '#222', destructive: '#f44',
  secondaryForeground: '#fff', accent: '#333', accentForeground: '#fff',
};
const roadmap = {
  webApp: false, apkWorkflow: false, selfDevelopment: false, autonomousAgent: false,
  projectBrain: false, autoQA: false, pluginMarketplace: false, providerManager: false,
  automationHub: false, releaseRecovery: false, integrations: false, localMemoryControls: false,
};
const settings = {
  personality: 'Helpful and concise', onlineAI: true, developerEngine: 'auto',
  theme: 'dark', autoImprove: false, developerMode: false,
  voiceProcessingConsent: false, voiceInputEnabled: true, voiceOutputEnabled: true,
  autoSpeakReplies: false, autoSubmitVoice: false, wakeWordEnabled: false,
  voiceLanguage: 'bn-BD', voiceIdentifier: null, roadmap,
};
mock.module('react', { defaultExport: React, namedExports: { useState: useMockState, useEffect: () => {} } });
mock.module('react-native', {
  namedExports: {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Alert: { alert: (title: string, message: string, buttons: any[] = []) => alerts.push({ title, message, buttons }) },
    Linking: { openURL: async () => {} },
    Platform: { OS: 'android' },
    Pressable: host('button'),
    ScrollView: host('main'),
    Share: { share: async ({ message }: { message: string }) => { shareCalls.push(message); return { action: 'dismissedAction' }; } },
    StyleSheet: { create: (value: unknown) => value },
    Switch: host('input'),
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
  namedExports: {
    useAssistant: () => ({
      settings, updateSettings: (value: unknown) => { settingsUpdates.push(value); }, clearChat: async () => { clearChatCalls.push('cleared'); },
      expertReviewDraft: '', clearExpertReviewDraft: () => {},
    }),
  },
});
mock.module('../context/OwnerAuthContext.tsx', {
  namedExports: { useOwnerAuth: () => ({ signOut: async () => { signOutCalls.push('signed-out'); } }) },
});
mock.module('../hooks/useColors.ts', { namedExports: { useColors: () => colors } });
mock.module('../lib/assistant/voice.ts', {
  namedExports: {
    VOICE_LANGUAGES: [
      { code: 'bn-BD', label: 'বাংলা (বাংলাদেশ)' },
      { code: 'en-US', label: 'English (US)' },
    ],
    getAvailableSpeechVoices: async () => [],
    speak: async () => {},
    stopSpeaking: async () => {},
  },
});
mock.module('../lib/assistant/api.ts', {
  namedExports: {
    streamDeveloperAnalysis: (...args: any[]) => streamDeveloperAnalysisImpl(...args),
    streamReply: (...args: any[]) => streamReplyImpl(...args),
  },
});
mock.module('../lib/assistant/developerData.ts', {
  namedExports: {
    addDeveloperProjectMemory: async () => {}, deleteDeveloperProjectMemory: async () => {},
    getAnalysisProjectNotes: async () => [], listDeveloperProjectMemory: async () => [],
    listDeveloperProjects: async () => [], listDeveloperTasks: async () => [],
    saveDeveloperProject: async () => {},
  },
});
mock.module('../lib/assistant/expertReview.ts', {
  namedExports: {
    buildExpertReviewPrompt: (pasted: string) => `Review request: ${pasted}`,
    inspectBadboyRepository: () => inspectRepositoryImpl(),
  },
});
mock.module('../lib/assistant/telegram.ts', {
  namedExports: {
    checkTelegramMessages: async () => [], connectTelegramBot: async () => ({}),
    disconnectTelegramBot: async () => {}, hasTelegramBot: async () => false,
    sendTelegramMessage: async () => {},
  },
});
mock.module('../lib/assistant/developer.ts', {
  namedExports: {
    createGitHubPullRequest: async () => ({}), executeAgentTask: async () => ({}),
    generateDevelopmentPlan: async () => ({}), getGitHubToken: async () => null,
    getPluginRegistryStatus: async () => ({}), getProjectBrainSummary: async () => ({}),
    removeGitHubToken: async () => {}, runAutoQASuite: async () => ({}),
    saveGitHubToken: async () => {},
  },
});
mock.module('../lib/assistant/developerEngine.ts', {
  namedExports: { resolveDeveloperEngine: () => resolveEngineResult },
});

const settingsScreenPromise = import('../app/(tabs)/settings');
const renderSettings = async () => {
  hookCursor = 0;
  const { default: SettingsScreen } = await settingsScreenPromise;
  return renderToStaticMarkup(React.createElement(SettingsScreen));
};
const settleAsyncHandlers = () => new Promise<void>((resolve) => setImmediate(resolve));

test('Settings screen renders existing voice, privacy, developer and account controls', async () => {
  resetHooks();
  settings.developerMode = false;
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  alerts.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  signOutCalls.length = 0;
  clearChatCalls.length = 0;
  const html = await renderSettings();
  assert.match(html, /BADBOY|Badboy/);
  assert.match(html, /Settings|সেটিংস|ব্যক্তিগত/);
  assert.match(html, /ভয়েস|Voice/);
  assert.match(html, /Wake Word|ওয়েক|Hey Badboy/i);
  assert.match(html, /Owner Sign Out/);
  assert.match(html, /চ্যাট ইতিহাস মুছুন/);
  switchHandlers.find((item) => item.label === 'Develop mode')?.onValueChange(true);
  assert.deepEqual(settingsUpdates, [{ developerMode: true }]);

  pressables.find((item) => item.label.includes('Owner Sign Out'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'Owner Login থেকে বের হবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'Sign Out')?.onPress();
  assert.deepEqual(signOutCalls, ['signed-out']);

  pressables.find((item) => item.label.includes('চ্যাট ইতিহাস মুছুন'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'চ্যাট ইতিহাস মুছবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'মুছুন')?.onPress();
  assert.deepEqual(clearChatCalls, ['cleared']);
});

test('Settings reveals Developer Agent and Project Brain controls when developer mode is enabled', async () => {
  resetHooks();
  settings.developerMode = true;
  const { default: SettingsScreen } = await settingsScreenPromise;
  const html = await renderSettings();
  assert.match(html, /Developer Agent|Developer Analysis|বিশ্লেষণ/);
  assert.match(html, /Project Brain|প্রজেক্ট ব্রেইন/);
  assert.match(html, /Auto QA|স্বয়ংক্রিয় পরীক্ষা/);
});

test('Settings exposes voice consent, input/output, auto-speak, auto-submit and wake-word controls', async () => {
  resetHooks();
  settings.developerMode = false;
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  await renderSettings();

  const enabledControls = [
    'Voice Processing Consent',
    'Voice Input',
    'Voice Output',
    'Auto Speak Replies',
    'Auto Submit Voice Input',
    'Hey Badboy Wake Word',
  ];
  for (const title of enabledControls) {
    const control = switchHandlers.find((item) => item.label === title);
    assert.ok(control, `missing Settings control: ${title}`);
    control.onValueChange(true);
  }
  assert.deepEqual(settingsUpdates.slice(0, 6), [
    { voiceProcessingConsent: true },
    { voiceInputEnabled: true },
    { voiceOutputEnabled: true },
    { autoSpeakReplies: true },
    { autoSubmitVoice: true },
    { wakeWordEnabled: true },
  ]);

  const english = pressables.find((item) => item.label.includes('English (US)'));
  assert.ok(english, 'English language option is rendered');
  english.onPress();
  assert.deepEqual(settingsUpdates.at(-1), {
    voiceLanguage: 'en-US',
    voiceIdentifier: null,
  });
});

test('Settings preserves every roadmap preference and all selectable theme choices', async () => {
  resetHooks();
  settings.developerMode = false;
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  await renderSettings();

  const roadmapControls = [
    'Web Development', 'App Development', 'Self Development',
    'Autonomous Task Manager', 'Project Brain', 'Auto QA & Testing',
    'Plugin Marketplace', 'AI Provider Manager', 'Automation Hub',
    'Release & Recovery', 'App Integrations', 'Advanced Memory',
  ];
  for (const title of roadmapControls) {
    const control = switchHandlers.find((item) => item.label === title);
    assert.ok(control, `missing roadmap preference: ${title}`);
    control.onValueChange(true);
  }
  assert.deepEqual(settingsUpdates, [
    { roadmap: { ...roadmap, webDevelopment: true } },
    { roadmap: { ...roadmap, appDevelopment: true } },
    { roadmap: { ...roadmap, selfDevelopment: true } },
    { roadmap: { ...roadmap, autonomousAgent: true } },
    { roadmap: { ...roadmap, projectBrain: true } },
    { roadmap: { ...roadmap, autoQA: true } },
    { roadmap: { ...roadmap, pluginMarketplace: true } },
    { roadmap: { ...roadmap, providerManager: true } },
    { roadmap: { ...roadmap, automationHub: true } },
    { roadmap: { ...roadmap, releaseRecovery: true } },
    { roadmap: { ...roadmap, integrations: true } },
    { roadmap: { ...roadmap, localMemoryControls: true } },
  ]);

  const ocean = pressables.find((item) => item.label.includes('Ocean Blue'));
  assert.ok(ocean, 'Ocean theme is available');
  ocean.onPress();
  assert.deepEqual(settingsUpdates.at(-1), { theme: 'ocean' });
});


test('Settings Expert Review streams a report from repository evidence and shares it', async () => {
  resetHooks();
  settings.developerMode = false;
  settings.onlineAI = true;
  pressables.length = 0;
  textInputs.length = 0;
  shareCalls.length = 0;
  inspectRepositoryImpl = async () => ({
    status: 'verified',
    repository: 'shomratofficial007-spec/Badboy-VS-Versel-Ai',
    defaultBranch: 'main',
    checkedAt: '2026-11-09T00:00:00.000Z',
    filePaths: ['artifacts/mobile/app/(tabs)/settings.tsx'],
    note: 'Repository paths checked live.',
  });
  streamReplyImpl = async (_prompt, _settings, onChunk) => { onChunk('Verified Expert Review report'); };

  await renderSettings();
  const reviewInput = textInputs.find((item) => item.placeholder.includes('Badboy-এর উত্তর'));
  assert.ok(reviewInput);
  reviewInput.onChangeText('Check whether this feature is safe.');
  await renderSettings();

  const runReview = pressables.find((item) => item.label.includes('Expert Review চালাও'));
  assert.ok(runReview);
  runReview.onPress();
  await settleAsyncHandlers();

  const html = await renderSettings();
  assert.match(html, /Repository: VERIFIED/);
  assert.match(html, /Verified Expert Review report/);
  const share = pressables.find((item) => item.label.includes('রিপোর্ট শেয়ার করুন'));
  assert.ok(share);
  share.onPress();
  await settleAsyncHandlers();
  assert.deepEqual(shareCalls, ['Verified Expert Review report']);
});

test('Settings Developer Agent runs Native analysis and displays task result', async () => {
  resetHooks();
  settings.developerMode = true;
  settings.onlineAI = true;
  settings.developerEngine = 'native';
  textInputs.length = 0;
  pressables.length = 0;
  resolveEngineResult = { status: 'available', activeEngine: 'native' };
  streamDeveloperAnalysisImpl = async (_prompt, context, engine, onChunk) => {
    assert.equal(engine, 'native');
    assert.match(context, /developerAgentProjectId/);
    onChunk('Developer Agent analysis report');
    return { taskId: 'task-test-123' };
  };

  await renderSettings();
  const promptInput = textInputs.find((item) => item.placeholder.includes('Developer Mode'));
  assert.ok(promptInput);
  promptInput.onChangeText('Review the next safe implementation steps.');
  await renderSettings();
  const analyze = pressables.find((item) => item.label.includes('Analyze with selected engine'));
  assert.ok(analyze);
  analyze.onPress();
  await settleAsyncHandlers();

  const html = await renderSettings();
  assert.match(html, /Selected execution: Badboy Native/);
  assert.match(html, /Task ID: task-test-123/);
  assert.match(html, /Developer Agent analysis report/);
});

test('Settings blocks unavailable Copilot runtime and shows its reason', async () => {
  resetHooks();
  settings.developerMode = true;
  settings.onlineAI = true;
  settings.developerEngine = 'copilot';
  textInputs.length = 0;
  pressables.length = 0;
  resolveEngineResult = { status: 'unavailable', reason: 'Copilot SDK runtime is not configured.' };

  await renderSettings();
  const promptInput = textInputs.find((item) => item.placeholder.includes('Developer Mode'));
  assert.ok(promptInput);
  promptInput.onChangeText('Analyze the project.');
  await renderSettings();
  const analyze = pressables.find((item) => item.label.includes('Analyze with selected engine'));
  assert.ok(analyze);
  analyze.onPress();
  await settleAsyncHandlers();

  const html = await renderSettings();
  assert.match(html, /GitHub Copilot SDK · not configured/);
  assert.match(html, /Copilot SDK runtime is not configured/);
});
