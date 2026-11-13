import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerSession, authenticateOwnerSession, revokeOwnerSession, SESSION_TTL_SECONDS } from "./api/sessionAuth.ts";

const OWNER_TOKEN = "a".repeat(43);
const rows = new Map<string, { owner_id: string; expires_at: number; revoked_at: number | null }>();
const db = {
  prepare(query: string) {
    return {
      bind(...values: unknown[]) {
        return {
          async run() {
            if (query.startsWith("INSERT INTO owner_sessions")) {
              rows.set(String(values[0]), { owner_id: String(values[1]), expires_at: Number(values[3]), revoked_at: null });
            } else if (query.startsWith("UPDATE owner_sessions")) {
              const row = rows.get(String(values[1]));
              if (row) row.revoked_at = Number(values[0]);
            }
            return { success: true, meta: { changes: 1 } };
          },
          async first<T>() {
            const row = rows.get(String(values[0]));
            if (!row || row.revoked_at !== null || row.expires_at <= Number(values[1])) return null;
            return { owner_id: row.owner_id } as T;
          },
        };
      },
    };
  },
};

test("exchanges the Owner Token for a random, expiring session without storing the raw token", async () => {
  rows.clear();
  const response = await createOwnerSession(
    new Request("https://example.test/api/auth/session", { method: "POST", headers: { Authorization: `Bearer ${OWNER_TOKEN}` } }),
    { BADBOY_OWNER_TOKEN: OWNER_TOKEN, AGENT_DB: db },
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { authenticated: boolean; sessionToken: string; expiresAt: number };
  assert.equal(payload.authenticated, true);
  assert.match(payload.sessionToken, /^[a-f0-9]{64}$/);
  assert.equal(payload.expiresAt - Math.floor(Date.now() / 1000), SESSION_TTL_SECONDS);
  assert.equal(rows.size, 1);
  assert.equal(rows.has(payload.sessionToken), false);
  const authenticated = await authenticateOwnerSession(
    new Request("https://example.test/api/private", { headers: { Authorization: `Bearer ${payload.sessionToken}` } }),
    { AGENT_DB: db },
  );
  assert.equal(authenticated.ok, true);
});

test("rejects expired sessions and revokes a logged-out session", async () => {
  const token = "b".repeat(64);
  const hashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(hashBytes), b => b.toString(16).padStart(2, "0")).join("");
  rows.set(hash, { owner_id: "badboy-personal-owner-v1", expires_at: 1, revoked_at: null });
  const expired = await authenticateOwnerSession(
    new Request("https://example.test/private", { headers: { Authorization: `Bearer ${token}` } }),
    { AGENT_DB: db },
  );
  assert.equal(expired.ok, false);

  const liveToken = "c".repeat(64);
  const liveHashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(liveToken));
  const liveHash = Array.from(new Uint8Array(liveHashBytes), b => b.toString(16).padStart(2, "0")).join("");
  rows.set(liveHash, { owner_id: "badboy-personal-owner-v1", expires_at: Math.floor(Date.now() / 1000) + 60, revoked_at: null });
  const logout = await revokeOwnerSession(
    new Request("https://example.test/api/auth/session", { method: "DELETE", headers: { Authorization: `Bearer ${liveToken}` } }),
    { AGENT_DB: db },
  );
  assert.equal(logout.status, 200);
  const afterLogout = await authenticateOwnerSession(
    new Request("https://example.test/private", { headers: { Authorization: `Bearer ${liveToken}` } }),
    { AGENT_DB: db },
  );
  assert.equal(afterLogout.ok, false);
});
