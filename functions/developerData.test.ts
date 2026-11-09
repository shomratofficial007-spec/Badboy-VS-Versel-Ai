import assert from "node:assert/strict";
import test from "node:test";
import { handleDeveloperDataRequest } from "./api/developerData.ts";
import type { D1Database, D1PreparedStatement } from "./api/agentStorage.ts";

class FakeD1 implements D1Database {
  calls: Array<{ sql: string; values: unknown[] }> = [];
  rows: unknown[] = [];
  firstRow: unknown = { project_id: "canonical-project-id" };
  changes = 1;
  throwOnPrepare = false;
  throwNonError = false;

  prepare(sql: string): D1PreparedStatement {
    if (this.throwOnPrepare) {
      if (this.throwNonError) throw "non-error storage failure";
      throw new Error("D1 connection unavailable.");
    }
    const call = { sql, values: [] as unknown[] };
    this.calls.push(call);
    const statement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      first: async () => this.firstRow,
      all: async () => ({ success: true, results: this.rows }),
      run: async () => ({ success: true, meta: { changes: this.changes } }),
    };
    return statement as D1PreparedStatement;
  }
}

function request(path: string, method = "GET", body?: unknown): Request {
  return new Request(`https://example.com/api/developer/${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const OWNER = "verified-owner-123";

test("lists only the verified owner's tasks", async () => {
  const db = new FakeD1();
  db.rows = [{ task_id: "task-1", owner_id: OWNER }];
  const response = await handleDeveloperDataRequest(request("tasks"), { AGENT_DB: db }, OWNER);
  assert.equal(response?.status, 200);
  assert.deepEqual(await response?.json(), { tasks: db.rows });
  assert.match(db.calls[0].sql, /WHERE owner_id = \?/);
  assert.equal(db.calls[0].values[0], OWNER);
});

test("creates tasks with server identity and ignores a forged ownerId", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    request("tasks", "POST", { title: "Inspect repository", ownerId: "attacker", engine: "native" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 201);
  assert.equal(db.calls[0].values[1], OWNER);
  assert.doesNotMatch(db.calls[0].values.join("|"), /attacker/);
  assert.match(db.calls[1].sql, /INSERT INTO agent_task_events/);
});

test("rejects invalid task states and unsupported content types", async () => {
  const db = new FakeD1();
  const invalid = await handleDeveloperDataRequest(
    request("tasks", "POST", { title: "Task", status: "unknown" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(invalid?.status, 400);
  const unsupported = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/tasks", { method: "POST", body: "{}" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(unsupported?.status, 415);
  assert.equal(db.calls.length, 0);
});

test("lists projects and returns the canonical ID for an upsert", async () => {
  const db = new FakeD1();
  db.rows = [{ project_id: "canonical-project-id", owner_id: OWNER }];
  const list = await handleDeveloperDataRequest(request("projects"), { AGENT_DB: db }, OWNER);
  assert.deepEqual(await list?.json(), { projects: db.rows });

  const saved = await handleDeveloperDataRequest(
    request("projects", "POST", { projectKey: "badboy", name: "Badboy AI" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(saved?.status, 200);
  assert.deepEqual(await saved?.json(), {
    projectId: "canonical-project-id",
    projectKey: "badboy",
    name: "Badboy AI",
  });
  assert.equal(db.calls[1].values[1], OWNER);
});

test("lists project memory using both project and verified owner scope", async () => {
  const db = new FakeD1();
  db.rows = [{ memory_id: "memory-1", owner_id: OWNER }];
  const response = await handleDeveloperDataRequest(
    request("project-memory?projectId=project-1"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.deepEqual(await response?.json(), { memories: db.rows });
  assert.deepEqual(db.calls[0].values, ["project-1", OWNER, 50]);
});

test("adds project memory only for an owner-owned project", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    request("project-memory", "POST", {
      projectId: "project-1",
      category: "preference",
      content: "Preserve all existing features",
      ownerId: "attacker",
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 201);
  assert.equal(db.calls[0].values[1], OWNER);
  assert.match(db.calls[0].sql, /WHERE project_id = \? AND owner_id = \?/);
});

test("reports a missing project instead of claiming memory was saved", async () => {
  const db = new FakeD1();
  db.changes = 0;
  const response = await handleDeveloperDataRequest(
    request("project-memory", "POST", { projectId: "missing", category: "note", content: "test" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 404);
});

test("deletes memory only within the verified owner scope", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/project-memory?memoryId=memory-1", { method: "DELETE" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 200);
  assert.deepEqual(db.calls[0].values, ["memory-1", OWNER]);
  assert.match(db.calls[0].sql, /WHERE memory_id = \? AND owner_id = \?/);
});

test("returns not found when the requested memory belongs to another owner", async () => {
  const db = new FakeD1();
  db.changes = 0;
  const response = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/project-memory?memoryId=other-memory", { method: "DELETE" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 404);
});

test("requires the D1 binding and rejects malformed JSON", async () => {
  const noDb = await handleDeveloperDataRequest(request("tasks"), {}, OWNER);
  assert.equal(noDb?.status, 503);
  const malformed = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    { AGENT_DB: new FakeD1() },
    OWNER,
  );
  assert.equal(malformed?.status, 400);
});

test("returns null for unrelated paths and rejects unsupported methods", async () => {
  const db = new FakeD1();
  assert.equal(await handleDeveloperDataRequest(request("other"), { AGENT_DB: db }, OWNER), null);
  const response = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/tasks", { method: "PUT" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 405);
});


test("maps missing required task fields to a client validation error", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    request("tasks", "POST", { engine: "native" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 400);
  assert.equal((await response?.json() as { code: string }).code, "INVALID_DEVELOPER_DATA");
  assert.equal(db.calls.length, 0);
});

test("uses the default task limit for invalid query values", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    request("tasks?limit=not-a-number"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 200);
  assert.equal(db.calls[0].values[1], 25);
});

test("returns a safe storage error when D1 operations fail", async () => {
  const db = new FakeD1();
  db.throwOnPrepare = true;
  const response = await handleDeveloperDataRequest(
    request("tasks"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 500);
  assert.equal((await response?.json() as { code: string }).code, "DEVELOPER_STORAGE_FAILED");
});


test("covers task limit fallback and clamping boundaries", async () => {
  for (const [query, expected] of [
    ["", 25],
    ["0", 1],
    ["101", 100],
    ["1.5", 25],
    ["-2", 1],
    ["9007199254740992", 25],
  ] as const) {
    const db = new FakeD1();
    const response = await handleDeveloperDataRequest(
      request(`tasks?limit=${query}`),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 200);
    assert.equal(db.calls[0].values[1], expected);
  }
});

test("rejects malformed declared lengths and oversized request bodies", async () => {
  const db = new FakeD1();
  for (const contentLength of ["-1", "20x", "20001"]) {
    const response = await handleDeveloperDataRequest(
      new Request("https://example.com/api/developer/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": contentLength,
        },
        body: "{}",
      }),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 400);
    assert.equal((await response?.json() as { code: string }).code, "INVALID_JSON_BODY");
  }

  const oversized = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(20_001) }),
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(oversized?.status, 400);
  assert.equal((await oversized?.json() as { code: string }).code, "INVALID_JSON_BODY");
});

test("rejects JSON values that are not objects and trims task fields", async () => {
  const db = new FakeD1();
  for (const body of ["null", "[]", '"text"', "42"]) {
    const response = await handleDeveloperDataRequest(
      new Request("https://example.com/api/developer/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 400);
    assert.equal((await response?.json() as { code: string }).code, "INVALID_JSON_BODY");
  }

  const saved = await handleDeveloperDataRequest(
    request("tasks", "POST", {
      title: "  Trim this title  ",
      summary: "s".repeat(4_100),
      parentTaskId: "parent-1",
      status: "running",
      engine: "auto",
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(saved?.status, 201);
  assert.equal(db.calls[0].values[4], "Trim this title");
  assert.equal((db.calls[0].values[5] as string).length, 4_000);
  assert.equal(db.calls[0].values[6], "parent-1");
});

test("rejects invalid task engine and overlong required fields", async () => {
  const db = new FakeD1();
  const invalidEngine = await handleDeveloperDataRequest(
    request("tasks", "POST", { title: "Task", engine: "remote" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(invalidEngine?.status, 400);
  assert.equal((await invalidEngine?.json() as { code: string }).code, "INVALID_TASK");

  const longTitle = await handleDeveloperDataRequest(
    request("tasks", "POST", { title: "t".repeat(201) }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(longTitle?.status, 400);
  assert.equal((await longTitle?.json() as { code: string }).code, "INVALID_DEVELOPER_DATA");
});

test("validates project fields and trims optional project summaries", async () => {
  const db = new FakeD1();
  for (const body of [
    { projectKey: " ", name: "Valid name" },
    { projectKey: "valid", name: "n".repeat(201) },
    { projectKey: "k".repeat(161), name: "Valid name" },
  ]) {
    const response = await handleDeveloperDataRequest(
      request("projects", "POST", body),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 400);
    assert.equal((await response?.json() as { code: string }).code, "INVALID_DEVELOPER_DATA");
  }

  const saved = await handleDeveloperDataRequest(
    request("projects", "POST", {
      projectKey: "  badboy  ",
      name: "  Badboy AI  ",
      summary: "s".repeat(4_100),
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(saved?.status, 200);
  assert.deepEqual((await saved?.json()), {
    projectId: "canonical-project-id",
    projectKey: "badboy",
    name: "Badboy AI",
  });
  assert.equal((db.calls[0].values[4] as string).length, 4_000);
});

test("covers project-memory validation and missing identifiers", async () => {
  const db = new FakeD1();
  const missingProject = await handleDeveloperDataRequest(
    request("project-memory"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(missingProject?.status, 400);
  assert.equal((await missingProject?.json() as { code: string }).code, "PROJECT_ID_REQUIRED");

  const missingMemory = await handleDeveloperDataRequest(
    new Request("https://example.com/api/developer/project-memory", { method: "DELETE" }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(missingMemory?.status, 400);
  assert.equal((await missingMemory?.json() as { code: string }).code, "MEMORY_ID_REQUIRED");

  const invalidPrivacy = await handleDeveloperDataRequest(
    request("project-memory", "POST", {
      projectId: "project-1",
      category: "note",
      content: "Content",
      privacyLevel: "public",
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(invalidPrivacy?.status, 400);
  assert.equal((await invalidPrivacy?.json() as { code: string }).code, "INVALID_PRIVACY_LEVEL");

  const invalidContent = await handleDeveloperDataRequest(
    request("project-memory", "POST", {
      projectId: "project-1",
      category: "note",
      content: " ",
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(invalidContent?.status, 400);
  assert.equal((await invalidContent?.json() as { code: string }).code, "INVALID_DEVELOPER_DATA");
});

test("accepts supported project-memory privacy levels and default source", async () => {
  for (const privacyLevel of ["private", "sensitive", "general"]) {
    const db = new FakeD1();
    const response = await handleDeveloperDataRequest(
      request("project-memory", "POST", {
        projectId: "project-1",
        category: "  architecture  ",
        content: "  Keep existing features  ",
        privacyLevel,
      }),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 201);
    assert.equal(db.calls[0].values[2], "architecture");
    assert.equal(db.calls[0].values[3], "Keep existing features");
    assert.equal(db.calls[0].values[4], "user");
    assert.equal(db.calls[0].values[5], privacyLevel);
  }
});

test("returns a safe storage error when project and memory queries fail", async () => {
  for (const [path, method, body] of [
    ["projects", "GET", undefined],
    ["projects", "POST", { projectKey: "badboy", name: "Badboy" }],
    ["project-memory?projectId=p1", "GET", undefined],
    ["project-memory", "POST", { projectId: "p1", category: "note", content: "value" }],
    ["project-memory?memoryId=m1", "DELETE", undefined],
  ] as const) {
    const db = new FakeD1();
    db.throwOnPrepare = true;
    const response = await handleDeveloperDataRequest(
      request(path, method, body),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 500, `${method} ${path}`);
    assert.equal((await response?.json() as { code: string }).code, "DEVELOPER_STORAGE_FAILED");
  }
});


test("covers alternate content-type rejection across all write routes", async () => {
  const db = new FakeD1();
  for (const path of ["tasks", "projects", "project-memory"]) {
    const response = await handleDeveloperDataRequest(
      new Request(`https://example.com/api/developer/${path}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
      { AGENT_DB: db },
      OWNER,
    );
    assert.equal(response?.status, 415);
    assert.equal((await response?.json() as { code: string }).code, "UNSUPPORTED_MEDIA_TYPE");
  }
  assert.equal(db.calls.length, 0);
});

