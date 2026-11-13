import { describe, expect, it, vi } from "vitest";
import { adaptGeminiStreamToOpenAI, fetchGeminiChat, getGeminiModel } from "../api/geminiProvider";

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
