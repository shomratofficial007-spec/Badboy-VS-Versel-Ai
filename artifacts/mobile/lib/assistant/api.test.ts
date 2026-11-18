Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
Object.defineProperty(globalThis, 'expo', { value: { EventEmitter: class TestEventEmitter {} }, configurable: true });

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let fetchHandler: (...args: any[]) => Promise<any> = async () => {
  throw new Error('Unexpected expoFetch call');
};
let fileContent = '';
const requestedFiles: string[] = [];

mock.module('react-native', {
  namedExports: {
    Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default ?? options.ios },
  },
});
mock.module('expo/fetch', {
  namedExports: { fetch: (...args: any[]) => fetchHandler(...args) },
});
const secureStoreValues = new Map<string, string>();
mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async (key: string) => secureStoreValues.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { secureStoreValues.set(key, value); },
    deleteItemAsync: async (key: string) => { secureStoreValues.delete(key); },
  },
});
mock.module('expo-file-system/legacy', {
  namedExports: {
    EncodingType: { Base64: 'base64' },
    readAsStringAsync: async (uri: string, options: unknown) => {
      requestedFiles.push(uri);
      assert.deepEqual(options, { encoding: 'base64' });
      return fileContent;
    },
  },
});
mock.module('./ownerAuth.ts', {
  namedExports: { getOwnerToken: async () => 'owner-token-test' },
});
mock.module('./ownerJsonRequest.ts', {
  namedExports: { apiUrl: (path: string) => `https://worker.example${path}` },
});

const apiPromise = import('./api');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

function authFrom(init: any) {
  return new Headers(init?.headers).get('Authorization');
}

