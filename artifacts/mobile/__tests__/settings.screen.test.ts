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
const inputHandlers: Array<{ label: string; placeholder: string; value?: string; onChangeText: (value: string) => void }> = [];
let expertReviewDraftValue = '';
let clearExpertReviewDraftCalls = 0;
const telegramCalls: Array<{ method: string; args: unknown[] }> = [];
const developerDataCalls: Array<{ method: string; args: unknown[] }> = [];
const developerAnalysisCalls: unknown[][] = [];
const agentTaskCalls: unknown[][] = [];
const githubCalls: Array<{ method: string; args: unknown[] }> = [];
const openedUrls: string[] = [];
let agentTaskHandler = async (_prompt: string, _online: boolean, _confirmed: boolean) => ({
  state: 'completed', prompt: 'Search YouTube', summary: 'Search complete',
  detectedLanguage: 'en', requiresInternet: true,
  outputData: { action: 'open_youtube_search', query: 'Badboy AI' }, logs: ['Opened search'], latencyMs: 15,
});
let githubHandlers = {
  saveGitHubToken: async (_token: string) => {},
  removeGitHubToken: async () => {},
  createGitHubPullRequest: async (_input: any) => ({ success: true, prUrl: 'https://github.com/example/repo/pull/88', prNumber: 88, summary: 'PR ready', logs: ['Branch checked', 'PR created'] }),
  generateDevelopmentPlan: (_prompt: string) => ({
    title: 'Settings test plan', category: 'web', featureDescription: 'Improve Settings',
    filesToModify: ['settings.tsx'], tasks: [{ id: 'task-1', title: 'Add tests' }],
    securityNotes: 'No deploy without approval', branchName: 'test/settings-coverage',
  }),
};
let developerAnalysisHandler = async (
  _prompt: string, _context: string, _engine: string, onChunk: (chunk: string) => void,
) => {
  onChunk('Native analysis result');
  return { taskId: 'task-99' };
};
let developerDataHandlers = {
  listDeveloperTasks: async () => [] as any[],
  listDeveloperProjects: async () => [] as any[],
  saveDeveloperProject: async (_input: any) => ({ projectId: 'project-1', projectKey: 'badboy-main', name: 'Badboy' }),
  listDeveloperProjectMemory: async (_projectId: string) => [] as any[],
  addDeveloperProjectMemory: async (_input: any) => ({ memoryId: 'memory-2', saved: true }),
  deleteDeveloperProjectMemory: async (_memoryId: string) => ({ deleted: true }),
};
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
const host = (tag: string) => function Host({ children, accessibilityLabel, placeholder, value, disabled, onPress, onValueChange, onChangeText }: any) {
  if (tag === 'button' && typeof onPress === 'function') pressables.push({ label: accessibilityLabel ?? textContent(children), onPress });
  if (typeof onValueChange === 'function') switchHandlers.push({ label: accessibilityLabel ?? '', onValueChange });
  if (typeof onChangeText === 'function') inputHandlers.push({ label: accessibilityLabel ?? '', placeholder: placeholder ?? '', value, onChangeText });
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
    Linking: { openURL: async (url: string) => { openedUrls.push(url); } },
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
      expertReviewDraft: expertReviewDraftValue, clearExpertReviewDraft: () => { clearExpertReviewDraftCalls += 1; },
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
    streamDeveloperAnalysis: (...args: [string, string, string, (chunk: string) => void]) => {
      developerAnalysisCalls.push(args);
      return developerAnalysisHandler(...args);
    },
    streamReply: async () => {},
  },
});
mock.module('../lib/assistant/developerData.ts', {
  namedExports: {
    addDeveloperProjectMemory: (...args: [any]) => { developerDataCalls.push({ method: 'addDeveloperProjectMemory', args }); return developerDataHandlers.addDeveloperProjectMemory(...args); },
    deleteDeveloperProjectMemory: (...args: [string]) => { developerDataCalls.push({ method: 'deleteDeveloperProjectMemory', args }); return developerDataHandlers.deleteDeveloperProjectMemory(...args); },
    getAnalysisProjectNotes: (memories: any[]) => memories
      .filter((memory) => memory.privacy_level !== 'sensitive')
      .map((memory) => ({ category: memory.category, content: memory.content, privacyLevel: memory.privacy_level })),
    listDeveloperProjectMemory: (...args: [string]) => { developerDataCalls.push({ method: 'listDeveloperProjectMemory', args }); return developerDataHandlers.listDeveloperProjectMemory(...args); },
    listDeveloperProjects: (...args: unknown[]) => { developerDataCalls.push({ method: 'listDeveloperProjects', args }); return developerDataHandlers.listDeveloperProjects(); },
    listDeveloperTasks: (...args: unknown[]) => { developerDataCalls.push({ method: 'listDeveloperTasks', args }); return developerDataHandlers.listDeveloperTasks(); },
    saveDeveloperProject: (...args: [any]) => { developerDataCalls.push({ method: 'saveDeveloperProject', args }); return developerDataHandlers.saveDeveloperProject(...args); },
  },
});
mock.module('../lib/assistant/expertReview.ts', {
  namedExports: { buildExpertReviewPrompt: () => '', inspectBadboyRepository: async () => ({}) },
});
mock.module('../lib/assistant/telegram.ts', {
  namedExports: {
    checkTelegramMessages: (...args: unknown[]) => { telegramCalls.push({ method: 'checkTelegramMessages', args }); return telegramHandlers.checkTelegramMessages(); },
    connectTelegramBot: (...args: [string]) => { telegramCalls.push({ method: 'connectTelegramBot', args }); return telegramHandlers.connectTelegramBot(...args); },
    disconnectTelegramBot: (...args: unknown[]) => { telegramCalls.push({ method: 'disconnectTelegramBot', args }); return telegramHandlers.disconnectTelegramBot(); },
    hasTelegramBot: (...args: unknown[]) => { telegramCalls.push({ method: 'hasTelegramBot', args }); return telegramHandlers.hasTelegramBot(); },
    sendTelegramMessage: (...args: [string]) => { telegramCalls.push({ method: 'sendTelegramMessage', args }); return telegramHandlers.sendTelegramMessage(...args); },
  },
});
mock.module('../lib/assistant/developer.ts', {
  namedExports: {
    createGitHubPullRequest: (...args: [any]) => { githubCalls.push({ method: 'createGitHubPullRequest', args }); return githubHandlers.createGitHubPullRequest(...args); },
    executeAgentTask: (...args: [string, boolean, boolean]) => { agentTaskCalls.push(args); return agentTaskHandler(...args); },
    generateDevelopmentPlan: (...args: [string]) => { githubCalls.push({ method: 'generateDevelopmentPlan', args }); return githubHandlers.generateDevelopmentPlan(...args); },
    getGitHubToken: async () => null,
    getPluginRegistryStatus: async () => ({}), getProjectBrainSummary: () => ({ name: 'Badboy AI', architecture: 'Worker + Expo', frameworks: ['Expo'], apiEndpoints: [], knownLimitations: [] }),
    removeGitHubToken: (...args: unknown[]) => { githubCalls.push({ method: 'removeGitHubToken', args }); return githubHandlers.removeGitHubToken(); },
    runAutoQASuite: async () => ({}),
    saveGitHubToken: (...args: [string]) => { githubCalls.push({ method: 'saveGitHubToken', args }); return githubHandlers.saveGitHubToken(...args); },
  },
});
mock.module('../lib/assistant/developerEngine.ts', {
  namedExports: { resolveDeveloperEngine: (engine: string) => engine === 'copilot' ? { status: 'unavailable', reason: 'Copilot runtime unavailable' } : { status: 'available', activeEngine: 'native' } },
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

function createSettingsHookHarness(initialOverrides: Record<number, unknown> = {}, options: { runEffects?: boolean } = {}) {
  const slots: unknown[] = [];
  let cursor = 0;
  let effectsExecuted = false;
  const effects: Array<() => unknown> = [];
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
    useEffect(effect: () => unknown) { if (!effectsExecuted) effects.push(effect); },
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
      const html = visit(SettingsScreen());
      if (options.runEffects && !effectsExecuted) {
        effectsExecuted = true;
        for (const effect of effects) effect();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return html;
    } finally {
      internals.H = previous;
    }
  };
  return render;
}

function resetTelegramState() {
  inputHandlers.length = 0;
  developerDataCalls.length = 0;
  developerAnalysisCalls.length = 0;
  agentTaskCalls.length = 0;
  githubCalls.length = 0;
  openedUrls.length = 0;
  agentTaskHandler = async (_prompt, _online, _confirmed) => ({
    state: 'completed', prompt: 'Search YouTube', summary: 'Search complete',
    detectedLanguage: 'en', requiresInternet: true,
    outputData: { action: 'open_youtube_search', query: 'Badboy AI' }, logs: ['Opened search'], latencyMs: 15,
  });
  githubHandlers = {
    saveGitHubToken: async (_token) => {},
    removeGitHubToken: async () => {},
    createGitHubPullRequest: async (_input) => ({ success: true, prUrl: 'https://github.com/example/repo/pull/88', prNumber: 88, summary: 'PR ready', logs: ['Branch checked', 'PR created'] }),
    generateDevelopmentPlan: (_prompt) => ({
      title: 'Settings test plan', category: 'web', featureDescription: 'Improve Settings',
      filesToModify: ['settings.tsx'], tasks: [{ id: 'task-1', title: 'Add tests' }],
      securityNotes: 'No deploy without approval', branchName: 'test/settings-coverage',
    }),
  };
  expertReviewDraftValue = '';
  clearExpertReviewDraftCalls = 0;
  developerAnalysisHandler = async (_prompt, _context, _engine, onChunk) => { onChunk('Native analysis result'); return { taskId: 'task-99' }; };
  developerDataHandlers = {
    listDeveloperTasks: async () => [],
    listDeveloperProjects: async () => [],
    saveDeveloperProject: async (_input: any) => ({ projectId: 'project-1', projectKey: 'badboy-main', name: 'Badboy' }),
    listDeveloperProjectMemory: async (_projectId: string) => [],
    addDeveloperProjectMemory: async (_input: any) => ({ memoryId: 'memory-2', saved: true }),
    deleteDeveloperProjectMemory: async (_memoryId: string) => ({ deleted: true }),
  };
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
  assert.match(html, /সংযুক্ত · @badboy_helper/);
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
  assert.match(html, /নিজের bot token দিন/);
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


const sampleProjectBrain = {
  name: 'Badboy AI',
  architecture: 'Cloudflare Worker + Expo mobile app',
  frameworks: ['React Native', 'TypeScript'],
  apiEndpoints: ['/api/assistant/chat'],
  knownLimitations: ['Copilot runtime remains disabled'],
};
const sampleProjectMemory = {
  memory_id: 'memory-1', owner_id: 'owner-1', project_id: 'project-1',
  category: 'project-note', content: 'Keep the existing voice features',
  source: 'owner', privacy_level: 'private', created_at: '2026-11-08', updated_at: '2026-11-08',
};

test('Settings Project Brain saves its real project summary into owner-scoped D1 and refreshes project list', async () => {
  resetTelegramState();
  developerDataHandlers.saveDeveloperProject = async (input) => ({
    projectId: 'project-1', projectKey: input.projectKey, name: input.name,
  });
  developerDataHandlers.listDeveloperProjects = async () => [{
    project_id: 'project-1', owner_id: 'owner-1', project_key: 'badboy-main',
    name: 'Badboy AI', summary: 'Existing project', created_at: '2026-11-08', updated_at: '2026-11-08',
  }];
  const render = createSettingsHookHarness({ 14: 'brain', 24: sampleProjectBrain });
  await render();
  pressables.find((item) => item.label.includes('Private D1-এ Project Brain সংরক্ষণ'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = developerDataCalls.find((item) => item.method === 'saveDeveloperProject');
  assert.deepEqual(saved?.args, [{
    projectKey: 'badboy-main',
    name: 'Badboy AI',
    summary: 'Cloudflare Worker + Expo mobile app\\nReact Native\\nTypeScript\\n/api/assistant/chat\\nCopilot runtime remains disabled',
  }]);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperProjects').length, 1);
});

test('Settings saves private project notes trimmed and reloads the selected project memory', async () => {
  resetTelegramState();
  developerDataHandlers.listDeveloperProjectMemory = async (projectId) => {
    assert.equal(projectId, 'project-1');
    return [sampleProjectMemory];
  };
  const render = createSettingsHookHarness({
    14: 'brain', 24: sampleProjectBrain, 41: 'project-1', 43: '  Preserve the original wake-word flow  ',
  });
  await render();
  pressables.find((item) => item.label.includes('Private Note সংরক্ষণ'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(developerDataCalls.find((item) => item.method === 'addDeveloperProjectMemory')?.args, [{
    projectId: 'project-1', category: 'project-note',
    content: 'Preserve the original wake-word flow', source: 'owner', privacyLevel: 'private',
  }]);
  const html = await render();
  assert.match(html, /Keep the existing voice features/);
});

test('Settings deletes only the selected private project note and handles D1 failures', async () => {
  resetTelegramState();
  const render = createSettingsHookHarness({
    14: 'brain', 24: sampleProjectBrain, 41: 'project-1', 42: [sampleProjectMemory],
  });
  await render();
  pressables.find((item) => item.label === 'Delete private project note')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(developerDataCalls.find((item) => item.method === 'deleteDeveloperProjectMemory')?.args, ['memory-1']);
  assert.doesNotMatch(await render(), /Keep the existing voice features/);

  resetTelegramState();
  developerDataHandlers.saveDeveloperProject = async () => { throw new Error('D1 project write failed'); };
  const saveFailure = createSettingsHookHarness({ 14: 'brain', 24: sampleProjectBrain });
  await saveFailure();
  pressables.find((item) => item.label.includes('Private D1-এ Project Brain সংরক্ষণ'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(await saveFailure(), /D1 project write failed/);

  resetTelegramState();
  developerDataHandlers.addDeveloperProjectMemory = async () => { throw new Error('D1 memory write failed'); };
  const memoryFailure = createSettingsHookHarness({
    14: 'brain', 24: sampleProjectBrain, 41: 'project-1', 43: 'Private note',
  });
  await memoryFailure();
  pressables.find((item) => item.label.includes('Private Note সংরক্ষণ'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(await memoryFailure(), /D1 memory write failed/);

  resetTelegramState();
  developerDataHandlers.deleteDeveloperProjectMemory = async () => { throw new Error('D1 memory delete failed'); };
  const deleteFailure = createSettingsHookHarness({
    14: 'brain', 24: sampleProjectBrain, 41: 'project-1', 42: [sampleProjectMemory],
  });
  await deleteFailure();
  pressables.find((item) => item.label === 'Delete private project note')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(await deleteFailure(), /D1 memory delete failed/);
});


test('Settings Developer Agent sends private but never sensitive Project Brain notes to Native analysis', async () => {
  resetTelegramState();
  settings.developerMode = true;
  settings.developerEngine = 'native';
  developerDataHandlers.listDeveloperProjectMemory = async () => [
    { ...sampleProjectMemory, content: 'Keep existing voice behavior', privacy_level: 'private' },
    { ...sampleProjectMemory, memory_id: 'memory-sensitive', content: 'Sensitive owner data', privacy_level: 'sensitive' },
  ];
  developerDataHandlers.listDeveloperTasks = async () => [{
    task_id: 'task-99', owner_id: 'owner-1', status: 'completed', engine: 'native',
    title: 'Review Settings', summary: 'Analysis finished', parent_task_id: null,
    created_at: '2026-11-08', updated_at: '2026-11-08',
  }];
  const render = createSettingsHookHarness({ 32: 'Review Settings coverage', 41: 'project-1' });
  await render();
  pressables.find((item) => item.label.includes('Analyze with selected engine'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const html = await render();
  assert.match(html, /Native analysis result/);
  assert.match(html, /Task ID: task-99/);
  assert.equal(developerAnalysisCalls.length, 1);
  assert.equal(developerAnalysisCalls[0][2], 'native');
  const context = JSON.parse(String(developerAnalysisCalls[0][1]));
  assert.deepEqual(context.privateProjectNotes, [{
    category: 'project-note', content: 'Keep existing voice behavior', privacyLevel: 'private',
  }]);
  assert.doesNotMatch(String(developerAnalysisCalls[0][1]), /Sensitive owner data/);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperTasks').length, 1);
});

test('Settings Developer Agent fails closed on unavailable Copilot and reports empty or failed Native analysis', async () => {
  resetTelegramState();
  settings.developerMode = true;
  settings.developerEngine = 'copilot';
  const copilotRender = createSettingsHookHarness({ 32: 'Review Settings' });
  await copilotRender();
  pressables.find((item) => item.label.includes('Analyze with selected engine'))?.onPress();
  let html = await copilotRender();
  assert.match(html, /Copilot runtime unavailable/);
  assert.equal(developerAnalysisCalls.length, 0);

  resetTelegramState();
  settings.developerEngine = 'native';
  developerAnalysisHandler = async () => ({ taskId: 'task-empty' });
  const emptyRender = createSettingsHookHarness({ 32: 'Review Settings' });
  await emptyRender();
  pressables.find((item) => item.label.includes('Analyze with selected engine'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await emptyRender();
  assert.match(html, /বিশ্লেষণ থেকে কোনো রিপোর্ট পাওয়া যায়নি/);

  resetTelegramState();
  developerDataHandlers.listDeveloperProjectMemory = async () => { throw new Error('Project notes unavailable'); };
  const errorRender = createSettingsHookHarness({ 32: 'Review Settings', 41: 'project-1' });
  await errorRender();
  pressables.find((item) => item.label.includes('Analyze with selected engine'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await errorRender();
  assert.match(html, /Project notes unavailable/);
  assert.equal(developerAnalysisCalls.length, 0);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperTasks').length, 1);
});

test('Settings Developer task history refresh displays records and surfaces D1 read errors', async () => {
  resetTelegramState();
  settings.developerMode = true;
  developerDataHandlers.listDeveloperTasks = async () => [{
    task_id: 'task-history-1', owner_id: 'owner-1', status: 'completed', engine: 'native',
    title: 'Settings regression suite', summary: null, parent_task_id: null,
    created_at: '2026-11-08', updated_at: '2026-11-08',
  }];
  const render = createSettingsHookHarness();
  await render();
  const refreshTasks = pressables.find((item) => item.label.includes('Refresh'));
  assert.ok(refreshTasks, 'Developer task history refresh action is rendered');
  refreshTasks.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperTasks').length, 1);
  assert.match(await render(), /Settings regression suite/);

  resetTelegramState();
  developerDataHandlers.listDeveloperTasks = async () => { throw new Error('Task history D1 unavailable'); };
  const failureRender = createSettingsHookHarness();
  await failureRender();
  const refreshFailure = pressables.find((item) => item.label.includes('Refresh'));
  assert.ok(refreshFailure, 'Developer task history refresh action is rendered for error case');
  refreshFailure.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperTasks').length, 1);
  assert.match(await failureRender(), /Task history D1 unavailable/);
});


test('Settings lifecycle loads the owner integrations, handles storage and memory read failures, and consumes Expert Review drafts', async () => {
  resetTelegramState();
  settings.developerMode = true;
  expertReviewDraftValue = 'Review this saved chat draft';
  telegramHandlers.hasTelegramBot = async () => { throw new Error('secure storage unavailable'); };
  developerDataHandlers.listDeveloperTasks = async () => { throw new Error('task list unavailable'); };
  developerDataHandlers.listDeveloperProjects = async () => { throw new Error('project list unavailable'); };
  developerDataHandlers.listDeveloperProjectMemory = async () => { throw new Error('project memory unavailable'); };

  const render = createSettingsHookHarness({
    14: 'brain',
    24: sampleProjectBrain,
    41: 'project-1',
  }, { runEffects: true });
  await render();
  const html = await render();
  assert.match(html, /ফোনের নিরাপদ স্টোরেজ পরীক্ষা করা যায়নি/);
  assert.match(html, /project memory unavailable/);
  const reviewInput = inputHandlers.find((item) => item.placeholder.includes('Badboy-এর উত্তর'));
  assert.ok(reviewInput);
  assert.equal(reviewInput.value, 'Review this saved chat draft');
  assert.equal(clearExpertReviewDraftCalls, 1);
  assert.equal(telegramCalls.filter((item) => item.method === 'hasTelegramBot').length, 1);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperTasks').length, 1);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperProjects').length, 1);
  assert.equal(developerDataCalls.filter((item) => item.method === 'listDeveloperProjectMemory').length, 1);
});


const samplePlan = {
  title: 'Settings test plan', category: 'web', featureDescription: 'Improve Settings',
  filesToModify: ['settings.tsx'], tasks: [{ id: 'task-1', title: 'Add tests' }],
  securityNotes: 'No deploy without approval', branchName: 'test/settings-coverage',
};

test('Settings Agent renders permission and completed task states and opens only the confirmed YouTube action', async () => {
  resetTelegramState();
  settings.developerMode = true;
  const pending = {
    state: 'permission_pending', prompt: 'Search YouTube', summary: 'Waiting for approval',
    detectedLanguage: 'en', requiresInternet: true, confirmationMessage: 'Owner approval required',
    logs: ['Waiting for owner'],
  };
  const render = createSettingsHookHarness({ 12: pending });
  let html = await render();
  assert.match(html, /Owner approval required/);
  assert.match(html, /Waiting for owner/);
  pressables.find((item) => item.label.includes('অনুমতি দিন ও সম্পাদন করুন'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await render();
  assert.match(html, /টাস্ক স্ট্যাটাস: COMPLETED/);
  assert.deepEqual(agentTaskCalls, [['Search YouTube', true, true]]);
  assert.deepEqual(openedUrls, ['https://www.youtube.com/results?search_query=Badboy%20AI']);

  const completed = {
    state: 'completed', prompt: 'Offline task', summary: 'Finished offline',
    detectedLanguage: 'bn', requiresInternet: false, logs: [],
  };
  html = await createSettingsHookHarness({ 12: completed })();
  assert.match(html, /Finished offline/);
  assert.doesNotMatch(html, /অনুমতি দিন ও সম্পাদন করুন/);
  assert.doesNotMatch(html, /ONLINE/);
});

test('Settings creates a trimmed development plan and blocks PR creation without a GitHub token', async () => {
  resetTelegramState();
  settings.developerMode = true;
  const planRender = createSettingsHookHarness({ 17: '  Improve Settings safely  ' });
  await planRender();
  pressables.find((item) => item.label.includes('প্ল্যান ও ওয়ার্কফ্লো তৈরি করুন'))?.onPress();
  let html = await planRender();
  assert.match(html, /Settings test plan/);
  assert.deepEqual(githubCalls.find((item) => item.method === 'generateDevelopmentPlan')?.args, ['Improve Settings safely']);

  const noTokenRender = createSettingsHookHarness({ 18: samplePlan });
  await noTokenRender();
  pressables.find((item) => item.label.includes('GitHub-এ PR তৈরি করুন'))?.onPress();
  html = await noTokenRender();
  assert.match(html, /GitHub Personal Access Token প্রয়োজন/);
  assert.equal(githubCalls.filter((item) => item.method === 'createGitHubPullRequest').length, 0);
});

test('Settings confirms GitHub PR creation, renders success history, and surfaces API failures', async () => {
  resetTelegramState();
  settings.developerMode = true;
  const successRender = createSettingsHookHarness({ 15: 'ghp_test-token', 18: samplePlan });
  await successRender();
  pressables.find((item) => item.label.includes('GitHub-এ PR তৈরি করুন'))?.onPress();
  assert.equal(alerts.at(-1)?.title, 'স্বয়ংক্রিয় ডেভেলপমেন্ট ওয়ার্কফ্লো শুরু করবেন?');
  await alerts.at(-1)?.buttons.find((button) => button.text === 'হ্যাঁ, শুরু করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let html = await successRender();
  assert.match(html, /PR ready/);
  assert.match(html, /GitHub-এ PR দেখুন: #88/);
  assert.match(html, /পূর্ববর্তী ডেভেলপমেন্ট হিস্ট্রি/);
  assert.deepEqual(githubCalls.find((item) => item.method === 'createGitHubPullRequest')?.args, [{
    githubToken: 'ghp_test-token', plan: samplePlan,
  }]);

  resetTelegramState();
  settings.developerMode = true;
  githubHandlers.createGitHubPullRequest = async () => ({
    success: false, error: 'GitHub permission denied', logs: ['Repository write permission missing'],
  });
  const rejectedRender = createSettingsHookHarness({ 15: 'ghp_test-token', 18: samplePlan });
  await rejectedRender();
  pressables.find((item) => item.label.includes('GitHub-এ PR তৈরি করুন'))?.onPress();
  await alerts.at(-1)?.buttons.find((button) => button.text === 'হ্যাঁ, শুরু করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await rejectedRender();
  assert.match(html, /GitHub permission denied/);
  assert.match(html, /Repository write permission missing/);

  resetTelegramState();
  settings.developerMode = true;
  githubHandlers.createGitHubPullRequest = async () => { throw new Error('GitHub API unavailable'); };
  const thrownRender = createSettingsHookHarness({ 15: 'ghp_test-token', 18: samplePlan });
  await thrownRender();
  pressables.find((item) => item.label.includes('GitHub-এ PR তৈরি করুন'))?.onPress();
  await alerts.at(-1)?.buttons.find((button) => button.text === 'হ্যাঁ, শুরু করুন')?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = await thrownRender();
  assert.match(html, /GitHub API unavailable/);
});

test('Settings GitHub token save trims input and remove clears the connected state', async () => {
  resetTelegramState();
  settings.developerMode = true;
  const render = createSettingsHookHarness({ 16: '  ghp_example-9876  ' });
  await render();
  pressables.find((item) => item.label.includes('টোকেন সংরক্ষণ করুন'))?.onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let html = await render();
  assert.match(html, /GitHub PAT সংযুক্ত আছে/);
  assert.match(html, /••••9876/);
  assert.deepEqual(githubCalls.find((item) => item.method === 'saveGitHubToken')?.args, ['ghp_example-9876']);

  await pressables.find((item) => item.label.includes('টোকেন মুছুন'))?.onPress();
  html = await render();
  assert.ok(inputHandlers.some((item) => item.placeholder === 'ghp_xxxxxxxxxxxx'), 'empty GitHub token input is restored after removal');
  assert.equal(githubCalls.filter((item) => item.method === 'removeGitHubToken').length, 1);
  assert.equal(alerts.at(-1)?.title, 'মুছে ফেলা হয়েছে');
});
