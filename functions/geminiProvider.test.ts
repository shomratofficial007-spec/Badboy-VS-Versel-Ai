import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adaptGeminiStreamToOpenAI,
  fetchGeminiChat,
  getGeminiModel,
} from "./api/geminiProvider.ts";

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
