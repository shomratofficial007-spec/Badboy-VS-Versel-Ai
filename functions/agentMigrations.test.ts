import assert from "node:assert/strict";
import test from "node:test";
import { applyAgentMigrations } from "./api/agentMigrations.ts";
import type { D1Database, D1PreparedStatement } from "./api/agentStorage.ts";

const expected = [
  "agent_tasks", "agent_task_events", "agent_projects",
  "agent_project_memory", "agent_audit_logs",
  "idx_agent_tasks_owner_updated", "idx_agent_tasks_owner_status_created",
  "idx_agent_task_events_owner_task_created", "idx_agent_projects_owner_updated",
  "idx_agent_memory_owner_project_updated", "idx_agent_audit_owner_created",
];

class MigrationD1 implements D1Database {
  statements: string[] = [];
  prepare(sql: string): D1PreparedStatement {
    this.statements.push(sql);
    const statement = {
      bind: (...values: unknown[]) => {
        this.values = values;
        return statement;
      },
      first: async () => null,
      all: async () => ({
        success: true,
        results: expected.map((name) => ({
          name,
          type: name.startsWith("idx_") ? "index" : "table",
        })),
      }),
      run: async () => ({ success: true, meta: { changes: 0 } }),
    };
    return statement as D1PreparedStatement;
  }
  values: unknown[] = [];
}

test("migration stays disabled unless explicitly enabled for Preview", async () => {
  const db = new MigrationD1();
  const result = await applyAgentMigrations({ AGENT_DB: db }, "badboy-personal-owner-v1");
  assert.equal(result.status, 404);
  assert.equal(db.statements.length, 0);
});

test("migration requires the verified personal owner identity", async () => {
  const db = new MigrationD1();
  const result = await applyAgentMigrations(
    { AGENT_DB: db, AGENT_MIGRATIONS_ENABLED: "true" },
    "attacker",
  );
  assert.equal(result.status, 401);
  assert.equal(db.statements.length, 0);
});

test("applies only fixed additive schema and verifies all five tables and six indexes", async () => {
  const db = new MigrationD1();
  const result = await applyAgentMigrations(
    { AGENT_DB: db, AGENT_MIGRATIONS_ENABLED: "true" },
    "badboy-personal-owner-v1",
  );
  assert.equal(result.status, 200);
  assert.equal(db.statements.length, 12);
  assert.ok(db.statements.every((sql) => !/DROP|ALTER|DELETE FROM/i.test(sql)));
  const payload = await result.json() as { status: string; tableCount: number; indexCount: number };
  assert.equal(payload.status, "verified");
  assert.equal(payload.tableCount, 5);
  assert.equal(payload.indexCount, 6);
});

test("fails closed when D1 binding is missing", async () => {
  const result = await applyAgentMigrations(
    { AGENT_MIGRATIONS_ENABLED: "true" },
    "badboy-personal-owner-v1",
  );
  assert.equal(result.status, 503);
});
