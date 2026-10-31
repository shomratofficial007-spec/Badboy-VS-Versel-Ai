import assert from "node:assert";
import test from "node:test";
// Node ESM imports require .js extension when pointing to typescript files
import { onRequestGet, onRequestPost } from "./api/[[path]].js";

test("onRequestGet - health check endpoint returns status ok", async () => {
  const context = {
    request: new Request("https://example.com/api/health"),
    env: {},
  } as any;

  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.deepStrictEqual(json, {
    status: "degraded",
    aiConfigured: false,
    model: "openrouter/free",
    fallbackCount: 4,
  });
});

test("onRequestGet - health check endpoint without leading /api prefix returns status ok", async () => {
  const context = {
    request: new Request("https://example.com/healthz"),
    env: {},
  } as any;

  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.deepStrictEqual(json, {
    status: "degraded",
    aiConfigured: false,
    model: "openrouter/free",
    fallbackCount: 4,
  });
});

test("onRequestPost - handles assistant/chat without leading /api prefix", async () => {
  const context = {
    request: new Request("https://example.com/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    }),
    env: {},
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "AI_NOT_CONFIGURED");
});

test("onRequestGet - health check endpoint with trailing slash returns status ok", async () => {
  const context = {
    request: new Request("https://example.com/api/healthz/"),
    env: {},
  } as any;

  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.deepStrictEqual(json, {
    status: "degraded",
    aiConfigured: false,
    model: "openrouter/free",
    fallbackCount: 4,
  });
});

test("onRequestGet - non-existent path returns 404", async () => {
  const context = {
    request: new Request("https://example.com/api/notfound"),
    env: {},
  } as any;

  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 404);
  const json = (await response.json()) as any;
  assert.strictEqual(json.error, "Endpoint not found.");
});

test("onRequestPost - returns 503 if OPENROUTER_API_KEY is missing", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    }),
    env: {},
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "AI_NOT_CONFIGURED");
});

test("onRequestPost - returns 400 for invalid body payload", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/chat/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    }),
    env: { OPENROUTER_API_KEY: "dummy-key" },
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 400);
  const json = (await response.json()) as any;
  assert.strictEqual(json.error, "Invalid assistant message payload.");
});

test("onRequestPost - streams response when valid request and API key provided", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    assert.ok(url.includes("openrouter.ai"));
    const mockSSE =
      'data: {"choices":[{"delta":{"content":"নমস্কার"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n' +
      "data: [DONE]\n\n";

    return new Response(mockSSE, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "হাই" }),
      }),
      env: { OPENROUTER_API_KEY: "test-secret-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("Content-Type"), "text/event-stream");

    const text = await response.text();
    assert.ok(text.includes('data: {"content":"নমস্কার"}'));
    assert.ok(text.includes('data: {"content":"!"}'));
    assert.ok(text.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
