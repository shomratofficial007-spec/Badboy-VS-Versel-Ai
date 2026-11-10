import assert from "node:assert";
import test from "node:test";
// Node ESM imports require .js extension when pointing to typescript files
import { onRequestGet as rawOnRequestGet, onRequestPost as rawOnRequestPost } from "./api/[[path]].ts";
import { handleDeveloperDataRequest } from "./api/developerData.ts";
import {
  buildDeveloperAnalysisMessages,
  resolveDeveloperAnalysisEngine,
  validateDeveloperAnalysisPayload,
} from "./api/developerAgent.ts";

const TEST_OWNER_TOKEN = "a".repeat(43);

function withTestOwner(context: any) {
  const headers = new Headers(context.request.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${TEST_OWNER_TOKEN}`);
  }
  return {
    ...context,
    request: new Request(context.request, { headers }),
    env: { ...context.env, BADBOY_OWNER_TOKEN: context.env.BADBOY_OWNER_TOKEN ?? TEST_OWNER_TOKEN },
  };
}

// Existing endpoint tests exercise authenticated application behavior by default.
// The dedicated /api/auth/verify tests below call the raw handlers to test credentials.
const onRequestGet = (context: any) => rawOnRequestGet(withTestOwner(context));
const onRequestPost = (context: any) =>
  new URL(context.request.url).pathname.replace(/\/+$/, "") === "/api/auth/verify"
    ? rawOnRequestPost(context)
    : rawOnRequestPost(withTestOwner(context));

function testAgentDb(options: {
  changes?: number;
  firstRow?: unknown;
  rows?: unknown[];
  throwOnPrepare?: boolean;
} = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      if (options.throwOnPrepare) throw new Error("D1 connection unavailable.");
      const call = { sql, values: [] as unknown[] };
      calls.push(call);
      const statement: any = {
        bind(...values: unknown[]) { call.values = values; return statement; },
        first: async () => Object.prototype.hasOwnProperty.call(options, "firstRow")
          ? options.firstRow
          : ({ project_id: "test-project", name: "agent_tasks" }),
        all: async () => ({ success: true, results: options.rows ?? [] }),
        run: async () => ({ success: true, meta: { changes: options.changes ?? 1 } }),
      };
      return statement;
    },
  };
}

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
    capabilities: { chat: false, transcription: false, serverSpeech: false },
    providers: { openrouter: false, groqTranscription: false },
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
    capabilities: { chat: false, transcription: false, serverSpeech: false },
    providers: { openrouter: false, groqTranscription: false },
    model: "openrouter/free",
    fallbackCount: 4,
  });
});

test("onRequestGet - reports transcription capability when only Groq is configured", async () => {
  const context = {
    request: new Request("https://example.com/api/health"),
    env: { GROQ_API_KEY: "test-groq-key" },
  } as any;

  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 200);
  const json = (await response.json()) as any;
  assert.deepStrictEqual(json.capabilities, {
    chat: false,
    transcription: true,
    serverSpeech: false,
  });
  assert.deepStrictEqual(json.providers, {
    openrouter: false,
    groqTranscription: true,
  });
  assert.strictEqual(json.aiConfigured, false);
  assert.strictEqual(json.status, "partial");
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
    capabilities: { chat: false, transcription: false, serverSpeech: false },
    providers: { openrouter: false, groqTranscription: false },
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

test("onRequestPost - transcribe returns 503 if neither GROQ_API_KEY nor OPENROUTER_API_KEY is configured", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: Buffer.from("dummy-audio").toString("base64"),
        format: "mp3",
      }),
    }),
    env: {},
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 503);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "AI_NOT_CONFIGURED");
});

test("onRequestPost - transcribe uses Groq Whisper Large-V3 as primary when GROQ_API_KEY is provided", async () => {
  const originalFetch = globalThis.fetch;
  let groqCalled = false;
  let sentAuth = "";

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url.includes("api.groq.com/openai/v1/audio/transcriptions")) {
      groqCalled = true;
      sentAuth = (init?.headers as Record<string, string>)?.Authorization || "";
      assert.ok(init?.signal instanceof AbortSignal, "Groq transcription must have an abort signal");
      assert.strictEqual(init?.signal?.aborted, false);
      const formData = init?.body as FormData;
      assert.strictEqual(formData.get("language"), "bn");
      assert.strictEqual(formData.get("temperature"), "0");
      assert.strictEqual(
        formData.get("prompt"),
        "বাংলাদেশি বাংলা কথোপকথন হুবহু বাংলা লিপিতে লিখুন। কথার অর্থ বদলাবেন না, অনুবাদ বা সারাংশ করবেন না। স্পষ্টভাবে বলা ইংরেজি শব্দ ইংরেজিতেই রাখুন।",
      );
      return new Response(JSON.stringify({ text: "Groq বাংলা ট্রান্সক্রিপশন সফল" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected URL called: ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: Buffer.from("test-audio-content").toString("base64"),
          format: "mp3",
          language: "bn-BD",
        }),
      }),
      env: { GROQ_API_KEY: "test-groq-key", OPENROUTER_API_KEY: "test-openrouter-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    const json = (await response.json()) as any;
    assert.strictEqual(groqCalled, true);
    assert.strictEqual(sentAuth, "Bearer test-groq-key");
    assert.strictEqual(json.text, "Groq বাংলা ট্রান্সক্রিপশন সফল");
    assert.strictEqual(json.provider, "groq");
    assert.strictEqual(json.model, "whisper-large-v3");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onRequestPost - transcribe normalizes English locale tags for Groq Whisper", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!url.includes("api.groq.com/openai/v1/audio/transcriptions")) {
      throw new Error(`Unexpected URL called: ${url}`);
    }
    const formData = init?.body as FormData;
    assert.strictEqual(formData.get("language"), "en");
    assert.strictEqual(formData.get("prompt"), null);
    return new Response(JSON.stringify({ text: "English transcription verified" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: Buffer.from("test-audio-content").toString("base64"),
          format: "m4a",
          language: "en-US",
        }),
      }),
      env: { GROQ_API_KEY: "test-groq-key" },
    } as any;
    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    const json = (await response.json()) as any;
    assert.strictEqual(json.text, "English transcription verified");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onRequestPost - transcribe falls back to OpenRouter when Groq fails with 429", async () => {
  const originalFetch = globalThis.fetch;
  let groqAttempted = false;
  let openrouterAttempted = false;

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url.includes("api.groq.com")) {
      groqAttempted = true;
      return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("openrouter.ai/api/v1/audio/transcriptions")) {
      openrouterAttempted = true;
      assert.ok(init?.signal instanceof AbortSignal, "OpenRouter transcription must have an abort signal");
      assert.strictEqual(init?.signal?.aborted, false);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.strictEqual(body.model, "openai/whisper-1");
      return new Response(JSON.stringify({ text: "OpenRouter ফলব্যাক ট্রান্সক্রিপশন" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected URL called: ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: Buffer.from("test-audio-bytes").toString("base64"),
          format: "wav",
          language: "bn",
        }),
      }),
      env: { GROQ_API_KEY: "test-groq-key", OPENROUTER_API_KEY: "test-openrouter-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    const json = (await response.json()) as any;
    assert.strictEqual(groqAttempted, true);
    assert.strictEqual(openrouterAttempted, true);
    assert.strictEqual(json.text, "OpenRouter ফলব্যাক ট্রান্সক্রিপশন");
    assert.strictEqual(json.provider, "openrouter");
    assert.strictEqual(json.model, "openai/whisper-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onRequestPost - speech endpoint validates inputs and falls back gracefully", async () => {
  const badContext = {
    request: new Request("https://example.com/api/assistant/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    }),
    env: {},
  } as any;

  const badResponse = await onRequestPost(badContext);
  assert.strictEqual(badResponse.status, 400);

  const validContext = {
    request: new Request("https://example.com/api/assistant/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "হ্যালো ব্যাডবয়", language: "bn-BD" }),
    }),
    env: {},
  } as any;

  const validResponse = await onRequestPost(validContext);
  assert.strictEqual(validResponse.status, 503);
  assert.strictEqual(validResponse.headers.get("Content-Type"), "application/json");
  const json = (await validResponse.json()) as any;
  assert.strictEqual(json.code, "FALLBACK_TO_CLIENT_TTS");
  assert.match(json.error, /local speech engine/i);
  assert.strictEqual(json.voice, "bn-BD-PradeepNeural");
});

test("onRequestPost - unknown TTS locale falls back locally instead of selecting Bengali voice", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = (async () => {
    upstreamCalled = true;
    throw new Error("No cloud TTS provider should be called for an unsupported locale.");
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", language: "zu-ZA" }),
      }),
      env: { OPENROUTER_API_KEY: "test-openrouter-key" },
    } as any;
    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 503);
    const json = (await response.json()) as any;
    assert.strictEqual(json.code, "FALLBACK_TO_CLIENT_TTS");
    assert.strictEqual(json.language, "zu-ZA");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(json, "voice"), false);
    assert.strictEqual(upstreamCalled, false);
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


test("onRequestPost - rejects oversized chat JSON while reading a chunked body", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(70 * 1024) }),
    }),
    env: { OPENROUTER_API_KEY: "test-secret-key" },
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 413);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "REQUEST_BODY_TOO_LARGE");
});

test("onRequestPost - rejects oversized transcription JSON before calling providers", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = (async () => {
    providerCalled = true;
    throw new Error("Provider must not be called for oversized requests.");
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: "A".repeat(6_100_001),
          format: "m4a",
        }),
      }),
      env: { GROQ_API_KEY: "test-groq-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 413);
    const json = (await response.json()) as any;
    assert.strictEqual(json.code, "REQUEST_BODY_TOO_LARGE");
    assert.strictEqual(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onRequestPost - rejects non-JSON request content types", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/speech", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-json",
    }),
    env: {},
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 415);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("onRequestPost - rejects malformed JSON with a consistent error envelope", async () => {
  const context = {
    request: new Request("https://example.com/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    }),
    env: { OPENROUTER_API_KEY: "test-secret-key" },
  } as any;

  const response = await onRequestPost(context);
  assert.strictEqual(response.status, 400);
  const json = (await response.json()) as any;
  assert.strictEqual(json.code, "INVALID_JSON_BODY");
});


test("developer health reports Native capability and unavailable Copilot runtime", async () => {
  const context = {
    request: new Request("https://example.com/api/developer/health"),
    env: { OPENROUTER_API_KEY: "test-key", AGENT_DB: testAgentDb() },
  } as any;
  const response = await onRequestGet(context);
  assert.strictEqual(response.status, 200);
  const json = (await response.json()) as any;
  assert.strictEqual(json.engines.native.available, true);
  assert.strictEqual(json.engines.copilot.available, false);
  assert.strictEqual(json.engines.auto.selectedEngine, "native");
  assert.strictEqual(json.capabilities.repositoryRead, false);
  assert.strictEqual(json.capabilities.repositoryWrite, false);
});

test("developer health does not claim analysis is ready before the D1 migration exists", async () => {
  const response = await onRequestGet({
    request: new Request("https://example.com/api/developer/health"),
    env: { OPENROUTER_API_KEY: "test-key" },
  } as any);
  assert.equal(response.status, 503);
  const payload = await response.json() as any;
  assert.equal(payload.capabilities.analysis, false);
  assert.equal(payload.capabilities.taskPersistence, false);
});

test("developer analysis rejects invalid payloads before contacting providers", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = (async () => {
    providerCalled = true;
    throw new Error("Provider must not be called for invalid payloads.");
  }) as typeof globalThis.fetch;
  try {
    const context = {
      request: new Request("https://example.com/api/developer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: " " }),
      }),
      env: { OPENROUTER_API_KEY: "test-key", AGENT_DB: testAgentDb() },
    } as any;
    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 400);
    const json = (await response.json()) as any;
    assert.strictEqual(json.code, "INVALID_DEVELOPER_PROMPT");
    assert.strictEqual(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("developer analysis keeps Copilot unavailable without calling an AI provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = (async () => {
    providerCalled = true;
    throw new Error("Copilot-unavailable requests must not call Native providers.");
  }) as typeof globalThis.fetch;
  try {
    const context = {
      request: new Request("https://example.com/api/developer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Inspect the repo", requestedEngine: "copilot" }),
      }),
      env: { OPENROUTER_API_KEY: "test-key", AGENT_DB: testAgentDb() },
    } as any;
    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 409);
    const json = (await response.json()) as any;
    assert.strictEqual(json.code, "COPILOT_RUNTIME_UNAVAILABLE");
    assert.strictEqual(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("developer analysis streams Native output with task metadata and safe context", async () => {
  const originalFetch = globalThis.fetch;
  let sentMessages: any[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    sentMessages = body.messages;
    const mockSSE =
      'data: {"choices":[{"delta":{"content":"পরিকল্পনা প্রস্তুত"}}]}\n\n' +
      "data: [DONE]\n\n";
    return new Response(mockSSE, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof globalThis.fetch;
  try {
    const context = {
      request: new Request("https://example.com/api/developer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Add a safe repository inspector",
          projectContext: "Expo + Cloudflare",
          requestedEngine: "auto",
        }),
      }),
      env: { OPENROUTER_API_KEY: "test-key", AGENT_DB: testAgentDb() },
    } as any;
    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("X-Badboy-Engine"), "native");
    assert.ok(response.headers.get("X-Badboy-Task-Id"));
    assert.strictEqual(sentMessages[0].role, "system");
    assert.match(sentMessages[0].content, /analysis-only/);
    assert.ok(sentMessages[1].content.includes("Expo + Cloudflare"));
    assert.match(sentMessages[1].content, /Add a safe repository inspector/);
    const stream = await response.text();
    assert.match(stream, /"status":"started"/);
    assert.match(stream, /"content":"পরিকল্পনা প্রস্তুত"/);
    assert.match(stream, /"status":"completed"/);
    assert.ok(stream.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("developer analysis forwards multiple buffered SSE events before the upstream stream finishes", async () => {
  const originalFetch = globalThis.fetch;
  let releaseUpstream!: () => void;
  const upstreamGate = new Promise<void>((resolve) => { releaseUpstream = resolve; });
  const encoder = new TextEncoder();

  globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"প্রথম অংশ"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"দ্বিতীয় অংশ"}}]}\n\n',
      ));
      await upstreamGate;
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } })) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/developer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Stream safely" }),
      }),
      env: { OPENROUTER_API_KEY: "test-key", AGENT_DB: testAgentDb() },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 200);
    const reader = response.body!.getReader();
    const started = await reader.read();
    assert.match(new TextDecoder().decode(started.value), /"status":"started"/);

    const firstRead = reader.read();
    const first = await Promise.race([
      firstRead.then((value) => ({ kind: "chunk" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), 500),
      ),
    ]);
    assert.strictEqual(first.kind, "chunk", "first content event should not wait for upstream EOF");
    const firstChunk = first.kind === "chunk" ? first.value : await firstRead;
    assert.match(new TextDecoder().decode(firstChunk.value), /প্রথম অংশ/);

    const secondRead = reader.read();
    const second = await Promise.race([
      secondRead.then((value) => ({ kind: "chunk" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), 500),
      ),
    ]);
    assert.strictEqual(second.kind, "chunk", "the next event in the same upstream chunk should also be forwarded before EOF");
    const secondChunk = second.kind === "chunk" ? second.value : await secondRead;
    assert.match(new TextDecoder().decode(secondChunk.value), /দ্বিতীয় অংশ/);

    releaseUpstream();
    await reader.cancel();
  } finally {
    releaseUpstream();
    globalThis.fetch = originalFetch;
  }
});;


test("authenticated D1 task creation uses only the server-assigned owner identity", async () => {
  const db = testAgentDb();
  const response = await rawOnRequestPost({
    request: new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_OWNER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Owner scoped task", ownerId: "forged-owner" }),
    }),
    env: { BADBOY_OWNER_TOKEN: TEST_OWNER_TOKEN, AGENT_DB: db },
  } as any);
  assert.equal(response.status, 201);
  assert.equal(db.calls[0].values[1], "badboy-personal-owner-v1");
  assert.equal(db.calls[0].values.includes("forged-owner"), false);
});

test("private Developer Agent D1 routes require configured storage after owner authentication", async () => {
  const paths = [
    "/api/developer/tasks",
    "/api/developer/projects",
    "/api/developer/project-memory?projectId=project-1",
  ];
  for (const path of paths) {
    const context = {
      request: new Request(`https://example.com${path}`),
      env: {},
    } as any;
    const response = await onRequestGet(context);
    assert.equal(response.status, 503);
    const payload = await response.json() as any;
    assert.equal(payload.code, "AGENT_STORAGE_NOT_CONFIGURED");
  }
});