test('streamReply sends owner-authenticated request and parses split SSE frames', async () => {
  const { streamReply } = await apiPromise;
  let url = '';
  let sent: any;
  fetchHandler = async (input, init) => {
    url = String(input);
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse([
      'data: {"content":"বাংলা ',
      'উত্তর"}\n\n',
      'data: {"content":"সম্পূর্ণ"}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const chunks: string[] = [];
  await streamReply('হ্যালো', {
    personality: 'বন্ধুসুলভ',
    voiceLanguage: 'bn-BD',
    developerMode: true,
  } as any, (chunk) => chunks.push(chunk));
  assert.equal(url, 'https://worker.example/assistant/chat');
  assert.equal(sent.message, 'হ্যালো');
  assert.equal(sent.developerMode, true);
  assert.match(sent.personality, /bn-BD/);
  assert.deepEqual(chunks, ['বাংলা উত্তর', 'সম্পূর্ণ']);
});

test('streamAgenticReply sends owner-authenticated bounded history and consumes agentic SSE', async () => {
  const { streamAgenticReply } = await apiPromise;
  let url = '';
  let sent: any;
  fetchHandler = async (input, init) => {
    url = String(input);
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse([
      'data: {"type":"agent","agent":"planner","status":"completed"}\n\n',
      'data: {"type":"tool","name":"calculator","ok":true}\n\n',
      'data: {"content":"হিসাবের ফল " }\n\n',
      'data: {"content":"৪২"}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const chunks: string[] = [];
  await streamAgenticReply(
    '6 * 7 কত?',
    { personality: 'বন্ধুসুলভ', voiceLanguage: 'bn-BD', developerMode: true } as any,
    [{ role: 'user', content: 'আগের প্রশ্ন' }],
    (chunk) => chunks.push(chunk),
    'Project note: preserve all current features.',
    'Skill: Project Planner\\nInstructions: split work into tested steps.',
    ['web-research', 'discord-history'],
  );
  assert.equal(url, 'https://worker.example/assistant/agent');
  assert.equal(sent.message, '6 * 7 কত?');
  assert.equal(sent.mode, 'multi');
  assert.deepEqual(sent.enabledPlugins, ['web-research', 'discord-history']);
  assert.equal(sent.developerMode, true);
  assert.deepEqual(sent.history, [{ role: 'user', content: 'আগের প্রশ্ন' }]);
  assert.match(sent.personality, /bn-BD/);
  assert.equal(sent.memoryContext, 'Project note: preserve all current features.');
  assert.match(sent.skillContext, /Project Planner/);
  assert.match(sent.skillContext, /split work into tested steps/);
  assert.deepEqual(chunks, ['হিসাবের ফল ', '৪২']);
});

test('streamAgenticReply forwards the selected SecureStore provider and model to the owner Worker', async () => {
  const { saveDefaultModel, saveProviderKey } = await import('./providerManager');
  secureStoreValues.clear();
  await saveProviderKey('groq', 'groq-secret-test');
  await saveDefaultModel({ providerId: 'groq', modelId: 'llama-3.3-70b-versatile', label: 'Llama 3.3' });
  let sent: any;
  fetchHandler = async (_input, init) => {
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse(['data: [DONE]\n\n']);
  };
  await (await apiPromise).streamAgenticReply('hello', {
    personality: 'friendly', voiceLanguage: 'en-US', developerMode: false,
  } as any, [], () => {});
  assert.equal(sent.provider.providerId, 'groq');
  assert.equal(sent.provider.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(sent.provider.apiKey, 'groq-secret-test');
  assert.equal(sent.provider.modelId, 'llama-3.3-70b-versatile');
  secureStoreValues.clear();
});

test('streamReply rejects HTTP errors and provider error events', async () => {
  const { streamReply } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'owner denied' }, 401);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /owner denied/,
  );
  fetchHandler = async () => streamResponse(['data: {"error":"upstream failed"}\n\n']);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /upstream failed/,
  );
});

test('streamReply rejects missing response streams and malformed SSE JSON', async () => {
  const { streamReply } = await apiPromise;
  fetchHandler = async () => new Response(null, { status: 200 });
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /response stream is unavailable/,
  );
  fetchHandler = async () => streamResponse(['data: {broken json}\n\n']);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    SyntaxError,
  );
});

test('streamDeveloperAnalysis returns task metadata and streams analysis chunks', async () => {
  const { streamDeveloperAnalysis } = await apiPromise;
  let sent: any;
  fetchHandler = async (_input, init) => {
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse([
      'data: {"taskId":"task-123","engine":"native"}\n\n',
      'data: {"content":"প্রথম অংশ"}\n\n',
      'data: {"content":"দ্বিতীয় অংশ"}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const chunks: string[] = [];
  const result = await streamDeveloperAnalysis(
    'Review this project', 'Project context', 'native', (chunk) => chunks.push(chunk),
  );
  assert.deepEqual(sent, {
    prompt: 'Review this project',
    projectContext: 'Project context',
    requestedEngine: 'native',
  });
  assert.deepEqual(result, { taskId: 'task-123', engine: 'native' });
  assert.deepEqual(chunks, ['প্রথম অংশ', 'দ্বিতীয় অংশ']);
});

test('streamDeveloperAnalysis handles HTTP, stream, and event errors', async () => {
  const { streamDeveloperAnalysis } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'not allowed' }, 403);
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /not allowed/,
  );
  fetchHandler = async () => new Response(null, { status: 200 });
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /response stream is unavailable/,
  );
  fetchHandler = async () => streamResponse(['data: {"error":"analysis failed"}\n\n']);
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /analysis failed/,
  );
});

test('searchAgentMemory uses owner auth and bounds the project search request', async () => {
  const { searchAgentMemory } = await apiPromise;
  let url = '';
  let sent: any;
  fetchHandler = async (input, init) => {
    url = String(input);
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({ memories: [{
      id: 'memory-1',
      projectId: 'project-1',
      category: 'architecture',
      content: 'Keep existing features',
      source: 'owner',
      privacyLevel: 'private',
      updatedAt: '2026-11-15T00:00:00.000Z',
    }], sensitiveExcluded: true });
  };
  const memories = await searchAgentMemory(' project-1 ', '  preserve features  ', 500);
  assert.equal(url, 'https://worker.example/agent/memory/search');
  assert.deepEqual(sent, { projectId: 'project-1', query: 'preserve features', limit: 10 });
  assert.equal(memories[0].content, 'Keep existing features');
});

