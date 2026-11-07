import assert from "node:assert/strict";
import test from "node:test";
import { createAgentStorage, type D1Database, type D1PreparedStatement } from "./api/agentStorage.ts";

class RecordingD1 implements D1Database {
  calls: Array<{ sql: string; values: unknown[] }> = [];
  changes = 1;
  rows: unknown[] = [];

  prepare(sql: string): D1PreparedStatement {
    const call = { sql, values: [] as unknown[] };
    this.calls.push(call);
    const statement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      first: async () => null,
      all: async () => ({ success: true, results: this.rows }),
      run: async () => ({ success: true, meta: { changes: this.changes } }),
    };
    return statement as D1PreparedStatement;
  }
}

test("creates a Developer Agent task with server-provided owner scope", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await storage.createTask({
    taskId: "task-1",
    ownerId: "verified-access-subject",
    status: "queued",
    engine: "native",
    title: "Inspect repository",
    now: "2026-11-07T00:00:00.000Z",
  });
  assert.match(db.calls[0].sql, /INSERT INTO agent_tasks/);
  assert.equal(db.calls[0].values[1], "verified-access-subject");
  assert.equal(db.calls[0].values[0], "task-1");
});

test("task events are inserted only when the task belongs to the same owner", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  const inserted = await storage.appendTaskEvent({
    eventId: "event-1",
    taskId: "task-1",
    ownerId: "owner-a",
    eventType: "task_started",
    payload: { engine: "native" },
  });
  assert.equal(inserted, true);
  assert.match(db.calls[0].sql, /INSERT INTO agent_task_events[\s\S]*SELECT[\s\S]*WHERE task_id = \? AND owner_id = \?/);
  assert.equal(db.calls[0].values.at(-1), "owner-a");
});

test("does not report cross-owner task event insertion as successful", async () => {
  const db = new RecordingD1();
  db.changes = 0;
  const storage = createAgentStorage(db);
  const inserted = await storage.appendTaskEvent({
    eventId: "event-2",
    taskId: "task-owned-by-someone-else",
    ownerId: "owner-b",
    eventType: "task_started",
  });
  assert.equal(inserted, false);
});

test("lists only owner-scoped tasks and clamps result limits", async () => {
  const db = new RecordingD1();
  db.rows = [{ task_id: "task-a", owner_id: "owner-a" }];
  const storage = createAgentStorage(db);
  const rows = await storage.listTasks("owner-a", 500);
  assert.equal(rows.length, 1);
  assert.match(db.calls[0].sql, /WHERE owner_id = \?/);
  assert.deepEqual(db.calls[0].values, ["owner-a", 100]);
});

test("rejects missing owner identity and oversized event payloads", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await assert.rejects(
    () => storage.listTasks("  "),
    /Verified owner ID/,
  );
  await assert.rejects(
    () => storage.appendTaskEvent({
      eventId: "event-large",
      taskId: "task-1",
      ownerId: "owner-a",
      eventType: "context",
      payload: { text: "x".repeat(17000) },
    }),
    /16000 characters/,
  );
  assert.equal(db.calls.length, 0);
});

test("project memory deletion is constrained by owner ID", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  const deleted = await storage.deleteProjectMemory("memory-1", "owner-a");
  assert.equal(deleted, true);
  assert.match(db.calls[0].sql, /WHERE memory_id = \? AND owner_id = \?/);
  assert.deepEqual(db.calls[0].values, ["memory-1", "owner-a"]);
});


test("normalizes task text, stores optional fields, and rejects oversized summaries", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await storage.createTask({
    taskId: " task-2 ",
    ownerId: " owner-a ",
    status: "running",
    engine: "native",
    title: "  Review code  ",
    summary: "  ",
    parentTaskId: "parent-1",
    now: "2026-11-07T00:00:00.000Z",
  });
  assert.deepEqual(db.calls[0].values, [
    "task-2", "owner-a", "running", "native", "Review code", null,
    "parent-1", "2026-11-07T00:00:00.000Z", "2026-11-07T00:00:00.000Z",
  ]);
  await assert.rejects(
    () => storage.createTask({
      taskId: "task-3", ownerId: "owner-a", status: "queued",
      engine: "native", title: "Valid", summary: "x".repeat(4001),
    }),
    /4000 characters/,
  );
  await assert.rejects(
    () => storage.createTask({
      taskId: "task-4", ownerId: "owner-a", status: "queued",
      engine: "native", title: "  ",
    }),
    /Task title/,
  );
});

test("validates task and event identifiers before issuing D1 statements", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await assert.rejects(
    () => storage.createTask({
      taskId: " ", ownerId: "owner-a", status: "queued",
      engine: "native", title: "Valid",
    }),
    /Task ID/,
  );
  await assert.rejects(
    () => storage.appendTaskEvent({
      eventId: " ", taskId: "task-a", ownerId: "owner-a", eventType: "started",
    }),
    /Event ID/,
  );
  await assert.rejects(
    () => storage.appendTaskEvent({
      eventId: "event-a", taskId: "task-a", ownerId: "owner-a", eventType: " ",
    }),
    /Event type/,
  );
  assert.equal(db.calls.length, 0);
});

test("returns an empty task list when D1 has no result rows and clamps small limits", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  assert.deepEqual(await storage.listTasks("owner-a", 0), []);
  assert.deepEqual(db.calls[0].values, ["owner-a", 1]);
});

test("upserts a project with owner-scoped conflict handling and bounded summary", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await storage.upsertProject({
    projectId: "project-1",
    ownerId: "owner-a",
    projectKey: "badboy",
    name: "Badboy",
    summary: "x".repeat(4100),
    now: "2026-11-07T00:00:00.000Z",
  });
  assert.match(db.calls[0].sql, /ON CONFLICT\(owner_id, project_key\) DO UPDATE/);
  assert.deepEqual(db.calls[0].values, [
    "project-1", "owner-a", "badboy", "Badboy", "x".repeat(4000),
    "2026-11-07T00:00:00.000Z", "2026-11-07T00:00:00.000Z",
  ]);
  await assert.rejects(
    () => storage.upsertProject({
      projectId: "project-2", ownerId: " ", projectKey: "key", name: "Name",
    }),
    /Verified owner ID/,
  );
});

test("adds project memory only through a project owned by the same identity", async () => {
  const db = new RecordingD1();
  const storage = createAgentStorage(db);
  await storage.addProjectMemory({
    memoryId: "memory-2",
    ownerId: "owner-a",
    projectId: "project-1",
    category: "preference",
    content: "Keep existing features",
    source: "  ",
    now: "2026-11-07T00:00:00.000Z",
  });
  assert.match(db.calls[0].sql, /INSERT INTO agent_project_memory[\s\S]*SELECT[\s\S]*WHERE project_id = \? AND owner_id = \?/);
  assert.deepEqual(db.calls[0].values, [
    "memory-2", "owner-a", "preference", "Keep existing features", "user",
    "private", "2026-11-07T00:00:00.000Z", "2026-11-07T00:00:00.000Z",
    "project-1", "owner-a",
  ]);
  await assert.rejects(
    () => storage.addProjectMemory({
      memoryId: "memory-3", ownerId: "owner-a", projectId: "project-1",
      category: "notes", content: " ",
    }),
    /Memory content/,
  );
});

test("reports false when a memory deletion affects no rows", async () => {
  const db = new RecordingD1();
  db.changes = 0;
  const storage = createAgentStorage(db);
  assert.equal(await storage.deleteProjectMemory("memory-missing", "owner-a"), false);
});
