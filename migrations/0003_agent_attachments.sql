-- Owner-scoped private attachment storage. Files are kept in D1 (no public bucket/URL).
-- Each BLOB is capped at 1 MB so metadata + content stay below D1's 2 MB row limit.
CREATE TABLE IF NOT EXISTS agent_attachments (
  attachment_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/markdown', 'text/csv', 'application/json'
  )),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1000000),
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_attachments_owner_created
  ON agent_attachments(owner_id, created_at DESC);