test('searchAgentMemory filters sensitive, cross-project and malformed server rows before Agent context', async () => {
  const { searchAgentMemory } = await apiPromise;
  fetchHandler = async () => jsonResponse({ memories: [
    { id: 'private-1', projectId: 'project-1', category: 'note', content: 'safe context', source: 'owner', privacyLevel: 'private', updatedAt: '2026-11-15T00:00:00.000Z' },
    { id: 'secret-1', projectId: 'project-1', category: 'secret', content: 'do not expose', source: 'owner', privacyLevel: ' Sensitive ', updatedAt: '2026-11-15T00:00:00.000Z' },
    { id: 'other-1', projectId: 'another-project', category: 'note', content: 'cross-project', source: 'owner', privacyLevel: 'private', updatedAt: '2026-11-15T00:00:00.000Z' },
    { id: 'bad-1', projectId: 'project-1', category: 'note', content: 42, source: 'owner', privacyLevel: 'private', updatedAt: '2026-11-15T00:00:00.000Z' },
  ] });
  const memories = await searchAgentMemory('project-1', 'context');
  assert.equal(memories.length, 1);
  assert.equal(memories[0].content, 'safe context');
});

test('searchAgentMemory skips empty input and reports server errors', async () => {
  const { searchAgentMemory } = await apiPromise;
  fetchHandler = async () => { throw new Error('should not fetch'); };
  assert.deepEqual(await searchAgentMemory(' ', 'query'), []);
  fetchHandler = async () => jsonResponse({ error: 'memory unavailable' }, 503);
  await assert.rejects(searchAgentMemory('project-1', 'query'), /memory unavailable/);
});

test('transcribeAudio maps language, sends audio and returns trimmed transcript', async () => {
  const { transcribeAudio } = await apiPromise;
  let sent: any;
  fetchHandler = async (url, init) => {
    assert.equal(String(url), 'https://worker.example/assistant/transcribe');
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    assert.ok(init.signal instanceof AbortSignal, 'transcription request must be cancellable');
    assert.equal(init.signal.aborted, false);
    sent = JSON.parse(String(init.body));
    return jsonResponse({ text: '  তুমি কেমন আছো?  ' });
  };
  assert.equal(await transcribeAudio('YXVkaW8=', 'm4a', 'bn-BD'), 'তুমি কেমন আছো?');
  assert.deepEqual(sent, { audioBase64: 'YXVkaW8=', format: 'm4a', language: 'bn' });
});

test('transcribeAudio rejects HTTP failures and empty transcripts', async () => {
  const { transcribeAudio } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'transcription unavailable' }, 503);
  await assert.rejects(transcribeAudio('abc', 'wav', 'en-US'), /transcription unavailable/);
  fetchHandler = async () => jsonResponse({ text: '   ' });
  await assert.rejects(transcribeAudio('abc', 'wav', 'en-US'), /কোনো কথা শনাক্ত/);
});

test('transcribeRecordedAudio validates the recording and reads base64 audio', async () => {
  const { transcribeRecordedAudio } = await apiPromise;
  requestedFiles.length = 0;
  await assert.rejects(transcribeRecordedAudio('  ', 'bn-BD'), /রেকর্ডিং ফাইল/);
  fileContent = '';
  await assert.rejects(transcribeRecordedAudio('file:///recording.m4a', 'bn-BD'), /অডিও ফাঁকা/);
  fileContent = 'YXVkaW8=';
  fetchHandler = async () => jsonResponse({ text: 'hello from recording' });
  assert.equal(await transcribeRecordedAudio('file:///recording.m4a', 'en-US'), 'hello from recording');
  assert.deepEqual(requestedFiles, ['file:///recording.m4a', 'file:///recording.m4a']);
});

