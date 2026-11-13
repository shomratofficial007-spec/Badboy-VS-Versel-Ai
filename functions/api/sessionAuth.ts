import { authenticatePersonalOwner, type PersonalAuthEnv } from "./personalAuth.ts";

export interface SessionDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run<T = unknown>(): Promise<{ success: boolean; meta?: { changes?: number } }>;
    };
  };
}
export interface SessionEnv extends PersonalAuthEnv { AGENT_DB?: SessionDatabase; }
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  }});
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function randomSession(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function bearer(request: Request): string | null {
  const match = /^Bearer ([A-Fa-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}
function unavailable(): Response {
  return json({ code: "SESSION_STORAGE_UNAVAILABLE", error: "Owner session storage is unavailable." }, 503);
}

/** Owner Token is accepted only here, once per login, then exchanged for a random session. */
export async function createOwnerSession(request: Request, env: SessionEnv): Promise<Response> {
  if (!env.AGENT_DB) return unavailable();
  const verified = await authenticatePersonalOwner(request, env);
  if (!verified.ok) return verified.response;
  try {
    const token = randomSession();
    const tokenHash = await digest(token);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + SESSION_TTL_SECONDS;
    await env.AGENT_DB.prepare(
      "INSERT INTO owner_sessions (token_hash, owner_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)"
    ).bind(tokenHash, verified.identity.ownerId, now, expiresAt).run();
    return json({ authenticated: true, sessionToken: token, expiresAt });
  } catch {
    return unavailable();
  }
}

/** All subsequent private API requests validate only the opaque session, never the Owner Token. */
export async function authenticateOwnerSession(request: Request, env: SessionEnv) {
  const token = bearer(request);
  if (!token) return { ok: false as const, response: json({ code: "SESSION_REQUIRED", error: "Owner login session is required." }, 401) };
  if (!env.AGENT_DB) return { ok: false as const, response: unavailable() };
  try {
    const tokenHash = await digest(token);
    const now = Math.floor(Date.now() / 1000);
    const row = await env.AGENT_DB.prepare(
      "SELECT owner_id FROM owner_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1"
    ).bind(tokenHash, now).first<{ owner_id: string }>();
    if (!row?.owner_id) return { ok: false as const, response: json({ code: "SESSION_EXPIRED", error: "Owner session expired. Please log in again." }, 401) };
    return { ok: true as const, identity: { ownerId: row.owner_id } };
  } catch {
    return { ok: false as const, response: unavailable() };
  }
}

export async function revokeOwnerSession(request: Request, env: SessionEnv): Promise<Response> {
  if (!env.AGENT_DB) return unavailable();
  const token = bearer(request);
  if (!token) return json({ code: "SESSION_REQUIRED", error: "Owner login session is required." }, 401);
  try {
    const tokenHash = await digest(token);
    const now = Math.floor(Date.now() / 1000);
    await env.AGENT_DB.prepare(
      "UPDATE owner_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL"
    ).bind(now, tokenHash).run();
    return json({ authenticated: false });
  } catch {
    return unavailable();
  }
}
