import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleProviderModelsProxy } from './providerProxy';

const originalFetch = globalThis.fetch;

test('provider model proxy accepts the additional public OpenAI-compatible providers', async () => {
  const requested: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    requested.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    return Response.json({ data: [{ id: 'provider-model' }] });
  };

  const providers = [
    ['cerebras', 'https://api.cerebras.ai/v1'],
    ['sambanova', 'https://api.sambanova.ai/v1'],
    ['mistral', 'https://api.mistral.ai/v1'],
  ] as const;

  try {
    for (const [providerId, baseUrl] of providers) {
      const request = new Request('https://worker.example/api/assistant/provider-models', {
        method: 'POST',
        headers: { 'X-Provider-Key': 'test-provider-key' },
      });
      const response = await handleProviderModelsProxy(request, { providerId, baseUrl });
      assert.equal(response.status, 200, providerId + ' should be accepted');
      assert.deepEqual(await response.json(), { data: [{ id: 'provider-model' }] });
    }

    assert.deepEqual(requested.map((item) => item.url), providers.map(([, baseUrl]) => baseUrl + '/models'));
    assert.ok(requested.every((item) => item.authorization === 'Bearer test-provider-key'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider model proxy continues to reject unsupported provider identifiers', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ data: [] });
  };
  try {
    const response = await handleProviderModelsProxy(
      new Request('https://worker.example/api/assistant/provider-models', {
        method: 'POST',
        headers: { 'X-Provider-Key': 'test-provider-key' },
      }),
      { providerId: 'omniroute', baseUrl: 'https://router.example/v1' },
    );
    assert.equal(response.status, 400);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('additional providers accept OpenAI-compatible chat completion requests', async () => {
  const requested: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    requested.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    return new Response('data: [DONE]\\n\\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const providers = [
    ['cohere', 'https://api.cohere.ai/compatibility/v1'],
    ['nvidia', 'https://integrate.api.nvidia.com/v1'],
    ['cloudflare', 'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1'],
  ] as const;
  try {
    for (const [providerId, baseUrl] of providers) {
      const response = await handleProviderChatProxy(
        new Request('https://worker.example/api/assistant/provider-chat', {
          method: 'POST',
          headers: { 'X-Provider-Key': 'test-provider-key' },
        }),
        {
          providerId,
          baseUrl,
          model: 'test-model',
          messages: [{ role: 'user', content: 'hello' }],
        },
      );
      assert.equal(response.status, 200, providerId + ' should accept chat completion requests');
      assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    }
    assert.deepEqual(requested.map((item) => item.url), providers.map(([, baseUrl]) => baseUrl + '/chat/completions'));
    assert.ok(requested.every((item) => item.authorization === 'Bearer test-provider-key'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