test("personal auth verify route accepts only the configured Worker secret", async () => {
  const token = "a".repeat(43);
  const missing = await onRequestPost({
    request: new Request("https://example.com/api/auth/verify", { method: "POST" }),
    env: {},
  } as any);
  assert.equal(missing.status, 503);

  const rejected = await onRequestPost({
    request: new Request("https://example.com/api/auth/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${"b".repeat(43)}` },
    }),
    env: { BADBOY_OWNER_TOKEN: token },
  } as any);
  assert.equal(rejected.status, 401);

  const accepted = await onRequestPost({
    request: new Request("https://example.com/api/auth/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    env: { BADBOY_OWNER_TOKEN: token },
  } as any);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { authenticated: true });
});

test("onRequestPost - stops fallback when an upstream returns HTTP 200 without a response body", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedModels: string[] = [];

  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    attemptedModels.push(body.model);
    return new Response(null, { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    const context = {
      request: new Request("https://example.com/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Missing upstream stream body" }),
      }),
      env: { OPENROUTER_API_KEY: "test-secret-key" },
    } as any;

    const response = await onRequestPost(context);
    assert.strictEqual(response.status, 502);
    const json = await response.json() as any;
    assert.strictEqual(json.code, "OPENROUTER_REQUEST_FAILED");
    assert.deepStrictEqual(attemptedModels, ["openrouter/free"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test("requires owner authentication for private API and Developer Agent routes", async () => {
  const env = {
    BADBOY_OWNER_TOKEN: TEST_OWNER_TOKEN,
    OPENROUTER_API_KEY: "test-openrouter-key",
    AGENT_DB: {},
  };
  const protectedPostPaths = [
    "/api/assistant/chat",
    "/api/assistant/transcribe",
    "/api/assistant/speech",
    "/api/assistant/speak",
    "/api/developer/analyze",
  ];
  for (const path of protectedPostPaths) {
    const response = await rawOnRequestPost({
      request: new Request(`https://example.com${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      }),
      env,
    } as any);
    assert.equal(response.status, 401, `${path} must require the owner token`);
  }

  const protectedGetPaths = [
    "/api/developer/health",
    "/api/developer/tasks",
    "/api/developer/projects",
    "/api/developer/project-memory",
  ];
  for (const path of protectedGetPaths) {
    const response = await rawOnRequestGet({
      request: new Request(`https://example.com${path}`),
      env,
    } as any);
    assert.equal(response.status, 401, `${path} must require the owner token`);
  }

  for (const path of ["/api/developer/tasks", "/api/developer/projects", "/api/developer/project-memory"]) {
    const response = await rawOnRequestPost({
      request: new Request(`https://example.com${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: "untrusted-client-owner" }),
      }),
      env,
    } as any);
    assert.equal(response.status, 401, `${path} POST must require the owner token`);
  }

  const publicHealth = await rawOnRequestGet({
    request: new Request("https://example.com/api/healthz"),
    env: { OPENROUTER_API_KEY: "test-openrouter-key" },
  } as any);
  assert.equal(publicHealth.status, 200);
});

test("D1 data endpoints are available only after the owner is authenticated and storage is configured", async () => {
  const unauthorized = await rawOnRequestGet({
    request: new Request("https://example.com/api/developer/tasks"),
    env: { BADBOY_OWNER_TOKEN: TEST_OWNER_TOKEN },
  } as any);
  assert.equal(unauthorized.status, 401);

  const missingStorage = await rawOnRequestGet({
    request: new Request("https://example.com/api/developer/tasks", {
      headers: { Authorization: `Bearer ${TEST_OWNER_TOKEN}` },
    }),
    env: { BADBOY_OWNER_TOKEN: TEST_OWNER_TOKEN },
  } as any);
  assert.equal(missingStorage.status, 503);
  const payload = await missingStorage.json() as any;
  assert.equal(payload.code, "AGENT_STORAGE_NOT_CONFIGURED");
});


test("authenticated Developer Data routes exercise task list and create success branches", async () => {
  const db = testAgentDb();
  const listed = await onRequestGet({
    request: new Request("https://example.com/api/developer/tasks?limit=10"),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { tasks: [] });
  assert.match(db.calls[0].sql, /FROM agent_tasks/);
  assert.equal(db.calls[0].values[0], "badboy-personal-owner-v1");
  assert.equal(db.calls[0].values[1], 10);

  const created = await onRequestPost({
    request: new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "  Verify owner-scoped task  ",
        summary: "  Keep existing features  ",
        parentTaskId: "parent-task",
        ownerId: "forged-owner",
      }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(created.status, 201);
  const payload = await created.json() as any;
  assert.equal(payload.status, "queued");
  assert.ok(payload.taskId);
  assert.match(db.calls[1].sql, /INSERT INTO agent_tasks/);
  assert.equal(db.calls[1].values[1], "badboy-personal-owner-v1");
  assert.equal(db.calls[1].values.includes("forged-owner"), false);
  assert.match(db.calls[2].sql, /INSERT INTO agent_task_events/);
});

test("authenticated Developer Data routes exercise project and project-memory CRUD branches", async () => {
  const db = testAgentDb();
  const projects = await onRequestGet({
    request: new Request("https://example.com/api/developer/projects?limit=1000"),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(projects.status, 200);
  assert.deepEqual(await projects.json(), { projects: [] });
  assert.equal(db.calls[0].values[1], 100);

  const savedProject = await onRequestPost({
    request: new Request("https://example.com/api/developer/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: "  badboy-main  ",
        name: "  Badboy AI  ",
        summary: "  Keep local memory and voice  ",
      }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(savedProject.status, 200);
  assert.deepEqual(await savedProject.json(), {
    projectId: "test-project",
    projectKey: "badboy-main",
    name: "Badboy AI",
  });

  const memories = await onRequestGet({
    request: new Request("https://example.com/api/developer/project-memory?projectId=project-1&limit=3"),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(memories.status, 200);
  assert.deepEqual(await memories.json(), { memories: [] });
  assert.deepEqual(db.calls[2].values, ["project-1", "badboy-personal-owner-v1", 3]);

  const added = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1", category: "project-note",
        content: "Preserve the wake-word flow", source: "owner",
      }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(added.status, 201);
  assert.equal((await added.json() as any).saved, true);
  assert.match(db.calls[3].sql, /INSERT INTO agent_project_memory/);

  const deleted = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory?memoryId=memory-1", {
      method: "DELETE",
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
});

test("authenticated Developer Data validation rejects missing identifiers and invalid privacy", async () => {
  const db = testAgentDb();
  const missingProject = await onRequestGet({
    request: new Request("https://example.com/api/developer/project-memory"),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(missingProject.status, 400);
  assert.equal((await missingProject.json() as any).code, "PROJECT_ID_REQUIRED");

  const invalidPrivacy = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-1", category: "note", content: "hello", privacyLevel: "public" }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(invalidPrivacy.status, 400);
  assert.equal((await invalidPrivacy.json() as any).code, "INVALID_PRIVACY_LEVEL");

  const missingMemory = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory", { method: "DELETE" }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(missingMemory.status, 400);
  assert.equal((await missingMemory.json() as any).code, "MEMORY_ID_REQUIRED");
});

test("authenticated Developer Data maps unsupported content, malformed JSON and storage exceptions safely", async () => {
  const db = testAgentDb();
  const unsupported = await onRequestPost({
    request: new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(unsupported.status, 415);

  const malformed = await onRequestPost({
    request: new Request("https://example.com/api/developer/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json() as any).code, "INVALID_JSON_BODY");

  const brokenDb = {
    prepare() { throw new Error("D1 connection unavailable"); },
  };
  const storageFailure = await onRequestGet({
    request: new Request("https://example.com/api/developer/tasks"),
    env: { AGENT_DB: brokenDb },
  } as any);
  assert.equal(storageFailure.status, 500);
  assert.equal((await storageFailure.json() as any).code, "DEVELOPER_STORAGE_FAILED");
});


test("Developer Data clamps task limits and rejects invalid status, engine and overlong titles", async () => {
  const db = testAgentDb();
  for (const [limit, expected] of [["0", 1], ["999", 100], ["1.5", 25]] as const) {
    const response = await onRequestGet({
      request: new Request("https://example.com/api/developer/tasks?limit=" + limit),
      env: { AGENT_DB: db },
    } as any);
    assert.equal(response.status, 200);
    assert.equal(db.calls.at(-1)?.values[1], expected);
  }

  for (const body of [
    { title: "Task", status: "unknown" },
    { title: "Task", engine: "remote" },
    { title: "x".repeat(201) },
  ]) {
    const response = await onRequestPost({
      request: new Request("https://example.com/api/developer/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env: { AGENT_DB: db },
    } as any);
    assert.equal(response.status, 400);
  }
});

test("Developer Data defaults non-string optional task fields and validates project and memory fields", async () => {
  const db = testAgentDb();
  const created = await onRequestPost({
    request: new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task with optional values", summary: 42, parentTaskId: 123 }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(created.status, 201);
  assert.equal(db.calls[0].values[2], "queued");
  assert.equal(db.calls[0].values[3], "native");
  assert.equal(db.calls[0].values[5], undefined);
  assert.equal(db.calls[0].values[6], null);

  const missingProjectKey = await onRequestPost({
    request: new Request("https://example.com/api/developer/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Badboy AI" }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(missingProjectKey.status, 400);

  const memoryDefaults = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-1", category: "note", content: "Private by default", source: 42 }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(memoryDefaults.status, 201);
  assert.equal(db.calls.at(-1)?.values.includes("private"), true);
  assert.equal(db.calls.at(-1)?.values.includes("user"), true);
});

test("Developer Data returns not-found for foreign projects and memories without mutating data", async () => {
  const noProjectDb = testAgentDb({ changes: 0 });
  const missingProject = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "foreign-project", category: "note", content: "Do not save" }),
    }),
    env: { AGENT_DB: noProjectDb },
  } as any);
  assert.equal(missingProject.status, 404);
  assert.equal((await missingProject.json() as any).code, "PROJECT_NOT_FOUND");

  const noMemoryDb = testAgentDb({ changes: 0 });
  const missingMemory = await onRequestPost({
    request: new Request("https://example.com/api/developer/project-memory?memoryId=foreign-memory", {
      method: "DELETE",
    }),
    env: { AGENT_DB: noMemoryDb },
  } as any);
  assert.equal(missingMemory.status, 404);
  assert.equal((await missingMemory.json() as any).code, "MEMORY_NOT_FOUND");
});

test("Developer Data rejects oversized, non-object and invalid-length request bodies", async () => {
  const db = testAgentDb();
  for (const body of ["[]", "null"]) {
    const response = await onRequestPost({
      request: new Request("https://example.com/api/developer/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      env: { AGENT_DB: db },
    } as any);
    assert.equal(response.status, 400);
    assert.equal((await response.json() as any).code, "INVALID_JSON_BODY");
  }

  const oversized = await onRequestPost({
    request: new Request("https://example.com/api/developer/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "20001" },
      body: JSON.stringify({ projectKey: "badboy", name: "Badboy AI" }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(oversized.status, 400);

  const invalidLength = await onRequestPost({
    request: new Request("https://example.com/api/developer/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "not-a-number" },
      body: JSON.stringify({ projectKey: "badboy", name: "Badboy AI" }),
    }),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(invalidLength.status, 400);
});

test("Developer Data maps storage preparation failures to a non-leaking server error", async () => {
  const db = testAgentDb({ throwOnPrepare: true });
  const response = await onRequestGet({
    request: new Request("https://example.com/api/developer/projects"),
    env: { AGENT_DB: db },
  } as any);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "DEVELOPER_STORAGE_FAILED",
    error: "Developer Agent data could not be saved or loaded.",
  });
});


test("direct Developer Data handler covers all owner-scoped route branches in the Worker test process", async () => {
  const db = testAgentDb();
  const base = "https://example.com/api/developer/";
  const get = (path: string) => handleDeveloperDataRequest(
    new Request(base + path), { AGENT_DB: db }, "verified-owner",
  );
  const post = (path: string, body: unknown) => handleDeveloperDataRequest(
    new Request(base + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    { AGENT_DB: db }, "verified-owner",
  );

  assert.deepEqual(await (await get("tasks?limit=999"))?.json(), { tasks: [] });
  assert.equal(db.calls.at(-1)?.values[1], 100);
  const task = await post("tasks", { title: "Direct task", status: "running", engine: "auto", summary: "Summary", parentTaskId: "parent" });
  assert.equal(task?.status, 201);
  assert.equal(db.calls.at(-1)?.sql.includes("agent_task_events"), true);

  assert.deepEqual(await (await get("projects"))?.json(), { projects: [] });
  const project = await post("projects", { projectKey: "direct", name: "Direct project", summary: "Context" });
  assert.equal(project?.status, 200);

  assert.deepEqual(await (await get("project-memory?projectId=direct-project"))?.json(), { memories: [] });
  const memory = await post("project-memory", {
    projectId: "direct-project", category: "project-note", content: "Keep existing features",
    privacyLevel: "sensitive", source: "owner",
  });
  assert.equal(memory?.status, 201);

  const removed = await handleDeveloperDataRequest(
    new Request(base + "project-memory?memoryId=memory-1", { method: "DELETE" }),
    { AGENT_DB: db }, "verified-owner",
  );
  assert.equal(removed?.status, 200);
});

test("direct Developer Data handler covers malformed payload, missing IDs and not-found branches", async () => {
  const db = testAgentDb({ changes: 0 });
  const base = "https://example.com/api/developer/";
  const get = (path: string) => handleDeveloperDataRequest(
    new Request(base + path), { AGENT_DB: db }, "verified-owner",
  );
  const post = (path: string, body: string, contentType = "application/json") => handleDeveloperDataRequest(
    new Request(base + path, { method: "POST", headers: { "Content-Type": contentType }, body }),
    { AGENT_DB: db }, "verified-owner",
  );

  assert.equal((await get("project-memory"))?.status, 400);
  assert.equal((await handleDeveloperDataRequest(
    new Request(base + "project-memory", { method: "DELETE" }), { AGENT_DB: db }, "verified-owner",
  ))?.status, 400);
  assert.equal((await post("tasks", "{}", "text/plain"))?.status, 415);
  assert.equal((await post("tasks", "[]"))?.status, 400);
  assert.equal((await post("tasks", JSON.stringify({ title: "Task", status: "bad" })))?.status, 400);
  assert.equal((await post("tasks", JSON.stringify({ title: "Task", engine: "bad" })))?.status, 400);
  assert.equal((await post("projects", JSON.stringify({ name: "Missing key" })))?.status, 400);
  assert.equal((await post("project-memory", JSON.stringify({
    projectId: "p", category: "note", content: "text", privacyLevel: "public",
  })))?.status, 400);
  assert.equal((await post("project-memory", JSON.stringify({
    projectId: "missing", category: "note", content: "text",
  })))?.status, 404);
  const deleted = await handleDeveloperDataRequest(
    new Request(base + "project-memory?memoryId=missing", { method: "DELETE" }),
    { AGENT_DB: db }, "verified-owner",
  );
  assert.equal(deleted?.status, 404);
  assert.equal(await handleDeveloperDataRequest(new Request("https://example.com/elsewhere"), { AGENT_DB: db }, "verified-owner"), null);
});

test("direct Developer Agent helpers cover every engine and payload validation branch", () => {
  for (const input of [null, [], "not-an-object", 7]) {
    assert.equal(validateDeveloperAnalysisPayload(input).ok, false);
  }
  for (const input of [
    { prompt: "" }, { prompt: "x".repeat(4001) },
    { prompt: "Plan", projectContext: 42 },
    { prompt: "Plan", projectContext: "x".repeat(8001) },
    { prompt: "Plan", requestedEngine: "unknown" },
  ]) {
    assert.equal(validateDeveloperAnalysisPayload(input).ok, false);
  }
  const valid = validateDeveloperAnalysisPayload({
    prompt: "  Preserve existing features  ", projectContext: "  Expo + D1  ", requestedEngine: "auto",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.value, {
      prompt: "Preserve existing features", projectContext: "Expo + D1", requestedEngine: "auto",
    });
    const messages = buildDeveloperAnalysisMessages(valid.value);
    assert.match(messages[0].content, /analysis-only/);
    assert.match(messages[1].content, /Expo \+ D1/);
    assert.match(messages[1].content, /Preserve existing features/);
  }
  const noContext = validateDeveloperAnalysisPayload({ prompt: "  Review  " });
  assert.equal(noContext.ok, true);
  if (noContext.ok) assert.match(buildDeveloperAnalysisMessages(noContext.value)[1].content, /^User task:/);

  assert.equal(resolveDeveloperAnalysisEngine("native").status, "ready");
  assert.equal(resolveDeveloperAnalysisEngine("copilot").status, "unavailable");
  assert.equal(resolveDeveloperAnalysisEngine("auto").status, "fallback");
});
