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
