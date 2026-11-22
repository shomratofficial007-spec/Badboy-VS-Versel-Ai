import type { D1Database } from './agentStorage.ts';

export const MAX_ATTACHMENT_BYTES = 1_000_000;
export const MAX_OWNER_ATTACHMENT_BYTES = 25_000_000;
export const MAX_OWNER_ATTACHMENT_COUNT = 100;

export interface StoredAgentAttachment {
  attachment_id: string;
  owner_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  content: ArrayBuffer | Uint8Array;
  created_at: string;
}

export interface OwnerAttachmentContent {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    },
  });
}

function sanitizeFileName(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f/\\]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return clean || 'attachment';
}

function bytesFrom(value: ArrayBuffer | Uint8Array | ArrayBufferView): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

function resolveFileType(name: string, declaredType: string, bytes: Uint8Array): string | null {
  const type = declaredType.toLowerCase().split(';')[0].trim();
  if (isPng(bytes)) return type === 'image/png' || type === 'application/octet-stream' || !type ? 'image/png' : null;
  if (isJpeg(bytes)) return type === 'image/jpeg' || type === 'image/jpg' || type === 'application/octet-stream' || !type ? 'image/jpeg' : null;
  if (isWebp(bytes)) return type === 'image/webp' || type === 'application/octet-stream' || !type ? 'image/webp' : null;

  const extension = name.toLowerCase().split('.').pop() ?? '';
  const textTypeByExtension: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
  };
  const expected = textTypeByExtension[extension];
  if (!expected || (type && type !== expected && type !== 'text/plain' && type !== 'application/octet-stream')) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\u0000')) return null;
    if (expected === 'application/json') JSON.parse(text);
  } catch {
    return null;
  }
  return expected;
}

function contentBytes(record: StoredAgentAttachment): Uint8Array {
  return bytesFrom(record.content);
}

