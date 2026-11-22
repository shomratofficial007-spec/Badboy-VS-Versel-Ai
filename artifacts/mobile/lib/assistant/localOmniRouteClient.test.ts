import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let fetchHandler: (...args: any[]) => Promise<Response> = async () => { throw new Error('Unexpected fetch'); };
let localKey: string | null = 'local-key';
let backupKey: string | null = 'free-key';
const fetchCalls: Array<{ url: string; init: any }> = [];

mock.module('expo/fetch', {
  namedExports: { fetch: (...args: any[]) => { fetchCalls.push({ url: String(args[0]), init: args[1] }); return fetchHandler(...args); } },
});
mock.module('./providerSettings.ts', {
  namedExports: {
    getLocalOmniRouteApiKey: async () => localKey,
    getProviderApiKey: async () => backupKey,
  },
});
mock.module('./ownerAuth.ts', {
  namedExports: { getOwnerToken: async () => 'owner-token-test' },
});
mock.module('./ownerJsonRequest.ts', {
  namedExports: { apiUrl: (path: string) => 'https://worker.example/api' + path },
});
mock.module('./api.ts', {
  namedExports: {
    getCalendarEvents: async () => [],
    getDiscordMessages: async () => [],
    getHomeAssistantStates: async () => [],
    getSlackMessages: async () => [],
    searchWebResearch: async () => ({ results: [] }),
  },
});

const clientPromise = import('./localOmniRouteClient');

function completion(content: string, toolCalls: unknown[] = []) {
  return new Response(JSON.stringify({ choices: [{ message: { content, tool_calls: toolCalls } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

function finalStream(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status, headers: { 'Content-Type': 'text/event-stream' } });
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    localOmniRouteEnabled: true,
    localOmniRouteBaseUrl: 'http://192.168.1.20:8080/v1',
    localOmniRouteModel: 'qwen2.5:7b',
    localOmniRouteFallbackEnabled: true,
    localOmniRouteFallbackModel: 'openrouter/free',
    personality: 'helpful',
    voiceLanguage: 'bn-BD',
    developerMode: false,
    ...overrides,
  } as any;
}

test('local Agentic workflow runs every stage directly on the configured device endpoint', async () => {
  fetchCalls.length = 0;
  let executorCalls = 0;
  fetchHandler = async (url, init) => {
    if (String(url).includes('/chat/completions')) {
      const body = JSON.parse(String(init.body));
      const system = String(body.messages?.[0]?.content ?? '');
      if (system.includes('Badboy Planner')) {
        return completion(JSON.stringify({ goal: 'test', steps: [{ id: '1', task: 'solve', success_criteria: 'answer' }], risks: [] }));
      }
      if (system.includes('Badboy Executor')) {
        executorCalls += 1;
        return completion('executor result');
      }
      if (system.includes('Badboy Reviewer')) return completion('review passed');
      return finalStream(['data: {"choices":[{"delta":{"content":"local "}}]}\\n\\n', 'data: {"choices":[{"delta":{"content":"answer"}}]}\\n\\n', 'data: [DONE]\\n\\n']);
    }
    throw new Error('Unexpected route: ' + url);
  };
  const { streamLocalOmniRouteReply } = await clientPromise;
  const chunks: string[] = [];
  await streamLocalOmniRouteReply('hello', settings(), [], (chunk) => chunks.push(chunk));
  assert.deepEqual(chunks, ['local ', 'answer']);
  assert.equal(executorCalls, 1);
  assert.ok(fetchCalls.length >= 4);
  assert.ok(fetchCalls.every((call) => call.url.startsWith('http://192.168.1.20:8080/v1/')));
  assert.ok(fetchCalls.every((call) => !call.url.startsWith('https://worker.example')));
  assert.equal(new Headers(fetchCalls[0].init.headers).get('Authorization'), 'Bearer local-key');
});

test('local failure falls back only to an explicit OpenRouter free model before tools execute', async () => {
  fetchCalls.length = 0;
  let localAttempts = 0;
  fetchHandler = async (url, init) => {
    if (String(url).startsWith('http://192.168.1.20')) {
      localAttempts += 1;
      throw new Error('local router offline');
    }
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    const system = String(body.messages?.[0]?.content ?? '');
    if (system.includes('Badboy Planner')) return completion(JSON.stringify({ goal: 'test', steps: [{ id: '1', task: 'solve', success_criteria: 'answer' }], risks: [] }));
    if (system.includes('Badboy Executor')) return completion('free executor');
    if (system.includes('Badboy Reviewer')) return completion('free review');
    return finalStream(['data: {"choices":[{"delta":{"content":"free answer"}}]}\\n\\n', 'data: [DONE]\\n\\n']);
  };
  const { streamLocalOmniRouteReply } = await clientPromise;
  const chunks: string[] = [];
  await streamLocalOmniRouteReply('hello', settings(), [], (chunk) => chunks.push(chunk));
  assert.ok(localAttempts >= 1);
  assert.deepEqual(chunks, ['free answer']);
  const backupCalls = fetchCalls.filter((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions');
  assert.ok(backupCalls.length >= 4);
  assert.ok(backupCalls.every((call) => JSON.parse(String(call.init.body)).model === 'openrouter/free'));
  assert.ok(backupCalls.every((call) => new Headers(call.init.headers).get('Authorization') === 'Bearer free-key'));
});

test('local failure after a tool has executed never replays the workflow through free backup', async () => {
  fetchCalls.length = 0;
  let executorCalls = 0;
  fetchHandler = async (url, init) => {
    if (!String(url).startsWith('http://192.168.1.20')) throw new Error('free backup must not run after a tool');
    const body = JSON.parse(String(init.body));
    const system = String(body.messages?.[0]?.content ?? '');
    if (system.includes('Badboy Planner')) return completion(JSON.stringify({ goal: 'calculate', steps: [{ id: '1', task: 'calculate', success_criteria: 'number' }], risks: [] }));
    if (system.includes('Badboy Executor')) {
      executorCalls += 1;
      if (executorCalls === 1) return completion('', [{ id: 'tool-1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } }]);
      throw new Error('router disconnected after tool');
    }
    throw new Error('unexpected stage');
  };
  const { streamLocalOmniRouteReply } = await clientPromise;
  await assert.rejects(streamLocalOmniRouteReply('2+2', settings(), [], () => {}), /router disconnected after tool/);
  assert.equal(fetchCalls.some((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions'), false);
});

test('local final stream failure after visible output never switches to the free backup', async () => {
  fetchCalls.length = 0;
  fetchHandler = async (url, init) => {
    if (!String(url).startsWith('http://192.168.1.20')) throw new Error('free backup must not run after visible output');
    const body = JSON.parse(String(init.body));
    const system = String(body.messages?.[0]?.content ?? '');
    if (system.includes('Badboy Planner')) return completion(JSON.stringify({ goal: 'answer', steps: [{ id: '1', task: 'answer', success_criteria: 'text' }], risks: [] }));
    if (system.includes('Badboy Executor')) return completion('executor answer');
    if (system.includes('Badboy Reviewer')) return completion('review');
    return finalStream(['data: {"choices":[{"delta":{"content":"partial"}}]}\\n\\n']);
  };
  const { streamLocalOmniRouteReply } = await clientPromise;
  await assert.rejects(streamLocalOmniRouteReply('hello', settings(), [], () => {}), /stream ended before \\[DONE\\]/);
  assert.equal(fetchCalls.some((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions'), false);
});
