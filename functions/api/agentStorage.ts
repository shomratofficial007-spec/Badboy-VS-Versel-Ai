/**
 * D1 persistence primitives for the Developer Agent.
 *
 * IMPORTANT: ownerId must come from a server-verified identity (for example,
 * a validated Cloudflare Access JWT). Never pass a client-supplied owner_id
 * directly into these functions. These primitives are intentionally not
 * connected to public routes until the Access identity boundary is implemented.
 */

export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface AgentTaskInput {
  taskId: string;
  ownerId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  engine: "native" | "copilot" | "auto";
  title: string;
  summary?: string;
  parentTaskId?: string | null;
  now?: string;
}

export interface AgentTaskRecord {
  task_id: string;
  owner_id: string;
  status: string;
  engine: string;
  title: string;
  summary: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentProjectRecord {
  project_id: string;
  owner_id: string;
  project_key: string;
  name: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface AgentProjectMemoryRecord {
  memory_id: string;
  owner_id: string;
  project_id: string;
  category: string;
  content: string;
  source: string;
  privacy_level: "private" | "sensitive" | "general";
  created_at: string;
  updated_at: string;
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1–${maxLength} characters.`);
  }
  return normalized;
}

function assertOwnerId(ownerId: string): string {
  return requiredText(ownerId, "Verified owner ID", 256);
}

export function createAgentStorage(db: D1Database) {
  return {
    async createTask(input: AgentTaskInput): Promise<void> {
      const ownerId = assertOwnerId(input.ownerId);
      const taskId = requiredText(input.taskId, "Task ID", 128);
      const title = requiredText(input.title, "Task title", 200);
      const summary = input.summary?.trim() || null;
      const parentTaskId = input.parentTaskId
        ? requiredText(input.parentTaskId, "Parent task ID", 128)
        : null;
      if (summary && summary.length > 4000) {
        throw new Error("Task summary must not exceed 4000 characters.");
      }
      const now = input.now ?? new Date().toISOString();

      const result = await db.prepare(
        `INSERT INTO agent_tasks
          (task_id, owner_id, status, engine, title, summary, parent_task_id, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ? IS NULL OR EXISTS (
           SELECT 1 FROM agent_tasks
           WHERE task_id = ? AND owner_id = ?
         )`,
      ).bind(
        taskId,
        ownerId,
        input.status,
        input.engine,
        title,
        summary,
        parentTaskId,
        now,
        now,
        parentTaskId,
        parentTaskId,
        ownerId,
      ).run();
      if ((result.meta?.changes ?? 0) !== 1) {
        throw new Error("Parent task must belong to the verified owner.");
      }
    },

    async appendTaskEvent(input: {
      eventId: string;
      taskId: string;
      ownerId: string;
      eventType: string;
      payload?: unknown;
      now?: string;
    }): Promise<boolean> {
      const ownerId = assertOwnerId(input.ownerId);
      const eventId = requiredText(input.eventId, "Event ID", 128);
      const taskId = requiredText(input.taskId, "Task ID", 128);
      const eventType = requiredText(input.eventType, "Event type", 80);
      const payloadJson = JSON.stringify(input.payload ?? {});
      if (payloadJson.length > 16000) {
        throw new Error("Task event payload must not exceed 16000 characters.");
      }
      const result = await db.prepare(
        `INSERT INTO agent_task_events
          (event_id, owner_id, task_id, event_type, payload_json, created_at)
         SELECT ?, ?, task_id, ?, ?, ?
         FROM agent_tasks
         WHERE task_id = ? AND owner_id = ?`,
      ).bind(
        eventId,
        ownerId,
        eventType,
        payloadJson,
        input.now ?? new Date().toISOString(),
        taskId,
        ownerId,
      ).run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async listTasks(ownerIdInput: string, limitInput = 25): Promise<AgentTaskRecord[]> {
      const ownerId = assertOwnerId(ownerIdInput);
      const limit = Math.max(1, Math.min(100, Math.floor(limitInput)));
      const result = await db.prepare(
        `SELECT task_id, owner_id, status, engine, title, summary, parent_task_id, created_at, updated_at
         FROM agent_tasks
         WHERE owner_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      ).bind(ownerId, limit).all<AgentTaskRecord>();
      return result.results ?? [];
    },

    async updateTaskStatus(input: {
      taskId: string;
      ownerId: string;
      status: AgentTaskInput["status"];
      summary?: string;
      now?: string;
    }): Promise<boolean> {
      const ownerId = assertOwnerId(input.ownerId);
      const taskId = requiredText(input.taskId, "Task ID", 128);
      const summary = input.summary?.trim();
      if (summary && summary.length > 4000) {
        throw new Error("Task summary must not exceed 4000 characters.");
      }
      const result = await db.prepare(
        "UPDATE agent_tasks SET status = ?, summary = COALESCE(?, summary), updated_at = ? WHERE task_id = ? AND owner_id = ?",
      ).bind(
        input.status,
        summary || null,
        input.now ?? new Date().toISOString(),
        taskId,
        ownerId,
      ).run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async listProjects(ownerIdInput: string, limitInput = 25): Promise<AgentProjectRecord[]> {
      const ownerId = assertOwnerId(ownerIdInput);
      const limit = Math.max(1, Math.min(100, Math.floor(limitInput)));
      const result = await db.prepare(
        "SELECT project_id, owner_id, project_key, name, summary, created_at, updated_at FROM agent_projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ?",
      ).bind(ownerId, limit).all<AgentProjectRecord>();
      return result.results ?? [];
    },

    async listProjectMemory(
      projectIdInput: string,
      ownerIdInput: string,
      limitInput = 50,
    ): Promise<AgentProjectMemoryRecord[]> {
      const ownerId = assertOwnerId(ownerIdInput);
      const projectId = requiredText(projectIdInput, "Project ID", 128);
      const limit = Math.max(1, Math.min(100, Math.floor(limitInput)));
      const result = await db.prepare(
        "SELECT memory_id, owner_id, project_id, category, content, source, privacy_level, created_at, updated_at FROM agent_project_memory WHERE project_id = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?",
      ).bind(projectId, ownerId, limit).all<AgentProjectMemoryRecord>();
      return result.results ?? [];
    },

    async upsertProject(input: {
      projectId: string;
      ownerId: string;
      projectKey: string;
      name: string;
      summary?: string;
      now?: string;
    }): Promise<string> {
      const ownerId = assertOwnerId(input.ownerId);
      const now = input.now ?? new Date().toISOString();
      const result = await db.prepare(
        `INSERT INTO agent_projects
          (project_id, owner_id, project_key, name, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner_id, project_key) DO UPDATE SET
           name = excluded.name,
           summary = excluded.summary,
           updated_at = excluded.updated_at
         RETURNING project_id`,
      ).bind(
        requiredText(input.projectId, "Project ID", 128),
        ownerId,
        requiredText(input.projectKey, "Project key", 160),
        requiredText(input.name, "Project name", 200),
        input.summary?.trim().slice(0, 4000) ?? "",
        now,
        now,
      ).first<{ project_id: string }>();
      if (!result?.project_id) throw new Error("Project could not be saved.");
      return result.project_id;
    },

    async addProjectMemory(input: {
      memoryId: string;
      ownerId: string;
      projectId: string;
      category: string;
      content: string;
      source?: string;
      privacyLevel?: "private" | "sensitive" | "general";
      now?: string;
    }): Promise<boolean> {
      const ownerId = assertOwnerId(input.ownerId);
      const content = requiredText(input.content, "Memory content", 8000);
      const now = input.now ?? new Date().toISOString();
      await db.prepare(
        `INSERT INTO agent_project_memory
          (memory_id, owner_id, project_id, category, content, source, privacy_level, created_at, updated_at)
         SELECT ?, ?, project_id, ?, ?, ?, ?, ?, ?
         FROM agent_projects
         WHERE project_id = ? AND owner_id = ?`,
      ).bind(
        requiredText(input.memoryId, "Memory ID", 128),
        ownerId,
        requiredText(input.category, "Memory category", 80),
        content,
        input.source?.trim().slice(0, 80) || "user",
        input.privacyLevel ?? "private",
        now,
        now,
        requiredText(input.projectId, "Project ID", 128),
        ownerId,
      ).run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async deleteProjectMemory(memoryId: string, ownerIdInput: string): Promise<boolean> {
      const ownerId = assertOwnerId(ownerIdInput);
      const result = await db.prepare(
        "DELETE FROM agent_project_memory WHERE memory_id = ? AND owner_id = ?",
      ).bind(requiredText(memoryId, "Memory ID", 128), ownerId).run();
      return (result.meta?.changes ?? 0) === 1;
    },
  };
}