export async function loadOwnerAttachments(
  db: D1Database,
  ownerIdInput: string,
  ids: string[],
): Promise<OwnerAttachmentContent[]> {
  const ownerId = ownerIdInput.trim();
  if (!ownerId || ids.length > 4 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error('Attachment references are invalid.');
  }
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db.prepare(
    `SELECT attachment_id, owner_id, file_name, mime_type, byte_size, content, created_at
     FROM agent_attachments
     WHERE owner_id = ? AND attachment_id IN (${placeholders})`,
  ).bind(ownerId, ...ids).all<StoredAgentAttachment>();
  const records = result.results ?? [];
  if (records.length !== ids.length || records.some((record) => record.owner_id !== ownerId)) {
    throw new Error('One or more attachments are unavailable for this owner.');
  }
  const byId = new Map(records.map((record) => [record.attachment_id, record]));
  return ids.map((id) => {
    const record = byId.get(id);
    if (!record) throw new Error('Attachment not found.');
    return {
      id: record.attachment_id,
      name: record.file_name,
      mimeType: record.mime_type,
      size: record.byte_size,
      bytes: contentBytes(record),
    };
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export async function handleAttachmentRequest(
  request: Request,
  pathname: string,
  db: D1Database | undefined,
  ownerIdInput: string,
): Promise<Response> {
  const ownerId = ownerIdInput.trim();
  if (!ownerId) return json({ code: 'OWNER_REQUIRED', error: 'Verified owner identity is required.' }, 401);
  if (!db) return json({ code: 'ATTACHMENT_STORAGE_NOT_CONFIGURED', error: 'Private attachment storage is not configured.' }, 503);

  if (pathname === '/api/attachments' && request.method === 'POST') {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'multipart/form-data') {
      return json({ code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Upload must use multipart/form-data.' }, 415);
    }
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_ATTACHMENT_BYTES + 32_768) {
      return json({ code: 'ATTACHMENT_TOO_LARGE', error: 'Attachment exceeds the 1 MB limit.' }, 413);
    }

    let form: FormData;
    try { form = await request.formData(); } catch {
      return json({ code: 'INVALID_MULTIPART_BODY', error: 'Attachment upload body is invalid.' }, 400);
    }
    const keys = [...form.keys()];
    const fileValue = form.get('file');
    if (keys.length !== 1 || keys[0] !== 'file' || !fileValue ||
      typeof fileValue !== 'object' || !('arrayBuffer' in fileValue) ||
      typeof (fileValue as { name?: unknown }).name !== 'string' ||
      typeof (fileValue as { size?: unknown }).size !== 'number') {
      return json({ code: 'INVALID_ATTACHMENT', error: 'Exactly one file field is required.' }, 400);
    }
    const file = fileValue as File;
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
      return json({ code: 'ATTACHMENT_TOO_LARGE', error: 'Attachment must be between 1 byte and 1 MB.' }, 413);
    }

    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await file.arrayBuffer()); } catch {
      return json({ code: 'ATTACHMENT_READ_FAILED', error: 'Attachment could not be read.' }, 400);
    }
    if (bytes.byteLength !== file.size) {
      return json({ code: 'ATTACHMENT_READ_FAILED', error: 'Attachment size could not be verified.' }, 400);
    }
    const name = sanitizeFileName(file.name);
    const mimeType = resolveFileType(name, file.type || '', bytes);
    if (!mimeType) {
      return json({ code: 'UNSUPPORTED_ATTACHMENT_TYPE', error: 'Supported files: PNG, JPEG, WebP, TXT, Markdown, CSV and JSON.' }, 415);
    }

    try {
      const quota = await db.prepare(
        'SELECT COUNT(*) AS attachment_count, COALESCE(SUM(byte_size), 0) AS total_bytes FROM agent_attachments WHERE owner_id = ?',
      ).bind(ownerId).first<{ attachment_count: number; total_bytes: number }>();
      if ((quota?.attachment_count ?? 0) >= MAX_OWNER_ATTACHMENT_COUNT ||
        (quota?.total_bytes ?? 0) + bytes.byteLength > MAX_OWNER_ATTACHMENT_BYTES) {
        return json({ code: 'ATTACHMENT_QUOTA_EXCEEDED', error: 'Private attachment storage limit reached. Delete older attachments before uploading more.' }, 413);
      }
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const inserted = await db.prepare(
        'INSERT INTO agent_attachments (attachment_id, owner_id, file_name, mime_type, byte_size, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, ownerId, name, mimeType, bytes.byteLength, bytes, createdAt).run();
      if ((inserted.meta?.changes ?? 0) !== 1) {
        return json({ code: 'ATTACHMENT_SAVE_FAILED', error: 'Private attachment could not be saved.' }, 503);
      }
      return json({ id, name, mimeType, size: bytes.byteLength, createdAt }, 201);
    } catch {
      return json({ code: 'ATTACHMENT_SAVE_FAILED', error: 'Private attachment could not be saved.' }, 503);
    }
  }

  const match = /^\/api\/attachments\/([0-9a-f-]{36})$/i.exec(pathname);
  if (!match) return json({ code: 'ATTACHMENT_NOT_FOUND', error: 'Attachment endpoint not found.' }, 404);
  const id = match[1];

  if (request.method === 'DELETE') {
    try {
      const result = await db.prepare(
        'DELETE FROM agent_attachments WHERE attachment_id = ? AND owner_id = ?',
      ).bind(id, ownerId).run();
      if ((result.meta?.changes ?? 0) !== 1) {
        return json({ code: 'ATTACHMENT_NOT_FOUND', error: 'Attachment was not found for this owner.' }, 404);
      }
      return json({ deleted: true, id });
    } catch {
      return json({ code: 'ATTACHMENT_DELETE_FAILED', error: 'Attachment could not be deleted.' }, 503);
    }
  }

  if (request.method === 'GET') {
    try {
      const record = await db.prepare(
        'SELECT attachment_id, owner_id, file_name, mime_type, byte_size, content, created_at FROM agent_attachments WHERE attachment_id = ? AND owner_id = ? LIMIT 1',
      ).bind(id, ownerId).first<StoredAgentAttachment>();
      if (!record || record.owner_id !== ownerId) {
        return json({ code: 'ATTACHMENT_NOT_FOUND', error: 'Attachment was not found for this owner.' }, 404);
      }
      const bytes = contentBytes(record);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': record.mime_type,
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.file_name)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    } catch {
      return json({ code: 'ATTACHMENT_READ_FAILED', error: 'Attachment could not be retrieved.' }, 503);
    }
  }

  return json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed for this attachment.' }, 405);
}
