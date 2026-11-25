import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchChatWithProviderFallbacks, handleApiRequest } from "./api/[[path]].ts";
import {
  adaptGeminiStreamToOpenAI,
  fetchGeminiChat,
  getGeminiModel,
} from "./api/geminiProvider.ts";


const CHAT_TEST_OWNER_TOKEN = "a".repeat(43);

function chatRequest(env: Record<string, unknown>): Promise<Response> {
  return handleApiRequest(
    new Request("https://badboy.test/api/assistant/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHAT_TEST_OWNER_TOKEN}`,
      },
      body: JSON.stringify({ message: "Hello from Node coverage test" }),
    }),
    { ...env, BADBOY_OWNER_TOKEN: CHAT_TEST_OWNER_TOKEN } as never,
  );
}


describe("direct provider routing coverage", () => {
  const messages = [
    { role: "system" as const, content: "Be concise." },
    { role: "user" as const, content: "Hello." },
  ];

  it("returns the Gemini stream after exhausting OpenRouter model fallbacks", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "openrouter.ai") {
        return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
      }
      if (url.hostname === "generativelanguage.googleapis.com") {
        return new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"direct Gemini"}]}}]}\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;
    try {
      const routed = await fetchChatWithProviderFallbacks({
        OPENROUTER_API_KEY: "test-openrouter-key",
        GEMINI_API_KEY: "test-gemini-key",
      } as never, messages);
      assert.equal(routed.provider, "gemini");
      assert.equal(routed.model, "gemini-3.5-flash-lite");
      assert.match(await routed.response.text(), /direct Gemini/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns the Groq stream when Gemini is rate limited", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
      }
      if (url.hostname === "api.groq.com") {
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-groq-key");
        return new Response(
          'data: {"choices":[{"delta":{"content":"direct Groq"}}]}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;
    try {
      const routed = await fetchChatWithProviderFallbacks({
        GEMINI_API_KEY: "test-gemini-key",
        GROQ_API_KEY: "test-groq-key",
      } as never, messages);
      assert.equal(routed.provider, "groq");
      assert.equal(routed.model, "openai/gpt-oss-20b");
      assert.match(await routed.response.text(), /direct Groq/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


describe("server chat cross-provider fallback (Node coverage suite)", () => {
  it("uses Gemini after all OpenRouter free models are rate limited", async () => {
    const originalFetch = globalThis.fetch;
    const attemptedModels: string[] = [];
    let geminiCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "openrouter.ai") {
        attemptedModels.push(JSON.parse(String(init?.body)).model);
        return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
      }
      if (url.hostname === "generativelanguage.googleapis.com") {
        geminiCalled = true;
        return new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Gemini fallback"}]}}]}\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;
    try {
      const response = await chatRequest({
        OPENROUTER_API_KEY: "test-openrouter-key",
        GEMINI_API_KEY: "test-gemini-key",
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Gemini fallback/);
      assert.equal(attemptedModels.length, 5);
      assert.equal(geminiCalled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses Groq when Gemini returns 429", async () => {
    const originalFetch = globalThis.fetch;
    let geminiCalled = false;
    let groqCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        geminiCalled = true;
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
      }
      if (url.hostname === "api.groq.com") {
        groqCalled = true;
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
    }) as typeof fetch;
    try {
      const response = await chatRequest({
        GEMINI_API_KEY: "test-gemini-key",
        GROQ_API_KEY: "test-groq-key",
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Groq fallback/);
      assert.equal(geminiCalled, true);
      assert.equal(groqCalled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("serves Gemini-only chat without an OpenRouter key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      assert.equal(new URL(String(input)).hostname, "generativelanguage.googleapis.com");
      return new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini only"}]}}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;
    try {
      const response = await chatRequest({ GEMINI_API_KEY: "test-gemini-key" });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Gemini only/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not try Groq after a non-retryable Gemini 400 response", async () => {
    const originalFetch = globalThis.fetch;
    let groqCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 400 });
      }
      if (url.hostname === "api.groq.com") groqCalled = true;
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;
    try {
      const response = await chatRequest({
        GEMINI_API_KEY: "test-gemini-key",
        GROQ_API_KEY: "test-groq-key",
      });
      assert.equal(response.status, 502);
      assert.equal(groqCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


describe("Gemini Developer Agent provider adapter (Node coverage suite)", () => {
  it("builds Gemini contents, combines system instructions, and keeps the key in a header", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.match(String(input), /\/models\/gemini-3\.5-flash-lite:streamGenerateContent/);
      assert.equal(String(input).includes("server-secret"), false);
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "server-secret");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.systemInstruction.parts[0].text, "first instruction\n\nsecond instruction");
      assert.deepEqual(body.contents, [
        { role: "user", parts: [{ text: "hello" }] },
        { role: "model", parts: [{ text: "prior answer" }] },
      ]);
      assert.equal(body.generationConfig.maxOutputTokens, 8192);
      return new Response("upstream", { status: 200 });
    };
    const response = await fetchGeminiChat("server-secret", [
      { role: "system", content: " first instruction " },
      { role: "user", content: "hello" },
      { role: "assistant", content: "prior answer" },
      { role: "system", content: "second instruction" },
      { role: "user", content: "   " },
    ], undefined, fetcher);
    assert.equal(response.status, 200);
  });

  it("forwards the caller abort signal to the Gemini upstream request", async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | null | undefined;
    await fetchGeminiChat(
      "secret",
      [{ role: "user", content: "test" }],
      undefined,
      async (_input, init) => {
        capturedSignal = init?.signal;
        return new Response(null, { status: 503 });
      },
      controller.signal,
    );
    assert.equal(capturedSignal, controller.signal);
  });

  it("uses the default model when the configured value is blank", async () => {
    let requested = "";
    await fetchGeminiChat("secret", [{ role: "user", content: "test" }], "  ", async (url) => {
      requested = String(url);
      return new Response(null, { status: 204 });
    });
    assert.match(requested, /gemini-3\.5-flash-lite/);
  });

  it("converts multiple Gemini text parts into OpenAI-compatible stream deltas", async () => {
    const source = new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello "},{"text":"world"}]}}]}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const adapted = adaptGeminiStreamToOpenAI(source);
    const output = await adapted.text();
    assert.match(output, /"content":"Hello "/);
    assert.match(output, /"content":"world"/);
    assert.match(output, /data: \[DONE\]/);
    assert.match(adapted.headers.get("Content-Type") ?? "", /text\/event-stream/);
    assert.match(adapted.headers.get("Cache-Control") ?? "", /no-cache/);
  });

  it("handles chunk boundaries, CRLF, malformed JSON, empty text, and upstream DONE events", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"split',
      ' event"}]}}]}\r\n\r\ndata: not-json\r\n\r\n',
      'data: {"candidates":[{"content":{"parts":[{"text":""},{"text":7},{"text":"second"}]}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
    ];
    let index = 0;
    const source = new Response(new ReadableStream({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
        else controller.close();
      },
    }));
    const output = await adaptGeminiStreamToOpenAI(source).text();
    assert.match(output, /"content":"split event"/);
    assert.match(output, /"content":"second"/);
    assert.doesNotMatch(output, /not-json/);
    assert.equal((output.match(/data: \[DONE\]/g) ?? []).length, 1);
  });

  it("flushes a final event without a trailing blank line", async () => {
    const source = new Response('data: {"candidates":[{"content":{"parts":[{"text":"final"}]}}]}');
    const output = await adaptGeminiStreamToOpenAI(source).text();
    assert.match(output, /"content":"final"/);
    assert.match(output, /data: \[DONE\]/);
  });

  it("ignores candidates and parts without text", async () => {
    const source = new Response(
      'data: {"candidates":[{},{ "content":{"parts":[{"inlineData":"ignored"}]}}]}\n\n',
    );
    assert.equal(await adaptGeminiStreamToOpenAI(source).text(), "data: [DONE]\n\n");
  });

  it("returns a response with no body unchanged", () => {
    const source = new Response(null, { status: 204 });
    assert.equal(adaptGeminiStreamToOpenAI(source), source);
  });

  it("preserves upstream status and safe headers while removing stale body headers", async () => {
    const source = new Response("data: {}\n\n", {
      status: 202,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "public",
        "Content-Length": "10",
        "Content-Encoding": "gzip",
        "X-Upstream": "kept",
      },
    });
    const adapted = adaptGeminiStreamToOpenAI(source);
    assert.equal(adapted.status, 202);
    assert.equal(adapted.headers.get("X-Upstream"), "kept");
    assert.equal(adapted.headers.has("Content-Length"), false);
    assert.equal(adapted.headers.has("Content-Encoding"), false);
    assert.equal(adapted.headers.get("Cache-Control"), "no-cache, no-transform");
    await adapted.text();
  });

  it("propagates a stream read failure to the consumer", async () => {
    const source = new Response(new ReadableStream({
      start(controller) { controller.error(new Error("stream interrupted")); },
    }));
    const adapted = adaptGeminiStreamToOpenAI(source);
    await assert.rejects(adapted.text(), /stream interrupted/);
  });

  it("rejects an unsafe model before performing a network request", async () => {
    let called = false;
    await assert.rejects(
      fetchGeminiChat("secret", [{ role: "user", content: "test" }], "https://attacker.invalid", async () => {
        called = true;
        return new Response();
      }),
      /Invalid Gemini model identifier/,
    );
    assert.equal(called, false);
  });

  it("rejects empty conversations and system-only conversations", async () => {
    let called = false;
    const fetcher = async () => { called = true; return new Response(); };
    await assert.rejects(fetchGeminiChat("secret", [], undefined, fetcher), /at least one user or assistant message/);
    await assert.rejects(fetchGeminiChat("secret", [{ role: "system", content: "only system" }], undefined, fetcher), /at least one user or assistant message/);
    await assert.rejects(fetchGeminiChat("secret", [{ role: "user", content: "   " }], undefined, fetcher), /at least one user or assistant message/);
    assert.equal(called, false);
  });

  it("returns non-success upstream responses unchanged", async () => {
    const response = await fetchGeminiChat("secret", [{ role: "user", content: "test" }], undefined, async () =>
      new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
    );
    assert.equal(response.status, 429);
    assert.match(await response.text(), /rate limited/);
  });

  it("propagates network failures", async () => {
    await assert.rejects(
      fetchGeminiChat("secret", [{ role: "user", content: "test" }], undefined, async () => {
        throw new Error("network offline");
      }),
      /network offline/,
    );
  });

  it("normalizes configured model values and falls back for unsafe identifiers", () => {
    assert.equal(getGeminiModel(" gemini-3.5-flash-lite "), "gemini-3.5-flash-lite");
    assert.equal(getGeminiModel(""), "gemini-3.5-flash-lite");
    assert.equal(getGeminiModel(undefined), "gemini-3.5-flash-lite");
    assert.equal(getGeminiModel("https://attacker.invalid"), "gemini-3.5-flash-lite");
    assert.equal(getGeminiModel("model with spaces"), "gemini-3.5-flash-lite");
  });
});
