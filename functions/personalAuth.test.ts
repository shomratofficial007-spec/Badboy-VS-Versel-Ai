import assert from "node:assert/strict";
import test from "node:test";
import { authenticatePersonalOwner } from "./api/personalAuth.ts";

const OWNER_TOKEN = "a".repeat(43);
const authEnv = { BADBOY_OWNER_TOKEN: OWNER_TOKEN };

test("fails closed when the Worker secret is missing", async () => {
  const result = await authenticatePersonalOwner(
    new Request("https://example.com/api/auth/verify", { method: "POST" }),
    {},
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected missing configuration to fail closed.");
  assert.equal(result.response.status, 503);
  const payload = await result.response.json() as { code?: string };
  assert.equal(payload.code, "PERSONAL_AUTH_NOT_CONFIGURED");
});

test("rejects missing, malformed, and non-Bearer credentials", async () => {
  const values = [null, "Basic abc", "Bearer short", `Bearer ${"x".repeat(129)}`];
  for (const value of values) {
    const headers = value === null ? undefined : { Authorization: value };
    const result = await authenticatePersonalOwner(
      new Request("https://example.com/api/auth/verify", { method: "POST", headers }),
      authEnv,
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Expected malformed credentials to be rejected.");
    assert.equal(result.response.status, 401);
  }
});

test("accepts the configured key and assigns a server-owned identity", async () => {
  const result = await authenticatePersonalOwner(
    new Request("https://example.com/api/auth/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
    }),
    authEnv,
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected the configured owner token to authenticate.");
  assert.deepEqual(result.identity, { ownerId: "badboy-personal-owner-v1" });
});

test("rejects a different well-formed key", async () => {
  const result = await authenticatePersonalOwner(
    new Request("https://example.com/api/auth/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${"b".repeat(43)}` },
    }),
    authEnv,
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected an incorrect token to be rejected.");
  assert.equal(result.response.status, 401);
  const payload = await result.response.json() as { code?: string };
  assert.equal(payload.code, "PERSONAL_AUTH_INVALID");
});

test("does not trust owner identity supplied in query or request body", async () => {
  const request = new Request(
    "https://example.com/api/auth/verify?ownerId=attacker",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ownerId: "attacker" }),
    },
  );
  const result = await authenticatePersonalOwner(request, authEnv);
  if (!result.ok) throw new Error("Expected the configured owner token to authenticate.");
  assert.deepEqual(result.identity, { ownerId: "badboy-personal-owner-v1" });
});


test("fails closed for malformed Worker secrets", async () => {
  const invalidSecrets = [
    "",
    "short",
    "x".repeat(129),
    "x".repeat(42) + "!",
  ];

  for (const secret of invalidSecrets) {
    const result = await authenticatePersonalOwner(
      new Request("https://example.com/api/auth/verify", { method: "POST" }),
      { BADBOY_OWNER_TOKEN: secret },
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Expected malformed Worker configuration to fail closed.");
    assert.equal(result.response.status, 503);
    const payload = await result.response.json() as { code?: string };
    assert.equal(payload.code, "PERSONAL_AUTH_NOT_CONFIGURED");
  }
});

test("returns a safe service error when Web Crypto digest is unavailable", async () => {
  const subtle = crypto.subtle;
  const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");

  Object.defineProperty(subtle, "digest", {
    configurable: true,
    value: async () => {
      throw new Error("simulated crypto failure");
    },
  });

  try {
    const result = await authenticatePersonalOwner(
      new Request("https://example.com/api/auth/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
      }),
      authEnv,
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Expected crypto failure to be handled safely.");
    assert.equal(result.response.status, 503);
    const payload = await result.response.json() as { code?: string };
    assert.equal(payload.code, "PERSONAL_AUTH_UNAVAILABLE");
    assert.equal(result.response.headers.get("Cache-Control"), "no-store");
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(subtle, "digest", originalDescriptor);
    } else {
      Reflect.deleteProperty(subtle, "digest");
    }
  }
});
