import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "./assistant-chat.mts";

const OWNER_TOKEN = "a".repeat(43);

function ownerRequest(body: unknown, token = OWNER_TOKEN): Request {
  return new Request("https://badboy.example/api/assistant/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("Netlify chat fails closed before contacting OpenRouter when owner auth is missing", async () => {
  const previousOwner = process.env.BADBOY_OWNER_TOKEN;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.BADBOY_OWNER_TOKEN;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("Unauthenticated requests must not reach OpenRouter.");
  };

  try {
    const response = await handler(ownerRequest({ message: "hello" }));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code?: string }).code, "PERSONAL_AUTH_NOT_CONFIGURED");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOwner === undefined) delete process.env.BADBOY_OWNER_TOKEN;
    else process.env.BADBOY_OWNER_TOKEN = previousOwner;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test("Netlify chat rejects an invalid owner token before contacting OpenRouter", async () => {
  const previousOwner = process.env.BADBOY_OWNER_TOKEN;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.BADBOY_OWNER_TOKEN = OWNER_TOKEN;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("Invalid tokens must not reach OpenRouter.");
  };

  try {
    const response = await handler(ownerRequest({ message: "hello" }, "b".repeat(43)));
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { code?: string }).code, "PERSONAL_AUTH_INVALID");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOwner === undefined) delete process.env.BADBOY_OWNER_TOKEN;
    else process.env.BADBOY_OWNER_TOKEN = previousOwner;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test("Netlify chat streams a response only after owner authentication", async () => {
  const previousOwner = process.env.BADBOY_OWNER_TOKEN;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.BADBOY_OWNER_TOKEN = OWNER_TOKEN;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  let upstreamCalls = 0;
  globalThis.fetch = async (_input, init) => {
    upstreamCalls += 1;
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-openrouter-key");
    return new Response(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  };

  try {
    const response = await handler(ownerRequest({ message: "hello" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/event-stream");
    const stream = await response.text();
    assert.match(stream, /"content":"hello"/);
    assert.match(stream, /data: \[DONE\]/);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOwner === undefined) delete process.env.BADBOY_OWNER_TOKEN;
    else process.env.BADBOY_OWNER_TOKEN = previousOwner;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
