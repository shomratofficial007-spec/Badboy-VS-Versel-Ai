import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSafeExpression,
  executeAgentTool,
  handleAgenticAssistantRequest,
  normalizeStructuredAgentPlan,
  rankFastModelCandidates,
  selectAgentModels,
  validateAgenticPayload,
} from "./agenticAssistant.ts";

const originalFetch = globalThis.fetch;

function agentRequest(body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Request("https://worker.example/api/assistant/agent", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function completion(content: string, toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>) {
  return Response.json({ choices: [{ message: { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }] });
}

function finalStream() {
  return new Response(
    'data: {"choices":[{"delta":{"content":"চূড়ান্ত "}}]}\n\ndata: {"choices":[{"delta":{"content":"উত্তর"}}]}\n\ndata: [DONE]\n\n',
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("safe calculator evaluates arithmetic with precedence, decimals, signs, and parentheses", () => {
  assert.equal(evaluateSafeExpression("2 + 3 * (4 - 1)"), 11);
  assert.equal(evaluateSafeExpression("-8 / 2 + 1"), -3);
  assert.equal(evaluateSafeExpression("10 % 4"), 2);
  assert.equal(evaluateSafeExpression(".5 + 1."), 1.5);
  assert.equal(evaluateSafeExpression("  +2 * 3  "), 6);
});

test("safe calculator rejects code, identifiers, malformed input, zero division, and oversized expressions", () => {
  for (const expression of ["globalThis.process", "1 + alert(1)", "2 ** 3", "1 / 0", "1 % 0", "", "1 +", "(2 + 3", "1 2", "1".repeat(121)]) {
    assert.throws(() => evaluateSafeExpression(expression));
  }
});

test("tool registry exposes only safe deterministic tools and handles empty text", () => {
  assert.deepEqual(executeAgentTool("calculator", JSON.stringify({ expression: "6 * 7" })), {
    ok: true,
    result: { expression: "6 * 7", value: 42 },
  });
  const date = executeAgentTool("current_datetime", "{}");
  assert.equal(date.ok, true);
  assert.equal((date.result as { timezone: string }).timezone, "UTC");
  assert.match((date.result as { isoUtc: string }).isoUtc, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(executeAgentTool("count_words", JSON.stringify({ text: "Badboy AI works" })), {
    ok: true,
    result: { words: 3, characters: 15, charactersWithoutWhitespace: 13 },
  });
  assert.deepEqual(executeAgentTool("count_words", JSON.stringify({ text: "  \n " })).result, {
    words: 0, characters: 4, charactersWithoutWhitespace: 0,
  });
  assert.equal(executeAgentTool("run_shell", "{}").ok, false);
  assert.equal(executeAgentTool("fetch_url", "{}").ok, false);
});

test("tool registry rejects malformed, non-object, missing, and oversized arguments", () => {
  for (const args of ["{broken", "[]", "null", "42"]) {
    assert.equal(executeAgentTool("calculator", args).ok, false);
  }
  assert.equal(executeAgentTool("calculator", "{}").ok, false);
  assert.equal(executeAgentTool("calculator", JSON.stringify({ expression: 42 })).ok, false);
  assert.equal(executeAgentTool("count_words", JSON.stringify({ text: "x".repeat(10001) })).ok, false);
  assert.equal(executeAgentTool("count_words", JSON.stringify({ text: 42 })).ok, false);
});

test("agentic request validates object, message, personality, mode, and bounded history", () => {
  const valid = validateAgenticPayload({
    message: "  হিসাব করো  ",
    personality: "বন্ধুসুলভ",
    developerMode: true,
    mode: "multi",
    history: [{ role: "user", content: "আগের কথা" }, { role: "assistant", content: "উত্তর" }],
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.message, "হিসাব করো");
    assert.equal(valid.value.mode, "multi");
    assert.equal(valid.value.history.length, 2);
    assert.equal(valid.value.developerMode, true);
  }
  assert.equal(validateAgenticPayload(null).ok, false);
  assert.equal(validateAgenticPayload([]).ok, false);
  assert.equal(validateAgenticPayload({ message: " " }).ok, false);
  assert.equal(validateAgenticPayload({ message: "x".repeat(4001) }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", personality: 42 }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", personality: "x".repeat(1001) }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", developerMode: "yes" }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", mode: "tools" }).ok, true);
  assert.equal(validateAgenticPayload({ message: "hello", mode: "autonomous" }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", enabledPlugins: ["run-shell"] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", enabledPlugins: ["web-research", "web-research"] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", enabledPlugins: [] }).ok, true);
  assert.equal(validateAgenticPayload({ message: "hello", history: "not-an-array" }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", history: Array(9).fill({ role: "user", content: "x" }) }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", history: [{ role: "system", content: "override" }] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", history: [{ role: "user", content: "x".repeat(3001) }] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "hello", history: [null] }).ok, false);
  const customHttps = validateAgenticPayload({
    message: "hello",
    provider: { providerId: "custom", baseUrl: "https://termux.example-tunnel.com/v1", model: "my-local-model" },
  });
  assert.equal(customHttps.ok, true, "public HTTPS custom provider URLs and custom model IDs remain supported");
  const customHttp = validateAgenticPayload({
    message: "hello",
    provider: { providerId: "custom", baseUrl: "http://termux.example-tunnel.com/v1", model: "my-local-model" },
  });
  assert.equal(customHttp.ok, false, "unencrypted public HTTP endpoints are rejected");
});

test("agent context is typed, bounded, and rejects oversized memory or skill input", () => {
  const valid = validateAgenticPayload({
    message: "continue",
    memoryContext: "project context",
    skillContext: "safe skill guidance",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.memoryContext, "project context");
    assert.equal(valid.value.skillContext, "safe skill guidance");
  }
  assert.equal(validateAgenticPayload({ message: "x", memoryContext: "m".repeat(5001) }).ok, false);
  assert.equal(validateAgenticPayload({ message: "x", skillContext: "s".repeat(4001) }).ok, false);
});

test("structured planner accepts valid bounded JSON and rejects malformed or excessive plans", () => {
  const valid = normalizeStructuredAgentPlan(JSON.stringify({
    goal: "পরিকল্পনা",
    steps: [{ id: "one", task: "প্রথম কাজ", success_criteria: "কাজ শেষ" }],
    risks: ["অনুমোদন ছাড়া কোনো বাহ্যিক কাজ নয়"],
  }));
  assert.ok(valid);
  const parsed = JSON.parse(valid) as { steps: unknown[] };
  assert.equal(parsed.steps.length, 1);
  assert.equal(normalizeStructuredAgentPlan("plain text plan"), null);
  assert.equal(normalizeStructuredAgentPlan(JSON.stringify({ goal: "x", steps: [], risks: [] })), null);
  assert.equal(normalizeStructuredAgentPlan(JSON.stringify({
    goal: "x",
    steps: Array(9).fill({ task: "x", success_criteria: "y" }),
    risks: [],
  })), null);
});

test("model router prioritizes code and reasoning models while retaining free fallbacks", () => {
  const code = selectAgentModels([{ role: "user", content: "Debug this TypeScript code" }]);
  const reasoning = selectAgentModels([{ role: "user", content: "Analyze architecture and compare options" }]);
  const general = selectAgentModels([{ role: "user", content: "হ্যালো, কেমন আছো?" }]);
  assert.equal(code[0], "cohere/north-mini-code:free");
  assert.equal(reasoning[0], "nvidia/nemotron-3.5-lightning:free");
  assert.equal(general[0], "openrouter/free");
  const synthesis = selectAgentModels([{ role: "user", content: "Original request:\ntest\n\nPlan:\nA multi-step plan" }]);
  assert.equal(synthesis[0], "openrouter/free");
  assert.ok([...code, ...reasoning, ...general, ...synthesis].every((model) => model === "openrouter/free" || model.endsWith(":free")));
});

test("fast model routing prioritizes models with better observed first-token latency", () => {
  const preferred = ["openrouter/free", "cohere/north-mini-code:free", "nvidia/nemotron-3.5-lightning:free"];
  const observations = new Map([
    ["openrouter/free", { averageFirstTokenMs: 4_800, samples: 3, failures: 1 }],
    ["cohere/north-mini-code:free", { averageFirstTokenMs: 1_200, samples: 4, failures: 0 }],
  ]);
  assert.deepEqual(rankFastModelCandidates(preferred, observations), [
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3.5-lightning:free",
    "openrouter/free",
  ]);
});

test("agentic endpoint rejects media type, malformed JSON, oversized body, and invalid payload", async () => {
  const wrongType = await handleAgenticAssistantRequest(agentRequest({ message: "hello" }, { "content-type": "text/plain" }), {});
  assert.equal(wrongType.status, 415);
  const malformed = new Request("https://worker.example/api/assistant/agent", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{bad",
  });
  assert.equal((await handleAgenticAssistantRequest(malformed, {})).status, 400);
  const tooLarge = new Request("https://worker.example/api/assistant/agent", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "70000" }, body: "{}",
  });
  assert.equal((await handleAgenticAssistantRequest(tooLarge, {})).status, 413);
  assert.equal((await handleAgenticAssistantRequest(agentRequest({ message: "" }), {})).status, 400);
});

test("agentic payload accepts only bounded unique attachment references", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const valid = validateAgenticPayload({ message: "inspect", attachments: [id] });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.deepEqual(valid.value.attachments, [id]);
  assert.equal(validateAgenticPayload({ message: "inspect", attachments: ["not-an-id"] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "inspect", attachments: [id, id] }).ok, false);
  assert.equal(validateAgenticPayload({ message: "inspect", attachments: [id, id, id, id, id] }).ok, false);
});

test("cloud fallback loads image attachment bytes only for the verified owner", async () => {
  const original = globalThis.fetch;
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const db = {
    prepare: (_sql: string) => {
      const statement = {
        bind: (..._values: unknown[]) => statement,
        all: async () => ({ success: true, results: [{
          attachment_id: id, owner_id: "owner-a", file_name: "photo.png",
          mime_type: "image/png", byte_size: imageBytes.length,
          content: imageBytes, created_at: "2026-11-22T00:00:00.000Z",
        }] }),
      };
      return statement;
    },
  } as any;
  const calls: any[] = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    calls.push(payload);
    return payload.stream ? finalStream() : completion("image inspected");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({
      message: "Describe this image",
      mode: "single",
      attachments: [id],
    }), { OPENROUTER_API_KEY: "server-key", AGENT_DB: db }, "owner-a");
    assert.equal(response.status, 200);
    await response.text();
    const userMessage = calls[0].messages.find((item: any) => item.role === "user");
    assert.ok(Array.isArray(userMessage.content));
    assert.equal(userMessage.content[1].type, "image_url");
    assert.match(userMessage.content[1].image_url.url, /^data:image\/png;base64,/);
    const crossOwner = await handleAgenticAssistantRequest(agentRequest({
      message: "Describe this image", mode: "single", attachments: [id],
    }), { OPENROUTER_API_KEY: "server-key", AGENT_DB: db }, "owner-b");
    assert.equal(crossOwner.status, 404);
  } finally {
    globalThis.fetch = original;
  }
});

test("agentic endpoint requires a server-side OpenRouter key", async () => {
  const response = await handleAgenticAssistantRequest(agentRequest({ message: "হ্যালো" }), { OPENROUTER_API_KEY: "  " });
  assert.equal(response.status, 503);
  const payload = await response.json() as { code: string };
  assert.equal(payload.code, "AI_NOT_CONFIGURED");
});

test("selected provider and model are used for planner, tool calling, reviewer and synthesizer", async () => {
  const calls: Array<{ url: string; authorization: string | null; model: string; stream: boolean; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init) => {
    const payload = JSON.parse(String(init?.body)) as { model: string; stream: boolean; response_format?: { type: string }; messages: Array<{ role: string; content: unknown }> };
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization"), model: payload.model, stream: payload.stream, redirect: init?.redirect });
    if (calls.length === 1) return new Response(null, { status: 307, headers: { location: "/v1/chat/completions?edge=1" } });
    if (calls.length === 2) return completion(JSON.stringify({ goal: "plan", steps: [{ id: "1", task: "execute", success_criteria: "done" }], risks: [] }));
    if (calls.length === 3) return completion("", [{ id: "tool-1", function: { name: "calculator", arguments: JSON.stringify({ expression: "6 * 7" }) } }]);
    if (calls.length === 4) return completion("executor done");
    if (calls.length === 5) return completion("review done");
    if (calls.length === 6) return finalStream();
    throw new Error("Unexpected provider call");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({
      message: "6 * 7", mode: "multi",
      provider: { providerId: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    }, { "content-type": "application/json", "X-Provider-Key": "user-provider-secret" }), {});
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /planner/);
    assert.match(body, /executor/);
    assert.match(body, /reviewer/);
    assert.match(body, /synthesizer/);
    assert.equal(calls.length, 6);
    assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(calls[1].url, "https://api.openai.com/v1/chat/completions?edge=1", "same-origin HTTPS redirects must be followed");
    assert.ok(calls.every((call) => call.authorization === "Bearer user-provider-secret"));
    assert.ok(calls.every((call) => call.model === "gpt-4o-mini"));
    assert.ok(calls.every((call) => call.redirect === "manual"), "redirects must be validated before following");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agentic provider configuration rejects unsafe endpoints and missing keys", async () => {
  const unsafe = await handleAgenticAssistantRequest(agentRequest({
    message: "hello", provider: { providerId: "openai", baseUrl: "https://127.0.0.1/v1", model: "gpt-4o-mini" },
  }, { "content-type": "application/json", "X-Provider-Key": "key" }), {});
  assert.equal(unsafe.status, 400);
  const missingKey = await handleAgenticAssistantRequest(agentRequest({
    message: "hello", provider: { providerId: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  }), {});
  assert.equal(missingKey.status, 401);
});

test("multi-agent endpoint plans, executes allowlisted tools, reviews, and streams final Bangla answer", async () => {
  const calls: Array<{ model: string; stream: boolean; response_format?: { type: string }; messages: Array<{ role: string; content: unknown }> }> = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as {
      model: string; stream: boolean; response_format?: { type: string }; messages: Array<{ role: string; content: unknown }>;
    };
    calls.push(payload);
    if (calls.length === 1) {
      assert.deepEqual(payload.response_format, { type: "json_object" });
      assert.ok(payload.messages.some((item) => String(item.content).includes("memory for the owner")));
      assert.ok(payload.messages.some((item) => String(item.content).includes("custom skill instructions")));
      return completion(JSON.stringify({ goal: "হিসাব যাচাই", steps: [{ id: "step-1", task: "৬ × ৭ গণনা", success_criteria: "ফলাফল ৪২" }], risks: [] }));
    }
    if (calls.length === 2) return completion("", [{
      id: "tool-1", function: { name: "calculator", arguments: JSON.stringify({ expression: "6 * 7" }) },
    }]);
    if (calls.length === 3) {
      assert.ok(payload.messages.some((item) => item.role === "tool" && String(item.content).includes('"value":42')));
      return completion("হিসাবের ফল ৪২");
    }
    if (calls.length === 4) return completion("ফলাফল সঠিক; ৪২ উল্লেখ করতে হবে।");
    if (calls.length === 5) return finalStream();
    throw new Error("Unexpected provider call");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({
      message: "৬ × ৭ কত?", mode: "multi", personality: "বন্ধুসুলভ", developerMode: true,
      history: [{ role: "user", content: "আগের প্রশ্ন" }],
      memoryContext: "memory for the owner",
      skillContext: "custom skill instructions",
    }), { OPENROUTER_API_KEY: "server-key" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const body = await response.text();
    assert.match(body, /planner/);
    assert.match(body, /executor/);
    assert.match(body, /reviewer/);
    assert.match(body, /synthesizer/);
    assert.match(body, /চূড়ান্ত/);
    assert.match(body, /উত্তর/);
    assert.match(body, /\[DONE\]/);
    assert.equal(calls.length, 5);
    assert.equal(calls.every((call) => call.model === "openrouter/free" || call.model.endsWith(":free")), true);
    assert.equal(calls[0].stream, false);
    assert.equal(calls[4].stream, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agentic response cancellation aborts the active upstream model request", async () => {
  let capturedSignal: AbortSignal | undefined;
  globalThis.fetch = async (_input, init) => {
    capturedSignal = init?.signal as AbortSignal | undefined;
    return new Promise<Response>((_resolve, reject) => {
      if (capturedSignal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      capturedSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "cancel this request", mode: "single" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(capturedSignal instanceof AbortSignal);
    await reader.cancel("user cancelled");
    assert.equal(capturedSignal?.aborted, true);
    await pendingRead.catch(() => undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agent retries an empty model response and reports a recoverable tool failure", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { stream: boolean; messages: Array<{ role: string; content: unknown }> };
    if (payload.stream) {
      assert.ok(payload.messages.some((item) => String(item.content).includes("Recovered answer")));
      return finalStream();
    }
    calls += 1;
    if (calls === 1) return completion("");
    if (calls === 2) {
      assert.ok(payload.messages.some((item) => String(item.content).includes("previous model response was empty")));
      return completion("Recovered answer");
    }
    return completion("Reviewed recovered answer");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "answer safely", mode: "tools" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    const body = await response.text();
    assert.match(body, /empty_model_response/);
    assert.match(body, /synthesizer/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("single-pass mode streams an answer with exactly one model completion", async () => {
  let count = 0;
  globalThis.fetch = async (_input, init) => {
    count += 1;
    const payload = JSON.parse(String(init?.body)) as { stream: boolean; max_tokens: number; stream_options?: { include_usage?: boolean } };
    assert.equal(payload.stream, true);
    assert.equal(payload.max_tokens, 1400);
    assert.equal(payload.stream_options?.include_usage, true);
    return finalStream();
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "হ্যালো", mode: "single" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    const body = await response.text();
    assert.equal(count, 1);
    assert.doesNotMatch(body, /planner|executor|reviewer/);
    assert.match(body, /synthesizer/);
    assert.match(body, /\[DONE\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider fallback retries temporary/model errors and only uses free model IDs", async () => {
  const models: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { model: string; stream: boolean };
    models.push(payload.model);
    if (payload.stream) return finalStream();
    if (models.length === 1) return Response.json({ error: { message: "model unavailable" } }, { status: 404 });
    return completion("fallback plan");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "test", mode: "tools" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    assert.equal(response.status, 200);
    const streamed = await response.text();
    assert.match(streamed, /চূড়ান্ত/);
    assert.ok(models.length >= 3);
    assert.equal(models[0], "openrouter/free");
    assert.ok(models[1]?.endsWith(":free"));
    assert.ok(models[2] === "openrouter/free" || models[2]?.endsWith(":free"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fast chat retries a free model when the first model misses the first-token deadline", async () => {
  const attempted: Array<{ model: string; stream: boolean }> = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { model: string; stream: boolean };
    attempted.push({ model: payload.model, stream: payload.stream });
    if (attempted.length === 1) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            try {
              controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"late"}}]}\n\ndata: [DONE]\n\n'));
              controller.close();
            } catch { /* The timed-out candidate may already be cancelled. */ }
          }, 6_000);
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    return finalStream();
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "hello", mode: "single" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    const body = await response.text();
    assert.match(body, /চূড়ান্ত/);
    assert.equal(attempted.length, 2);
    assert.ok(attempted.every((item) => item.stream));
    assert.notEqual(attempted[0].model, attempted[1].model);
    assert.ok(attempted.every((item) => item.model === "openrouter/free" || item.model.endsWith(":free")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider failures are returned as bounded SSE errors without leaking secrets", async () => {
  globalThis.fetch = async () => Response.json({ error: { message: "provider unavailable" } }, { status: 401 });
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "হ্যালো", mode: "single" }), {
      OPENROUTER_API_KEY: "do-not-leak-this",
    });
    const body = await response.text();
    assert.match(body, /provider unavailable/);
    assert.doesNotMatch(body, /do-not-leak-this/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("final stream rejects malformed provider events and reports interrupted streams", async () => {
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { stream: boolean };
    if (!payload.stream) return completion("execution");
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: ping\n\ndata: not-json\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"শেষ\"}}]}\n\n"));
        controller.error(new Error("stream interrupted"));
      },
    }), { headers: { "content-type": "text/event-stream" } });
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "stream test", mode: "single" }), {
      OPENROUTER_API_KEY: "server-key",
    });
    const body = await response.text();
    assert.match(body, /Agent response stream was interrupted/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("agentic executor can call bounded public web research and returns HTTPS source evidence", async () => {
  const providerCalls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    let providerHost = "";
    try { providerHost = new URL(url).hostname; } catch { /* invalid test URL */ }
    if (providerHost === "api.tavily.com") {
      providerCalls.push("tavily");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.api_key, "server-tavily-key");
      assert.equal(body.query, "latest Cloudflare Workers changes");
      return Response.json({
        answer: "A concise sourced answer.",
        results: [{ title: "Workers release", url: "https://developers.cloudflare.com/changelog/", content: "New platform features", score: 0.95 }],
      });
    }
    const payload = JSON.parse(String(init?.body)) as {
      stream: boolean;
      messages: Array<{ role: string; content: unknown }>;
      tools?: Array<{ function?: { name?: string } }>;
    };
    if (payload.stream) return finalStream();
    if (providerCalls.length === 0) {
      assert.ok(payload.tools?.some((tool) => tool.function?.name === "web_research"));
      return completion("", [{
        id: "research-1",
        function: { name: "web_research", arguments: JSON.stringify({ query: "latest Cloudflare Workers changes" }) },
      }]);
    }
    const toolMessage = payload.messages.find((item) => item.role === "tool");
    const researchResult = JSON.parse(String(toolMessage?.content)) as { results?: Array<{ url?: string }> };
    assert.equal(new URL(researchResult.results?.[0]?.url ?? "https://invalid.example").hostname, "developers.cloudflare.com");
    return completion("গবেষণার সূত্র পাওয়া গেছে।");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "Cloudflare-এর সর্বশেষ পরিবর্তন খুঁজে দাও", mode: "tools" }), {
      OPENROUTER_API_KEY: "server-openrouter-key",
      TAVILY_API_KEY: "server-tavily-key",
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /চূড়ান্ত/);
    assert.deepEqual(providerCalls, ["tavily"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("disabled owner plugins are omitted from tool definitions and cannot execute", async () => {
  let modelCalls = 0;
  let tavilyCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.tavily.com/")) {
      tavilyCalls += 1;
      return Response.json({ answer: "should not run", results: [] });
    }
    const payload = JSON.parse(String(init?.body)) as {
      stream: boolean;
      tools?: Array<{ function?: { name?: string } }>;
      messages: Array<{ role: string; content: unknown }>;
    };
    if (payload.stream) return finalStream();
    modelCalls += 1;
    if (modelCalls === 1) {
      assert.equal(payload.tools?.some((tool) => tool.function?.name === "web_research"), false);
      return completion("", [{
        id: "disabled-research",
        function: { name: "web_research", arguments: JSON.stringify({ query: "should not run" }) },
      }]);
    }
    const toolResult = payload.messages.find((item) => item.role === "tool");
    assert.match(String(toolResult?.content), /disabled by the owner/);
    return completion("Plugin is disabled.");
  };
  try {
    const response = await handleAgenticAssistantRequest(
      agentRequest({ message: "research this", mode: "tools", enabledPlugins: [] }),
      { OPENROUTER_API_KEY: "server-key", TAVILY_API_KEY: "tavily-key" },
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /চূড়ান্ত/);
    assert.match(body, /tool_execution_failed/);
    assert.equal(tavilyCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agentic integration tools fail closed when providers are not configured", async () => {
  let completionCalls = 0;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { stream: boolean };
    if (payload.stream) return finalStream();
    completionCalls += 1;
    if (completionCalls === 1) return completion("", [{
      id: "research-missing",
      function: { name: "web_research", arguments: JSON.stringify({ query: "test" }) },
    }]);
    return completion("Provider configuration is missing.");
  };
  try {
    const response = await handleAgenticAssistantRequest(agentRequest({ message: "research this", mode: "tools" }), {
      OPENROUTER_API_KEY: "server-openrouter-key",
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /চূড়ান্ত/);
    assert.equal(completionCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("agentic tools can read bounded Discord history and Google Calendar events", async () => {
  const providerRequests: string[] = [];
  let modelCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://discord.com/api/v10/")) {
      providerRequests.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bot discord-secret");
      return Response.json([{
        id: "12345678901234567",
        timestamp: "2026-11-16T10:00:00.000Z",
        author: { username: "badboy-owner" },
        content: "Deploy checklist",
      }]);
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/")) {
      providerRequests.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer calendar-secret");
      return Response.json({ items: [{
        id: "event-1",
        summary: "Release QA",
        start: { dateTime: "2026-11-16T11:00:00Z" },
        end: { dateTime: "2026-11-16T12:00:00Z" },
        htmlLink: "https://calendar.google.com/calendar/event?eid=abc",
      }] });
    }
    const payload = JSON.parse(String(init?.body)) as {
      stream: boolean;
      tools?: Array<{ function?: { name?: string } }>;
      messages: Array<{ role: string; content: unknown }>;
    };
    if (payload.stream) return finalStream();
    modelCalls += 1;
    if (modelCalls === 1) {
      const names = payload.tools?.map((tool) => tool.function?.name) ?? [];
      assert.ok(names.includes("discord_history"));
      assert.ok(names.includes("google_calendar_events"));
      return completion("", [
        { id: "discord-1", function: { name: "discord_history", arguments: JSON.stringify({ channel: "12345678901234567" }) } },
        { id: "calendar-1", function: { name: "google_calendar_events", arguments: JSON.stringify({ timeMin: "2026-11-16T00:00:00Z" }) } },
      ]);
    }
    const toolMessages = payload.messages.filter((item) => item.role === "tool").map((item) => String(item.content));
    assert.ok(toolMessages.some((item) => item.includes("Deploy checklist")));
    assert.ok(toolMessages.some((item) => item.includes("Release QA")));
    return completion("Discord ও Calendar-এর তথ্য পাওয়া গেছে।");
  };
  try {
    const response = await handleAgenticAssistantRequest(
      agentRequest({ message: "Discord update এবং calendar event দেখাও", mode: "tools" }),
      { OPENROUTER_API_KEY: "openrouter-secret", DISCORD_BOT_TOKEN: "discord-secret", GOOGLE_CALENDAR_ACCESS_TOKEN: "calendar-secret" },
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /চূড়ান্ত/);
    assert.equal(providerRequests.length, 2);
    assert.ok(providerRequests[0].startsWith("https://discord.com/api/v10/channels/"));
    assert.ok(providerRequests[1].startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events?"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
