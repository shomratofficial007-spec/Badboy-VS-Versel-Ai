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
          language: "bn",
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
    env: { OPENROUTER_API_KEY: "test-key" },
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
      env: { OPENROUTER_API_KEY: "test-key" },
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
      env: { OPENROUTER_API_KEY: "test-key" },
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
      'data: {"choices":[{"delta":{"content":"পরিকল্পনা প্রস্তুত"}}]}\\n\\n' +
      "data: [DONE]\\n\\n";
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
      env: { OPENROUTER_API_KEY: "test-key" },
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
