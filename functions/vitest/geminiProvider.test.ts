import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../api/[[path]].ts";
import { adaptGeminiStreamToOpenAI, fetchGeminiChat, getGeminiModel } from "../api/geminiProvider";

 
const originalGlobalFetch = globalThis.fetch;
const TEST_OWNER_TOKEN = "a".repeat(43);

afterEach(() => {
  globalThis.fetch = originalGlobalFetch;
});

async function postServerChat(env: Record<string, unknown>): Promise<Response> {
  return handleApiRequest(
    new Request("https://badboy.test/api/assistant/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_OWNER_TOKEN}`,
      },
      body: JSON.stringify({ message: "Hello from coverage test" }),
    }),
    { ...env, BADBOY_OWNER_TOKEN: TEST_OWNER_TOKEN } as never,
  );
}

describe("server chat cross-provider fallback", () => {
  it("switches to Gemini streaming after all OpenRouter free models return 429", async () => {
    const attemptedModels: string[] = [];
    let geminiCalled = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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

    const response = await postServerChat({
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gemini fallback");
    expect(attemptedModels).toHaveLength(5);
    expect(geminiCalled).toBe(true);
  });

  it("switches from rate-limited Gemini to Groq streaming", async () => {
    let groqCalled = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        return new Response(JSON.stringify({ error: { message: "Gemini quota exceeded" } }), { status: 429 });
      }
      if (url.hostname === "api.groq.com") {
        groqCalled = true;
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-groq-key");
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("openai/gpt-oss-20b");
        expect(body.stream).toBe(true);
        return new Response(
          'data: {"choices":[{"delta":{"content":"Groq fallback"}}]}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;

    const response = await postServerChat({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Groq fallback");
    expect(groqCalled).toBe(true);
  });

  it("uses Gemini directly when OpenRouter is not configured", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input)).hostname).toBe("generativelanguage.googleapis.com");
      return new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini direct"}]}}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const response = await postServerChat({ GEMINI_API_KEY: "test-gemini-key" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gemini direct");
  });

  it("does not retry another provider for a non-retryable Gemini request error", async () => {
    let groqCalled = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 400 });
      }
      if (url.hostname === "api.groq.com") groqCalled = true;
      throw new Error("Unexpected provider host: " + url.hostname);
    }) as typeof fetch;

    const response = await postServerChat({
      GEMINI_API_KEY: "test-gemini-key",
      GROQ_API_KEY: "test-groq-key",
    });

    expect(response.status).toBe(502);
    expect(groqCalled).toBe(false);
  });
});

