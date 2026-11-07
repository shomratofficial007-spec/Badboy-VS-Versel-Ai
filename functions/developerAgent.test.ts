import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeveloperAnalysisMessages,
  resolveDeveloperAnalysisEngine,
  validateDeveloperAnalysisPayload,
} from "./api/developerAgent.ts";

test("validates a native developer analysis request", () => {
  const result = validateDeveloperAnalysisPayload({
    prompt: "Add repository read-only inspection",
    projectContext: "Expo app with Cloudflare API",
    requestedEngine: "native",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.prompt, "Add repository read-only inspection");
    assert.equal(result.value.requestedEngine, "native");
  }
});

test("rejects empty, oversized, and malformed developer prompts", () => {
  assert.equal(validateDeveloperAnalysisPayload({ prompt: " " }).ok, false);
  assert.equal(validateDeveloperAnalysisPayload({ prompt: "x".repeat(4001) }).ok, false);
  assert.equal(validateDeveloperAnalysisPayload(null).ok, false);
});

test("rejects oversized project context and unknown engines", () => {
  assert.equal(
    validateDeveloperAnalysisPayload({ prompt: "Plan", projectContext: "x".repeat(8001) }).ok,
    false,
  );
  assert.equal(
    validateDeveloperAnalysisPayload({ prompt: "Plan", requestedEngine: "unknown" }).ok,
    false,
  );
});

test("Copilot remains unavailable until isolated runtime is validated", () => {
  const result = resolveDeveloperAnalysisEngine("copilot");
  assert.equal(result.status, "unavailable");
  assert.equal(result.activeEngine, null);
});

test("Auto falls back transparently to Native", () => {
  const result = resolveDeveloperAnalysisEngine("auto");
  assert.equal(result.status, "fallback");
  assert.equal(result.activeEngine, "native");
  assert.match(result.reason ?? "", /Auto selected Badboy Native/);
});

test("analysis prompt never claims repository access or code execution", () => {
  const result = validateDeveloperAnalysisPayload({ prompt: "Review my feature" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const messages = buildDeveloperAnalysisMessages(result.value);
  assert.match(messages[0].content, /analysis-only/);
  assert.match(messages[0].content, /Do not claim to inspect private repository files/);
  assert.match(messages[1].content, /Review my feature/);
});


test("rejects non-object payloads, invalid field types, and malformed engines", () => {
  for (const input of [null, [], "prompt", 42]) {
    assert.equal(validateDeveloperAnalysisPayload(input).ok, false);
  }
  assert.equal(validateDeveloperAnalysisPayload({ prompt: 42 }).ok, false);
  assert.equal(
    validateDeveloperAnalysisPayload({ prompt: "Plan", projectContext: 42 }).ok,
    false,
  );
  assert.equal(
    validateDeveloperAnalysisPayload({ prompt: "Plan", requestedEngine: null }).ok,
    true,
  );
});

test("defaults to Native and trims prompt and optional project context", () => {
  const result = validateDeveloperAnalysisPayload({
    prompt: "  Inspect safely  ",
    projectContext: "  Expo + D1  ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      prompt: "Inspect safely",
      projectContext: "Expo + D1",
      requestedEngine: "native",
    });
  }
});

test("builds a user-only context message when project context is absent", () => {
  const result = validateDeveloperAnalysisPayload({ prompt: "Check tests" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const messages = buildDeveloperAnalysisMessages(result.value);
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /^User task:/);
  assert.doesNotMatch(messages[1].content, /Project context/);
  assert.equal(resolveDeveloperAnalysisEngine("native").status, "ready");
});
