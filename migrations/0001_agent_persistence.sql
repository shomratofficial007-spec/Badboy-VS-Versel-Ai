-- Additive storage for the Badboy Developer Agent only.
-- Existing chat, voice, wake-word and mobile-local memory stores are untouched.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_tasks (
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
  -- Composite ownership prevents a task from referencing another owner's parent.
  FOREIGN KEY (parent_task_id, owner_id)
    REFERENCES agent_tasks(task_id, owner_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_updated
  ON agent_tasks(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_status_created
  ON agent_tasks(owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_events (
  event_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id, owner_id)
    REFERENCES agent_tasks(task_id, owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_task_events_owner_task_created
  ON agent_task_events(owner_id, task_id, created_at);

CREATE TABLE IF NOT EXISTS agent_projects (
  project_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_key TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, project_key),
  UNIQUE(project_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_projects_owner_updated
  ON agent_projects(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_project_memory (
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
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_owner_project_updated
  ON agent_project_memory(owner_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_audit_logs (
  audit_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_owner_created
  ON agent_audit_logs(owner_id, created_at DESC);
