import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleApiRequest } from "../../../../functions/api/[[path]].ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("health reports AI unavailable when the secret is missing", async () => {
  const response = await handleApiRequest(request("/api/healthz"), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: "degraded",
    aiConfigured: false,
    model: "openrouter/free",
    fallbackCount: 4,
  });
});

test("health treats whitespace-only secrets as missing", async () => {
  const response = await handleApiRequest(request("/api/healthz"), {
    OPENROUTER_API_KEY: "   ",
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { aiConfigured: boolean }).aiConfigured, false);
});

test("chat rejects malformed payloads before calling the provider", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("unexpected");
  }) as typeof fetch;

  const response = await handleApiRequest(
    request("/api/assistant/chat", "POST", { message: "   " }),
    { OPENROUTER_API_KEY: "test-secret" },
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("chat reports missing provider configuration without exposing secrets", async () => {
  const response = await handleApiRequest(
    request("/api/assistant/chat", "POST", { message: "বাংলায় উত্তর দাও" }),
    {},
  );
  assert.equal(response.status, 503);
  const payload = await response.json() as { code: string; error: string };
  assert.equal(payload.code, "AI_NOT_CONFIGURED");
  assert.equal(payload.error.includes("test-secret"), false);
});

test("chat forwards a valid request and returns real streamed content in client format", async () => {
  let sentBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      'data: {"choices":[{"delta":{"content":"হ্যালো"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  }) as typeof fetch;

  const response = await handleApiRequest(
    request("/api/assistant/chat", "POST", {
      message: "হ্যালো",
      personality: "শান্ত",
      developerMode: false,
    }),
    { OPENROUTER_API_KEY: "  test-secret  " },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(sentBody?.model, "nvidia/nemotron-3.5-lightning:free");
  assert.equal(sentBody?.stream, true);
  const messages = sentBody?.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[1]?.content, "হ্যালো");

  const streamText = await response.text();
  assert.match(streamText, /data: {"content":"হ্যালো"}/);
  assert.match(streamText, /data: \[DONE\]/);
  assert.equal(streamText.includes("test-secret"), false);
});

test("chat converts provider rate limits into a clear 429 response", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "provider details must not leak" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  const response = await handleApiRequest(
    request("/api/assistant/chat", "POST", { message: "হ্যালো" }),
    { OPENROUTER_API_KEY: "test-secret" },
  );
  assert.equal(response.status, 429);
  const payload = await response.json() as { code: string; error: string };
  assert.equal(payload.code, "OPENROUTER_RATE_LIMIT");
  assert.equal(payload.error.includes("provider details"), false);
});