test("covers task defaults and non-string optional fields", async () => {
  const db = new FakeD1();
  const response = await handleDeveloperDataRequest(
    request("tasks", "POST", {
      title: "Defaulted task",
      summary: 123,
      parentTaskId: 456,
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 201);
  assert.equal(db.calls[0].values[2], "queued");
  assert.equal(db.calls[0].values[3], "native");
  assert.equal(db.calls[0].values[5], null);
  assert.equal(db.calls[0].values[6], null);
});

test("covers non-string project summaries and project list limit clamping", async () => {
  const db = new FakeD1();
  const list = await handleDeveloperDataRequest(
    request("projects?limit=250"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(list?.status, 200);
  assert.equal(db.calls[0].values[1], 100);

  const saved = await handleDeveloperDataRequest(
    request("projects", "POST", {
      projectKey: "badboy",
      name: "Badboy AI",
      summary: 123,
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(saved?.status, 200);
  assert.equal(db.calls[1].values[4], "");
});

test("covers project memory source normalization and memory list limit clamping", async () => {
  const db = new FakeD1();
  const list = await handleDeveloperDataRequest(
    request("project-memory?projectId=project-1&limit=0"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(list?.status, 200);
  assert.equal(db.calls[0].values[2], 1);

  const saved = await handleDeveloperDataRequest(
    request("project-memory", "POST", {
      projectId: "project-1",
      category: "note",
      content: "Remember this",
      source: "  developer  ",
    }),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(saved?.status, 201);
  assert.equal(db.calls[1].values[4], "developer");
  assert.equal(db.calls[1].values[5], "private");
});

test("returns the safe storage failure for non-Error thrown values", async () => {
  const db = new FakeD1();
  db.throwOnPrepare = true;
  db.throwNonError = true;
  const response = await handleDeveloperDataRequest(
    request("projects"),
    { AGENT_DB: db },
    OWNER,
  );
  assert.equal(response?.status, 500);
  assert.equal((await response?.json() as { code: string }).code, "DEVELOPER_STORAGE_FAILED");
});