test('requestSpeech returns audio bytes and rejects HTTP or empty audio responses', async () => {
  const { requestSpeech } = await apiPromise;
  fetchHandler = async (url, init) => {
    assert.equal(String(url), 'https://worker.example/assistant/speech');
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    assert.ok(init.signal instanceof AbortSignal, 'speech request must be cancellable');
    assert.equal(init.signal.aborted, false);
    assert.deepEqual(JSON.parse(String(init.body)), { text: 'হ্যালো', language: 'bn-BD' });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };
  assert.deepEqual([...await requestSpeech('হ্যালো', 'bn-BD')], [1, 2, 3]);
  fetchHandler = async () => jsonResponse({ error: 'speech unavailable' }, 502);
  await assert.rejects(requestSpeech('hello', 'en-US'), /speech unavailable/);
  fetchHandler = async () => new Response(new Uint8Array([]), { status: 200 });
  await assert.rejects(requestSpeech('hello', 'en-US'), /empty audio file/);
});


test('searchWebResearch uses owner auth, bounds queries and returns HTTPS sources', async () => {
  const { searchWebResearch } = await apiPromise;
  let url = '';
  let sent: any;
  fetchHandler = async (input, init) => {
    url = String(input);
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({
      query: 'AI research',
      answer: 'A sourced answer',
      results: [
        { title: 'Secure source', url: 'https://example.com', content: 'source text', score: 0.9 },
        { title: 'Unsafe source', url: 'http://example.com', content: 'not trusted', score: 0.8 },
      ],
      sourceCount: 2,
      retrievedAt: '2026-11-15T00:00:00.000Z',
    });
  };
  const result = await searchWebResearch('  AI research  ');
  assert.equal(url, 'https://worker.example/research/search');
  assert.deepEqual(sent, { query: 'AI research', maxResults: 5 });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, 'https://example.com');
});

test('searchWebResearch rejects empty queries and provider failures', async () => {
  const { searchWebResearch } = await apiPromise;
  fetchHandler = async () => { throw new Error('should not fetch'); };
  await assert.rejects(searchWebResearch('  '), /query is required/);
  fetchHandler = async () => jsonResponse({ error: 'research not configured' }, 503);
  await assert.rejects(searchWebResearch('current news'), /research not configured/);
});


test('getIntegrationStatus uses owner authentication and returns readiness flags only', async () => {
  const { getIntegrationStatus } = await apiPromise;
  let url = '';
  fetchHandler = async (input, init) => {
    url = String(input);
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    assert.equal(new Headers(init.headers).get('Accept'), 'application/json');
    return jsonResponse({ integrations: {
      research: { configured: true, mode: 'read_only' },
      homeAssistant: { configured: false, mode: 'read_only' },
      slack: { configured: true, mode: 'read_only' },
      telegram: { configured: false, mode: 'mobile_secure_store' },
      writesRequireOwnerApproval: true,
      providerSecretsStayServerSide: true,
    } });
  };
  const result = await getIntegrationStatus();
  assert.equal(url, 'https://worker.example/integrations/status');
  assert.equal(result.research.configured, true);
  assert.equal(result.homeAssistant.configured, false);
  assert.equal(result.providerSecretsStayServerSide, true);
});

test('getIntegrationStatus reports backend errors and malformed responses', async () => {
  const { getIntegrationStatus } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'owner auth required' }, 401);
  await assert.rejects(getIntegrationStatus(), /owner auth required/);
  fetchHandler = async () => jsonResponse({ integrations: null });
  await assert.rejects(getIntegrationStatus(), /response is invalid/);
});


test('getDiscordMessages validates channel IDs and uses owner-authenticated server proxy', async () => {
  const { getDiscordMessages } = await apiPromise;
  await assert.rejects(getDiscordMessages('not-a-channel'), /valid Discord channel ID/);
  let requestedUrl = '';
  fetchHandler = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({
      messages: [{
        id: '12345678901234567',
        timestamp: '2026-11-15T10:00:00.000Z',
        author: 'owner',
        content: 'hello',
      }],
    });
  };
  const messages = await getDiscordMessages(' 12345678901234567 ');
  assert.equal(requestedUrl, 'https://worker.example/integrations/discord/messages?channel=12345678901234567');
  assert.deepEqual(messages, [{
    id: '12345678901234567',
    timestamp: '2026-11-15T10:00:00.000Z',
    author: 'owner',
    content: 'hello',
  }]);
});

