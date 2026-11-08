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
const inputHandlers: Array<{ label: string; placeholder: string; onChangeText: (value: string) => void }> = [];
const telegramCalls: Array<{ method: string; args: unknown[] }> = [];
let telegramHandlers = {
  hasTelegramBot: async () => false,
  connectTelegramBot: async (_token: string) => ({ username: 'badboy_helper' }),
  disconnectTelegramBot: async () => {},
  checkTelegramMessages: async () => [] as any[],
  sendTelegramMessage: async (_text: string) => {},
};
const textContent = (node: any): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) return textContent((node.props as any).children);
  return '';
};
const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, disabled, onPress, onValueChange, onChangeText }: any) {
  if (tag === 'button' && typeof onPress === 'function') pressables.push({ label: accessibilityLabel ?? textContent(children), onPress });
  if (typeof onValueChange === 'function') switchHandlers.push({ label: accessibilityLabel ?? '', onValueChange });
  if (typeof onChangeText === 'function') inputHandlers.push({ label: accessibilityLabel ?? '', placeholder: placeholder ?? '', onChangeText });
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
    checkTelegramMessages: (...args: unknown[]) => { telegramCalls.push({ method: 'checkTelegramMessages', args }); return telegramHandlers.checkTelegramMessages(); }, connectTelegramBot: async () => ({}),
    disconnectTelegramBot: async () => {}, hasTelegramBot: async () => false,
    sendTelegramMessage: (...args: [string]) => { telegramCalls.push({ method: 'sendTelegramMessage', args }); return telegramHandlers.sendTelegramMessage(...args); },
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

test('Settings preserves every roadmap preference and all selectable theme choices', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

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


test('Settings saves the configured personality draft and uses the safe fallback for whitespace-only input', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  settingsUpdates.length = 0;
  settings.personality = '  Speak naturally in Bangla  ';
  renderToStaticMarkup(React.createElement(SettingsScreen));
  pressables.find((item) => item.label.includes('ব্যক্তিত্ব সংরক্ষণ'))?.onPress();
  assert.deepEqual(settingsUpdates.at(-1), { personality: 'Speak naturally in Bangla' });

  pressables.length = 0;
  settingsUpdates.length = 0;
  settings.personality = '   ';
  renderToStaticMarkup(React.createElement(SettingsScreen));
  pressables.find((item) => item.label.includes('ব্যক্তিত্ব সংরক্ষণ'))?.onPress();
  assert.deepEqual(settingsUpdates.at(-1), { personality: 'Warm, clear, and practical.' });
});

test('Settings updates online AI and auto-improve independently in both directions', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  switchHandlers.length = 0;
  settingsUpdates.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

  const onlineAI = switchHandlers.find((item) => item.label === 'অনলাইন AI');
  const autoImprove = switchHandlers.find((item) => item.label === 'পরামর্শ দেখান');
  assert.ok(onlineAI);
  assert.ok(autoImprove);
  onlineAI.onValueChange(false);
  autoImprove.onValueChange(true);
  onlineAI.onValueChange(true);
  autoImprove.onValueChange(false);
  assert.deepEqual(settingsUpdates, [
    { onlineAI: false },
    { autoImprove: true },
    { onlineAI: true },
    { autoImprove: false },
  ]);
});

test('Settings supports every theme choice and the default cloud voice reset', async () => {
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  settingsUpdates.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

  const themes = [
    ['Badboy Neon Blue', 'badboy'], ['Badboy Violet', 'neon'], ['Ocean Blue', 'ocean'],
    ['Purple', 'purple'], ['Emerald', 'emerald'], ['Sunset', 'sunset'], ['Light', 'light'],
  ] as const;
  for (const [label, theme] of themes) {
    const option = pressables.find((item) => item.label.includes(label));
    assert.ok(option, 'missing theme option: ' + label);
    option.onPress();
    assert.deepEqual(settingsUpdates.at(-1), { theme });
  }

  const cloudVoice = pressables.find((item) => item.label.includes('ডিফল্ট / Cloud voice'));
  assert.ok(cloudVoice);
  cloudVoice.onPress();
  assert.deepEqual(settingsUpdates.at(-1), { voiceIdentifier: null });
});

test('Settings can switch every Developer Agent engine option without starting an analysis', async () => {
  settings.developerMode = true;
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  settingsUpdates.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

  for (const [label, engine] of [['Badboy Native', 'native'], ['Copilot SDK', 'copilot'], ['Auto / Hybrid', 'auto']] as const) {
    const option = pressables.find((item) => item.label.includes(label));
    assert.ok(option, 'missing engine option: ' + label);
    option.onPress();
    assert.deepEqual(settingsUpdates.at(-1), { developerEngine: engine });
  }
});


test('Settings blank-input actions fail closed without calling services or changing settings', async () => {
  settings.developerMode = true;
  const { default: SettingsScreen } = await settingsScreenPromise;
  pressables.length = 0;
  settingsUpdates.length = 0;
  alerts.length = 0;
  renderToStaticMarkup(React.createElement(SettingsScreen));

  const guardedActions = [
    'টাস্ক রান করুন',
    'Expert Review চালাও',
    'Analyze with selected engine',
    'প্ল্যান ও ওয়ার্কফ্লো তৈরি করুন',
    'টোকেন সংরক্ষণ করুন',
    'Bot সংযোগ করুন',
  ];
  for (const label of guardedActions) {
    const action = pressables.find((item) => item.label.includes(label));
    assert.ok(action, 'missing guarded action: ' + label);
    action.onPress();
  }
  assert.deepEqual(settingsUpdates, []);
  assert.deepEqual(alerts, []);
});