describe("Gemini Developer Agent provider adapter", () => {
  it("uses the configured model and sends the API key only in a request header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('data: {"candidates":[{"content":{"parts":[{"text":"হ্যালো"}]}}]}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await fetchGeminiChat(
      "server-secret",
      [
        { role: "system", content: "বাংলায় উত্তর দাও" },
        { role: "user", content: "হ্যালো" },
      ],
      "gemini-3.5-flash-lite",
      fetcher,
    );

    expect(response.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/models/gemini-3.5-flash-lite:streamGenerateContent");
    expect(String(url)).not.toContain("server-secret");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("server-secret");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("বাংলায় উত্তর দাও");
    expect(body.contents[0].parts[0].text).toBe("হ্যালো");
    expect(body.generationConfig.maxOutputTokens).toBe(8192);
  });

  it("uses the safe default model when no model is supplied", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await fetchGeminiChat("secret", [{ role: "user", content: "test" }], undefined, fetcher);
    expect(String(fetcher.mock.calls[0][0])).toContain("/models/gemini-3.5-flash-lite:");
  });

  it("converts Gemini SSE text parts to OpenAI-compatible deltas", async () => {
    const source = new Response(
      [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "},{"text":"world"}]}}]}',
        "",
        "",
      ].join("\n"),
      { headers: { "Content-Type": "text/event-stream" } },
    );

    const adapted = adaptGeminiStreamToOpenAI(source);
    const output = await adapted.text();

    expect(output).toContain('"content":"Hello "');
    expect(output).toContain('"content":"world"');
    expect(output).toContain("data: [DONE]");
    expect(adapted.headers.get("Content-Type")).toContain("text/event-stream");
    expect(adapted.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("handles CRLF, multiple events, malformed JSON, empty parts, and Gemini completion events", async () => {
    const source = new Response(
      [
        'data: {"candidates":[{"content":{"parts":[{"text":"first"}]}}]}',
        "",
        "data: not-json",
        "",
        'data: {"candidates":[{"content":{"parts":[{"text":""},{"text":7},{"text":"second"}]}}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\r\n"),
      { headers: { "Content-Type": "text/event-stream" } },
    );

    const output = await adaptGeminiStreamToOpenAI(source).text();
    expect(output).toContain('"content":"first"');
    expect(output).toContain('"content":"second"');
    expect(output).not.toContain("not-json");
    expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("flushes a final SSE event without a trailing blank line", async () => {
    const source = new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"final"}]}}]}',
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const output = await adaptGeminiStreamToOpenAI(source).text();
    expect(output).toContain('"content":"final"');
    expect(output).toContain("data: [DONE]");
  });

  it("ignores candidate entries without text content and emits the terminal marker", async () => {
    const source = new Response(
      [
        'data: {"candidates":[{},{"content":{"parts":[{"inlineData":"ignored"}]}}]}',
        "",
        "",
      ].join("\n"),
    );
    const output = await adaptGeminiStreamToOpenAI(source).text();
    expect(output).toBe("data: [DONE]\n\n");
  });

  it("returns responses without a body unchanged", () => {
    const source = new Response(null, { status: 204 });
    expect(adaptGeminiStreamToOpenAI(source)).toBe(source);
  });

  it("preserves upstream response status and headers while removing stale body headers", async () => {
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
    expect(adapted.status).toBe(202);
    expect(adapted.headers.get("X-Upstream")).toBe("kept");
    expect(adapted.headers.has("Content-Length")).toBe(false);
    expect(adapted.headers.has("Content-Encoding")).toBe(false);
    expect(adapted.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    await adapted.text();
  });

  it("rejects invalid model identifiers before making a network request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      fetchGeminiChat("secret", [{ role: "user", content: "test" }], "https://attacker.invalid", fetcher),
    ).rejects.toThrow("Invalid Gemini model identifier");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects requests with no non-empty user or assistant messages", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchGeminiChat("secret", [], undefined, fetcher)).rejects.toThrow(
      "at least one user or assistant message",
    );
    await expect(
      fetchGeminiChat("secret", [{ role: "system", content: "only system" }], undefined, fetcher),
    ).rejects.toThrow("at least one user or assistant message");
    await expect(
      fetchGeminiChat("secret", [{ role: "user", content: "   " }], undefined, fetcher),
    ).rejects.toThrow("at least one user or assistant message");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns upstream error responses without trying to parse them as SSE", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
    );

    const response = await fetchGeminiChat(
      "server-secret",
      [{ role: "user", content: "test" }],
      undefined,
      fetcher,
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toContain("rate limited");
  });

  it("propagates network errors from the configured fetcher", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network offline"));
    await expect(
      fetchGeminiChat("secret", [{ role: "user", content: "test" }], undefined, fetcher),
    ).rejects.toThrow("network offline");
  });

  it("normalizes configured model values and rejects unsafe identifiers", () => {
    expect(getGeminiModel(" gemini-3.5-flash-lite ")).toBe("gemini-3.5-flash-lite");
    expect(getGeminiModel("")).toBe("gemini-3.5-flash-lite");
    expect(getGeminiModel(undefined)).toBe("gemini-3.5-flash-lite");
    expect(getGeminiModel("https://attacker.invalid")).toBe("gemini-3.5-flash-lite");
    expect(getGeminiModel("model with spaces")).toBe("gemini-3.5-flash-lite");
  });
});
