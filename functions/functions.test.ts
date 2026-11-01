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

test("onRequestPost - advances through fallback models on retryable 404, 429, 500, 503 errors and network failures", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedModels: string[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.ok(url.includes("openrouter.ai/api/v1/chat/completions"));
    const body = JSON.parse(String(init?.body || "{}"));
    const model = body.model;
    attemptedModels.push(model);

    if (model === "openrouter/free") {
      // Primary model fails with 429 Rate Limit
      return new Response(JSON.stringify({ error: { message: "Rate limit reached", code: 429 } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (model === "cohere/north-mini-code:free") {
      // First fallback fails with 503 Service Unavailable
      return new Response(JSON.stringify({ error: { message: "Service unavailable", code: 503 } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (model === "nvidia/nemotron-3.5-lightning:free") {
      // Second fallback simulates an upstream network error
      throw new Error("Simulated network timeout/disconnect");
    }

    if (model === "thinkingmachines/inkling:free") {
      // Third fallback succeeds with streaming SSE
      const mockSSE =
        'data: {"choices":[{"delta":{"content":"Inkling fallback response"}}]}\n\n' +
        "data: [DONE]\n\n";
      return new Response(mockSSE, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    throw new Error(`Unexpected model attempted: ${model}`);
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello Fallback" }),
      }),
      env: { OPENROUTER_API_KEY: "test-secret-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("Content-Type"), "text/event-stream");

    const text = await response.text();
    assert.ok(text.includes('data: {"content":"Inkling fallback response"}'));
    assert.ok(text.includes("data: [DONE]"));

    // Verify exact sequence of models attempted
    assert.deepStrictEqual(attemptedModels, [
      "openrouter/free",
      "cohere/north-mini-code:free",
      "nvidia/nemotron-3.5-lightning:free",
      "thinkingmachines/inkling:free",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onRequestPost - returns final error when all fallback models fail with 500/504 errors", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedModels: string[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    attemptedModels.push(body.model);
    return new Response(JSON.stringify({ error: "Upstream gateway failure" }), {
      status: 504,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "All models fail" }),
      }),
      env: { OPENROUTER_API_KEY: "test-secret-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 502);
    const json = (await response.json()) as any;
    assert.strictEqual(json.code, "OPENROUTER_REQUEST_FAILED");

    // Must have attempted all 5 models in sequence
    assert.deepStrictEqual(attemptedModels, [
      "openrouter/free",
      "cohere/north-mini-code:free",
      "nvidia/nemotron-3.5-lightning:free",
      "thinkingmachines/inkling:free",
      "recursive/flint-v1.0:free",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
