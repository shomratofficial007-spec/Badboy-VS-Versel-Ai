import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type FetchCall = { url: string; init: any };
const calls: FetchCall[] = [];
const secure = new Map<string, string>();
let fetchHandler: (url: string, init: any) => Promise<Response> = async () => new Response('{}', { status: 200 });

mock.module('expo/fetch', {
  namedExports: { fetch: (url: string, init: any) => { calls.push({ url, init }); return fetchHandler(url, init); } },
});
mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async (key: string) => secure.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { secure.set(key, value); },
    deleteItemAsync: async (key: string) => { secure.delete(key); },
  },
});

const chatPromise = import('./providerChat');
const managerPromise = import('./providerManager');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const sse = (lines: string[]) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    for (const line of lines) controller.enqueue(encoder.encode(line));
    controller.close();
  },
}), { status: 200 });

function reset() {
  secure.clear();
  calls.length = 0;
}

test('connection test lists models from OpenAI-compatible providers and marks OpenRouter free models', async () => {
  const [{ testProviderConnection }, { saveProviderKey }] = await Promise.all([chatPromise, managerPromise]);
  reset();
  await saveProviderKey('openrouter', 'or-key');
  fetchHandler = async () => json({ data: [{ id: 'vendor/free-model:free', name: 'Free' }, { id: 'paid-model' }] });
  const result = await testProviderConnection('openrouter');
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer or-key');
  assert.deepEqual(result.models.map((model) => [model.id, model.free]), [['vendor/free-model:free', true], ['paid-model', null]]);
});

test('connection test uses native Gemini, Cohere and Cloudflare catalog endpoints', async () => {
  const [{ testProviderConnection }, manager] = await Promise.all([chatPromise, managerPromise]);
  reset();
  await manager.saveProviderKey('gemini', 'g key');
  fetchHandler = async () => json({ models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
  ] });
  const gemini = await testProviderConnection('gemini');
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?key=g%20key');
  assert.deepEqual(gemini.models, [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: null }]);

  await manager.saveProviderKey('cohere', 'co-key');
  fetchHandler = async () => json({ models: [{ name: 'command-r' }] });
  const cohere = await testProviderConnection('cohere');
  assert.equal(calls[1].url, 'https://api.cohere.com/v1/models?limit=100');
  assert.deepEqual(cohere.models.map((model) => model.id), ['command-r']);

  await manager.saveProviderKey('cloudflare', 'cf-token');
  await assert.rejects(() => testProviderConnection('cloudflare'), /Account ID/);
  const account = 'a'.repeat(32);
  await manager.saveCloudflareAccountId(account);
  fetchHandler = async () => json({ result: [{ name: '@cf/meta/llama' }] });
  const cloudflare = await testProviderConnection('cloudflare');
  assert.equal(calls.at(-1)?.url, `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?per_page=20`);
  assert.deepEqual(cloudflare.models.map((model) => model.id), ['@cf/meta/llama']);
});

test('connection test reports missing keys and redacts bearer tokens from provider errors', async () => {
  const [{ testProviderConnection }, { saveProviderKey }] = await Promise.all([chatPromise, managerPromise]);
  reset();
  await assert.rejects(() => testProviderConnection('mistral'), /API Key/);
  await saveProviderKey('groq', 'groq-key');
  fetchHandler = async () => json({ error: { message: 'bad key Bearer secret-token' } }, 401);
  await assert.rejects(() => testProviderConnection('groq'), (error: unknown) => {
    assert.match((error as Error).message, /HTTP 401/);
    assert.doesNotMatch((error as Error).message, /secret-token/);
    return true;
  });
});

test('streamProviderReply returns false until a provider with a key and default model is selected', async () => {
  const [{ streamProviderReply }, manager] = await Promise.all([chatPromise, managerPromise]);
  reset();
  const chunks: string[] = [];
  assert.equal(await streamProviderReply('hi', (chunk) => chunks.push(chunk)), false);
  await manager.saveDefaultModel({ providerId: 'groq', modelId: 'llama', label: 'Llama' });
  assert.equal(await streamProviderReply('hi', (chunk) => chunks.push(chunk)), false);
  assert.deepEqual(chunks, []);
  assert.equal(calls.length, 0);
});

test('streamProviderReply streams OpenAI-compatible server-sent events with the selected model', async () => {
  const [{ streamProviderReply }, manager] = await Promise.all([chatPromise, managerPromise]);
  reset();
  await manager.saveProviderKey('groq', 'groq-key');
  await manager.saveDefaultModel({ providerId: 'groq', modelId: 'llama', label: 'Llama' });
  fetchHandler = async () => sse([
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    ': keepalive\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
  const chunks: string[] = [];
  assert.equal(await streamProviderReply('hi', (chunk) => chunks.push(chunk)), true);
  assert.deepEqual(chunks, ['Hel', 'lo']);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'llama');
  assert.equal(body.stream, true);

  fetchHandler = async () => json({ error: { message: 'rate limited' } }, 429);
  await assert.rejects(() => streamProviderReply('hi', () => undefined), /HTTP 429/);
});

test('streamProviderReply uses native Gemini, Cohere and Cloudflare chat APIs', async () => {
  const [{ streamProviderReply }, manager] = await Promise.all([chatPromise, managerPromise]);
  reset();
  const chunks: string[] = [];

  await manager.saveProviderKey('gemini', 'gk');
  await manager.saveDefaultModel({ providerId: 'gemini', modelId: 'gemini-2.5-flash', label: 'Gemini' });
  fetchHandler = async () => json({ candidates: [{ content: { parts: [{ text: 'Hi' }, { text: '!' }] } }] });
  assert.equal(await streamProviderReply('hello', (chunk) => chunks.push(chunk)), true);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gk');
  fetchHandler = async () => json({ candidates: [] });
  await assert.rejects(() => streamProviderReply('hello', () => undefined), /empty response/);

  await manager.saveProviderKey('cohere', 'ck');
  await manager.saveDefaultModel({ providerId: 'cohere', modelId: 'command-r', label: 'Command R' });
  fetchHandler = async () => json({ message: { content: [{ text: 'cohere ok' }] } });
  assert.equal(await streamProviderReply('hello', (chunk) => chunks.push(chunk)), true);
  assert.equal(calls.at(-1)?.url, 'https://api.cohere.com/v2/chat');

  const account = 'b'.repeat(32);
  await manager.saveProviderKey('cloudflare', 'cf');
  await manager.saveCloudflareAccountId(account);
  await manager.saveDefaultModel({ providerId: 'cloudflare', modelId: '@cf/meta/llama', label: 'Llama' });
  fetchHandler = async () => json({ result: { response: 'cloudflare ok' } });
  assert.equal(await streamProviderReply('hello', (chunk) => chunks.push(chunk)), true);
  assert.equal(calls.at(-1)?.url, `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${encodeURIComponent('@cf/meta/llama')}`);
  assert.deepEqual(chunks, ['Hi!', 'cohere ok', 'cloudflare ok']);
});