function visit(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visit).join('');
  if (React.isValidElement(node)) {
    if (typeof node.type === 'function') return visit(node.type(node.props));
    return visit((node.props as any).children);
  }
  return '';
}

function createSettingsHookHarness(initialOverrides: Record<number, unknown> = {}) {
  const slots: unknown[] = [];
  let cursor = 0;
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'React hook dispatcher internals are available in the test runtime');
  const dispatcher = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = index in initialOverrides ? initialOverrides[index] : initial;
      return [
        slots[index],
        (next: unknown) => {
          slots[index] = typeof next === 'function'
            ? (next as (previous: unknown) => unknown)(slots[index])
            : next;
        },
      ];
    },
    useEffect() {},
  };
  const render = async () => {
    cursor = 0;
    pressables.length = 0;
    inputHandlers.length = 0;
    switchHandlers.length = 0;
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      const { default: SettingsScreen } = await settingsScreenPromise;
      return visit(SettingsScreen());
    } finally {
      internals.H = previous;
    }
  };
  return render;
}

function resetTelegramState() {
  inputHandlers.length = 0;
  telegramCalls.length = 0;
  alerts.length = 0;
  telegramHandlers = {
    hasTelegramBot: async () => false,
    connectTelegramBot: async (_token: string) => ({ username: 'badboy_helper' }),
    disconnectTelegramBot: async () => {},
    checkTelegramMessages: async () => [] as any[],
    sendTelegramMessage: async (_text: string) => {},
  };
}

test('Settings Telegram flow confirms connection, loads inbox, sends a message and disconnects', async () => {
  resetTelegramState();
  const render = createSettingsHookHarness();
  await render();
  const tokenInput = inputHandlers.find((item) => item.label === 'Telegram bot token');
  assert.ok(tokenInput, 'Telegram token input is rendered');
  tokenInput.onChangeText('  123:abc  ');
  await render();

  pressables.find((item) => item.label.includes('Bot সংযোগ করুন'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'Telegram bot সংযোগ করবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'সংযোগ করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let html = await render();
  assert.match(html, /সংযুক্ত · এই ডিভাইসে/);
  assert.deepEqual(telegramCalls.find((item) => item.method === 'connectTelegramBot')?.args, ['123:abc']);

  telegramHandlers.checkTelegramMessages = async () => [{
    id: 7, chatId: 88, sender: 'Owner', text: 'Hello Badboy', date: 100,
  }];
  pressables.find((item) => item.label.includes('Inbox দেখুন'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await render();
  assert.match(html, /Hello Badboy/);
  assert.equal(telegramCalls.filter((item) => item.method === 'checkTelegramMessages').length, 1);

  const messageInput = inputHandlers.find((item) => item.placeholder === 'Bot-এ বার্তা লিখুন');
  assert.ok(messageInput);
  messageInput.onChangeText('  Reply from Badboy  ');
  await render();
  pressables.find((item) => item.label.includes('অনুমতি দিয়ে পাঠান'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'Telegram-এ পাঠাবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'পাঠান')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(telegramCalls.find((item) => item.method === 'sendTelegramMessage')?.args, ['Reply from Badboy']);

  pressables.find((item) => item.label.includes('Bot বিচ্ছিন্ন করুন'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'Telegram সংযোগ বিচ্ছিন্ন করবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'বিচ্ছিন্ন করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await render();
  assert.match(html, /Bot token/);
  assert.equal(telegramCalls.filter((item) => item.method === 'disconnectTelegramBot').length, 1);
});

test('Settings Telegram actions surface connection, inbox, send and disconnect failures', async () => {
  resetTelegramState();
  const render = createSettingsHookHarness();
  await render();
  const tokenInput = inputHandlers.find((item) => item.label === 'Telegram bot token');
  assert.ok(tokenInput);
  tokenInput.onChangeText('valid-token');
  await render();

  // Telegram connected state is the third useState slot in SettingsScreen.
  const connectedRender = createSettingsHookHarness({ 2: true });
  let html = await connectedRender();
  telegramHandlers.checkTelegramMessages = async () => { throw new Error('inbox unavailable'); };
  await connectedRender();
  pressables.find((item) => item.label.includes('Inbox দেখুন'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await connectedRender();
  assert.match(html, /inbox unavailable/);

  telegramHandlers.sendTelegramMessage = async () => { throw new Error('send rejected'); };
  const messageInput = inputHandlers.find((item) => item.placeholder === 'Bot-এ বার্তা লিখুন');
  assert.ok(messageInput);
  messageInput.onChangeText('Message');
  await connectedRender();
  pressables.find((item) => item.label.includes('অনুমতি দিয়ে পাঠান'))?.onPress();
  await alerts.at(-1)?.buttons.find((button) => button.text === 'পাঠান')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await connectedRender();
  assert.match(html, /send rejected/);

  telegramHandlers.disconnectTelegramBot = async () => { throw new Error('secure storage failure'); };
  pressables.find((item) => item.label.includes('Bot বিচ্ছিন্ন করুন'))?.onPress();
  await alerts.at(-1)?.buttons.find((button) => button.text === 'বিচ্ছিন্ন করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await connectedRender();
  assert.match(html, /Bot token মুছতে সমস্যা হয়েছে/);
});