test('getDiscordMessages surfaces server errors and rejects malformed payloads', async () => {
  const { getDiscordMessages } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'Discord not configured' }, 503);
  await assert.rejects(getDiscordMessages('12345678901234567'), /Discord not configured/);
  fetchHandler = async () => jsonResponse({ messages: 'not-an-array' });
  await assert.rejects(getDiscordMessages('12345678901234567'), /invalid message list/);
});


test('getCalendarEvents validates UTC time and returns bounded owner-authenticated events', async () => {
  const { getCalendarEvents } = await apiPromise;
  await assert.rejects(getCalendarEvents('tomorrow'), /UTC ISO-8601/);
  let requestedUrl = '';
  fetchHandler = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({ events: [{
      id: 'event-1',
      summary: 'Planning',
      start: '2026-11-16T10:00:00Z',
      end: '2026-11-16T11:00:00Z',
      location: null,
      htmlLink: 'https://calendar.google.com/calendar/event?eid=abc',
    }] });
  };
  const events = await getCalendarEvents('2026-11-15T00:00:00Z');
  assert.equal(requestedUrl, 'https://worker.example/integrations/google-calendar/events?timeMin=2026-11-15T00%3A00%3A00Z');
  assert.equal(events[0].summary, 'Planning');
});

test('getCalendarEvents rejects server errors and invalid event payloads', async () => {
  const { getCalendarEvents } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'Calendar not configured' }, 503);
  await assert.rejects(getCalendarEvents('2026-11-15T00:00:00Z'), /Calendar not configured/);
  fetchHandler = async () => jsonResponse({ events: null });
  await assert.rejects(getCalendarEvents('2026-11-15T00:00:00Z'), /invalid event list/);
});


test('getSlackMessages validates channel IDs and uses owner-authenticated bounded history', async () => {
  const { getSlackMessages } = await apiPromise;
  await assert.rejects(getSlackMessages('bad-channel'), /valid Slack channel ID/);
  let requestedUrl = '';
  fetchHandler = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({ messages: [
      { timestamp: '1730000000.000001', user: 'U123456', text: 'hello from Slack' },
      { timestamp: 7, user: 'invalid', text: 'filtered' },
    ] });
  };
  assert.deepEqual(await getSlackMessages(' C123456 '), [
    { timestamp: '1730000000.000001', user: 'U123456', text: 'hello from Slack' },
  ]);
  assert.equal(requestedUrl, 'https://worker.example/integrations/slack/history?channel=C123456');
});

test('getSlackMessages reports provider errors and malformed message lists', async () => {
  const { getSlackMessages } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'Slack is not configured' }, 503);
  await assert.rejects(getSlackMessages('C123456'), /Slack is not configured/);
  fetchHandler = async () => jsonResponse({ messages: 'invalid' });
  await assert.rejects(getSlackMessages('C123456'), /invalid message list/);
});

test('getHomeAssistantStates returns bounded owner-authenticated entity states', async () => {
  const { getHomeAssistantStates } = await apiPromise;
  let requestedUrl = '';
  fetchHandler = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return jsonResponse({ states: [
      { entityId: 'light.office', state: 'on', friendlyName: 'Office' },
      { entityId: 42, state: 'invalid', friendlyName: null },
    ] });
  };
  assert.deepEqual(await getHomeAssistantStates(), [
    { entityId: 'light.office', state: 'on', friendlyName: 'Office' },
  ]);
  assert.equal(requestedUrl, 'https://worker.example/integrations/home-assistant/states');
});

test('getHomeAssistantStates surfaces backend errors and malformed state lists', async () => {
  const { getHomeAssistantStates } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'Home Assistant not configured' }, 503);
  await assert.rejects(getHomeAssistantStates(), /Home Assistant not configured/);
  fetchHandler = async () => jsonResponse({ states: null });
  await assert.rejects(getHomeAssistantStates(), /invalid state list/);
});
