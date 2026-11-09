import { describe, expect, it } from "vitest";
import { authenticatePersonalOwner } from "../api/personalAuth.ts";

const OWNER_TOKEN = "A".repeat(43);
const authEnv = { BADBOY_OWNER_TOKEN: OWNER_TOKEN };

function request(authorization?: string): Request {
  return new Request("https://badboy.test/api/auth/verify", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("personal owner authentication", () => {
  it("fails closed when the Worker secret is missing", async () => {
    const result = await authenticatePersonalOwner(request(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("rejects missing and malformed bearer credentials", async () => {
    for (const authorization of [undefined, "Basic abc", "Bearer short"]) {
      const result = await authenticatePersonalOwner(request(authorization), authEnv);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    }
  });

  it("accepts the configured owner token and assigns a server-owned identity", async () => {
    const result = await authenticatePersonalOwner(request(`Bearer ${OWNER_TOKEN}`), authEnv);
    expect(result).toEqual({ ok: true, identity: { ownerId: "badboy-personal-owner-v1" } });
  });

  it("rejects a different well-formed owner token", async () => {
    const result = await authenticatePersonalOwner(request(`Bearer ${"B".repeat(43)}`), authEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
