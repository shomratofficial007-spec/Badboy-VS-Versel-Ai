import type { D1Database } from "./agentStorage.ts";

const EXPECTED_TABLES = [
  "agent_tasks",
  "agent_task_events",
  "agent_projects",
  "agent_project_memory",
  "agent_audit_logs",
] as const;

const EXPECTED_INDEXES = [
  "idx_agent_tasks_owner_updated",
  "idx_agent_tasks_owner_status_created",
  "idx_agent_task_events_owner_task_created",
  "idx_agent_projects_owner_updated",
  "idx_agent_memory_owner_project_updated",
  "idx_agent_audit_owner_created",
] as const;

// Fixed, additive Developer Agent schema only. No client-supplied SQL is accepted.
const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS agent_tasks (
    task_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    engine TEXT NOT NULL CHECK (engine IN ('native', 'copilot', 'auto')),
    title TEXT NOT NULL,
    summary TEXT,
    parent_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(task_id, owner_id),
    FOREIGN KEY (parent_task_id, owner_id)
      REFERENCES agent_tasks(task_id, owner_id) ON DELETE RESTRICT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_updated ON agent_tasks(owner_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_status_created ON agent_tasks(owner_id, status, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS agent_task_events (
    event_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id, owner_id)
      REFERENCES agent_tasks(task_id, owner_id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agent_task_events_owner_task_created ON agent_task_events(owner_id, task_id, created_at)",
  `CREATE TABLE IF NOT EXISTS agent_projects (
    project_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_key TEXT NOT NULL,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_id, project_key),
    UNIQUE(project_id, owner_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agent_projects_owner_updated ON agent_projects(owner_id, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS agent_project_memory (
    memory_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    privacy_level TEXT NOT NULL DEFAULT 'private'
      CHECK (privacy_level IN ('private', 'sensitive', 'general')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (project_id, owner_id)
      REFERENCES agent_projects(project_id, owner_id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agent_memory_owner_project_updated ON agent_project_memory(owner_id, project_id, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS agent_audit_logs (
    audit_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agent_audit_owner_created ON agent_audit_logs(owner_id, created_at DESC)",
] as const;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * One-time Preview-only migration runner. The caller must already have passed
 * personal-owner authentication. A separate Preview-only flag keeps this
 * route disabled in Production by default.
 */
export async function applyAgentMigrations(
  env: { AGENT_DB?: D1Database; AGENT_MIGRATIONS_ENABLED?: string },
  ownerId: string,
): Promise<Response> {
  if (ownerId !== "badboy-personal-owner-v1") {
    return response({ code: "PERSONAL_AUTH_REQUIRED" }, 401);
  }
  if (env.AGENT_MIGRATIONS_ENABLED !== "true") {
    return response({ code: "AGENT_MIGRATIONS_DISABLED" }, 404);
  }
  if (!env.AGENT_DB) {
    return response({ code: "AGENT_STORAGE_NOT_CONFIGURED" }, 503);
  }

  try {
    for (const statement of MIGRATION_STATEMENTS) {
      await env.AGENT_DB.prepare(statement).run();
    }

    const expectedNames = [...EXPECTED_TABLES, ...EXPECTED_INDEXES];
    const placeholders = expectedNames.map(() => "?").join(", ");
    const result = await env.AGENT_DB.prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'index') AND name IN (${placeholders})
       ORDER BY type, name`,
    ).bind(...expectedNames).all<{ name: string; type: string }>();

    const tables = (result.results ?? [])
      .filter((item) => item.type === "table")
      .map((item) => item.name)
      .sort();
    const indexes = (result.results ?? [])
      .filter((item) => item.type === "index")
      .map((item) => item.name)
      .sort();
    const missingTables = EXPECTED_TABLES.filter((name) => !tables.includes(name));
    const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexes.includes(name));

    if (missingTables.length || missingIndexes.length) {
      return response({
        code: "AGENT_MIGRATION_INCOMPLETE",
        tables,
        indexes,
        missingTables,
        missingIndexes,
      }, 503);
    }

    return response({
      status: "verified",
      migration: "0001_agent_persistence",
      tables,
      indexes,
      tableCount: tables.length,
      indexCount: indexes.length,
    });
  } catch {
    // Do not return SQL, credentials, or database internals to the caller.
    return response({ code: "AGENT_MIGRATION_FAILED" }, 503);
  }
}
