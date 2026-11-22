import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleAttachmentRequest,
  loadOwnerAttachments,
  MAX_ATTACHMENT_BYTES,
} from './attachments.ts';
import type { D1Database, D1PreparedStatement } from './agentStorage.ts';

class AttachmentD1 implements D1Database {
  calls: Array<{ sql: string; values: unknown[] }> = [];
  rows: any[] = [];
  quota = { attachment_count: 0, total_bytes: 0 };
  changes = 1;

  prepare(sql: string): D1PreparedStatement {
    const call = { sql, values: [] as unknown[] };
    this.calls.push(call);
    const statement = {
      bind: (...values: unknown[]) => { call.values = values; return statement; },
      first: async () => sql.includes('SUM(byte_size)') ? this.quota : this.rows[0] ?? null,
      all: async () => ({ success: true, results: this.rows }),
      run: async () => ({ success: true, meta: { changes: this.changes } }),
    };
    return statement as D1PreparedStatement;
  }
}

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.append('file', file);
  return new Request('https://worker.example/api/attachments', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });
}

test('private attachment upload stores only verified-owner scoped image bytes', async () => {
  const db = new AttachmentD1();
  const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], 'photo.png', { type: 'image/png' });
  const response = await handleAttachmentRequest(uploadRequest(file), '/api/attachments', db, 'verified-owner');
  assert.equal(response.status, 201);
  const result = await response.json() as { id: string; mimeType: string; size: number };
  assert.match(result.id, /^[0-9a-f-]{36}$/i);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.size, 9);
  assert.match(db.calls.at(-1)?.sql ?? '', /INSERT INTO agent_attachments/);
  assert.equal(db.calls.at(-1)?.values[1], 'verified-owner');
});

test('private attachment upload accepts bounded UTF-8 text documents only after content validation', async () => {
  const db = new AttachmentD1();
  const markdown = new File(['# Project Notes\\nSafe text content'], 'notes.md', { type: 'text/markdown' });
  const response = await handleAttachmentRequest(uploadRequest(markdown), '/api/attachments', db, 'verified-owner');
  assert.equal(response.status, 201);
  assert.equal(db.calls.at(-1)?.values[3], 'text/markdown');
  const stored = db.calls.at(-1)?.values[5];
  assert.ok(stored instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(stored), '# Project Notes\\nSafe text content');

  const invalidJson = await handleAttachmentRequest(
    uploadRequest(new File(['{broken'], 'data.json', { type: 'application/json' })),
    '/api/attachments', new AttachmentD1(), 'owner-a',
  );
  assert.equal(invalidJson.status, 415);
});

test('private attachment upload rejects unsupported MIME, spoofed images and oversized files', async () => {
  const db = new AttachmentD1();
  const unsupported = await handleAttachmentRequest(
    uploadRequest(new File(['<svg onload="alert(1)">'], 'image.svg', { type: 'image/svg+xml' })),
    '/api/attachments', db, 'owner-a',
  );
  assert.equal(unsupported.status, 415);
  const spoofed = await handleAttachmentRequest(
    uploadRequest(new File(['not a png'], 'photo.png', { type: 'image/png' })),
    '/api/attachments', db, 'owner-a',
  );
  assert.equal(spoofed.status, 415);
  const oversized = await handleAttachmentRequest(
    uploadRequest(new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'large.txt', { type: 'text/plain' })),
    '/api/attachments', db, 'owner-a',
  );
  assert.equal(oversized.status, 413);
});

test('private attachment upload rejects missing owner and quota overflow', async () => {
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  const noOwner = await handleAttachmentRequest(uploadRequest(file), '/api/attachments', new AttachmentD1(), '');
  assert.equal(noOwner.status, 401);
  const db = new AttachmentD1();
  db.quota = { attachment_count: 100, total_bytes: 0 };
  const quota = await handleAttachmentRequest(uploadRequest(file), '/api/attachments', db, 'owner-a');
  assert.equal(quota.status, 413);
});

test('attachment reads and deletes always include the verified owner in D1 predicates', async () => {
  const db = new AttachmentD1();
  const id = '123e4567-e89b-12d3-a456-426614174000';
  db.rows = [{
    attachment_id: id, owner_id: 'owner-a', file_name: 'note.txt', mime_type: 'text/plain',
    byte_size: 5, content: new TextEncoder().encode('hello'), created_at: '2026-11-22T00:00:00.000Z',
  }];
  const read = await handleAttachmentRequest(new Request('https://worker.example/api/attachments/' + id), '/api/attachments/' + id, db, 'owner-a');
  assert.equal(await read.text(), 'hello');
  assert.match(db.calls.at(-1)?.sql ?? '', /WHERE attachment_id = \? AND owner_id = \?/);
  const remove = await handleAttachmentRequest(new Request('https://worker.example/api/attachments/' + id, { method: 'DELETE' }), '/api/attachments/' + id, db, 'owner-a');
  assert.equal(remove.status, 200);
  assert.match(db.calls.at(-1)?.sql ?? '', /DELETE FROM agent_attachments WHERE attachment_id = \? AND owner_id = \?/);
});

test('agent attachment lookup rejects references owned by another account', async () => {
  const db = new AttachmentD1();
  db.rows = [{
    attachment_id: '123e4567-e89b-12d3-a456-426614174000', owner_id: 'owner-b',
    file_name: 'note.txt', mime_type: 'text/plain', byte_size: 5,
    content: new TextEncoder().encode('hello'), created_at: '2026-11-22T00:00:00.000Z',
  }];
  await assert.rejects(
    () => loadOwnerAttachments(db, 'owner-a', ['123e4567-e89b-12d3-a456-426614174000']),
    /unavailable for this owner/,
  );
});
