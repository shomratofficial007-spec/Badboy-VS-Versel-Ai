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
    const body = JSON.parse(String(init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("বাংলায় উত্তর দাও");
    expect(body.contents[0].parts[0].text).toBe("হ্যালো");
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
  });

  it("falls back to the safe default for an invalid model name", () => {
    expect(getGeminiModel("gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(getGeminiModel("https://attacker.invalid")).toBe("gemini-3.5-flash-lite");
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
});
