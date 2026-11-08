import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const pressables: Array<{ label: string; onPress: () => void }> = [];
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
const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled, onPress, onValueChange }: any) {
  if (tag === 'button' && typeof onPress === 'function') pressables.push({ label: accessibilityLabel ?? textContent(children), onPress });
  if (typeof onValueChange === 'function') switchHandlers.push({ label: accessibilityLabel ?? '', onValueChange });
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
mock.module('react-native', {
  namedExports: {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Alert: { alert: (title: string, message: string, buttons: any[] = []) => alerts.push({ title, message, buttons }) },
    Linking: { openURL: async () => {} },
    Platform: { OS: 'android' },
    Pressable: host('button'),
    ScrollView: host('main'),
    Share: { share: async () => ({ action: 'dismissedAction' }) },
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
  namedExports: { streamDeveloperAnalysis: async () => {}, streamReply: async () => {} },
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
  namedExports: { buildExpertReviewPrompt: () => '', inspectBadboyRepository: async () => ({}) },
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
  namedExports: { resolveDeveloperEngine: () => ({ engine: 'native', fallback: false }) },
});

const settingsScreenPromise = import('../app/(tabs)/settings');

test('Settings screen renders existing voice, privacy, developer and account controls', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  alerts.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  signOutCalls.length = 0;
  clearChatCalls.length = 0;
  const html = renderToStaticMarkup(React.createElement(SettingsScreen));
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
  settings.developerMode = true;
  const { default: SettingsScreen } = await settingsScreenPromise;
  const html = renderToStaticMarkup(React.createElement(SettingsScreen));
  assert.match(html, /Developer Agent|Developer Analysis|বিশ্লেষণ/);
  assert.match(html, /Project Brain|প্রজেক্ট ব্রেইন/);
  assert.match(html, /Auto QA|স্বয়ংক্রিয় পরীক্ষা/);
});

test('Settings exposes voice consent, input/output, auto-speak, auto-submit and wake-word controls', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

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
