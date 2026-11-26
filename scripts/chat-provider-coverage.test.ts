import assert from "node:assert/strict";
import { fetchChatWithProviderFallbacks } from "../functions/api/[[path]].ts";

const messages = [
  { role: "system" as const, content: "Be concise." },
  { role: "user" as const, content: "Hello." },
];

const originalFetch = globalThis.fetch;

async function withFetch(
  mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = mock as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run(): Promise<void> {
  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "openrouter.ai") {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini fallback"}]}}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error("Unexpected provider host: " + url.hostname);
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
    } as never, messages);
    assert.equal(routed.provider, "gemini");
    assert.match(await routed.response.text(), /Gemini fallback/);
  });

  await withFetch(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
    }
    if (url.hostname === "api.groq.com") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-groq-key");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "openai/gpt-oss-20b");
      assert.equal(body.stream, true);
      return new Response(
        'data: {"choices":[{"delta":{"content":"Groq fallback"}}]}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error("Unexpected provider host: " + url.hostname);
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
      GROQ_MODEL: "invalid model name",
    } as never, messages);
    assert.equal(routed.provider, "groq");
    assert.equal(routed.model, "openai/gpt-oss-20b");
    assert.match(await routed.response.text(), /Groq fallback/);
  });

  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 400 });
    }
    throw new Error("A non-retryable Gemini error must not call another provider.");
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
    } as never, messages);
    assert.equal(routed.provider, "gemini");
    assert.equal(routed.response.status, 400);
  });

  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "generativelanguage.googleapis.com") throw new Error("Gemini network failure");
    if (url.hostname === "api.groq.com") {
      return new Response(
        'data: {"choices":[{"delta":{"content":"Groq after Gemini network error"}}]}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error("Unexpected provider host: " + url.hostname);
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
    } as never, messages);
    assert.equal(routed.provider, "groq");
    assert.match(await routed.response.text(), /Groq after Gemini network error/);
  });

  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "openrouter.ai") throw new Error("OpenRouter network failure");
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini after OpenRouter network error"}]}}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error("Unexpected provider host: " + url.hostname);
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
    } as never, messages);
    assert.equal(routed.provider, "gemini");
    assert.match(await routed.response.text(), /Gemini after OpenRouter network error/);
  });

  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
    }
    if (url.hostname === "api.groq.com") throw new Error("Groq network failure");
    throw new Error("Unexpected provider host: " + url.hostname);
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
    } as never, messages);
    assert.equal(routed.provider, "gemini");
    assert.equal(routed.response.status, 429);
  });

  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "openrouter.ai") {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    }
    throw new Error("An aborted request must not start Gemini fallback.");
  }, async () => {
    const routed = await fetchChatWithProviderFallbacks({
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
    } as never, messages, AbortSignal.abort());
    assert.equal(routed.provider, "openrouter");
    assert.equal(routed.response.status, 429);
  });

  await assert.rejects(
    fetchChatWithProviderFallbacks({} as never, messages),
    /No chat AI provider is configured/,
  );
}

run()
  .then(() => console.log("Chat provider routing coverage smoke tests passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
