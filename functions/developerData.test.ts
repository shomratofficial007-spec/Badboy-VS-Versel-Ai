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

  prepare(sql: string): D1PreparedStatement {
    if (this.throwOnPrepare) throw new Error("D1 connection unavailable.");
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
