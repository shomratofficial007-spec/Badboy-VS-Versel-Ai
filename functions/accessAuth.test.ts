import assert from "node:assert/strict";
import test from "node:test";
import { authenticateCloudflareAccess } from "./api/accessAuth.ts";

const NOW = 1_800_000_000;
const TEAM = "https://badboy-team.cloudflareaccess.com";
const AUD = "badboy-access-app";
const EMAIL = "owner@example.com";

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function makeKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" } };
}

async function signedToken(
  privateKey: CryptoKey,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }));
  const claims = base64url(JSON.stringify({
    iss: `${TEAM}/`,
    aud: AUD,
    exp: NOW + 300,
    nbf: NOW - 10,
    sub: "access-subject-123",
    email: EMAIL,
    ...overrides,
  }));
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString("base64url")}`;
}

function authEnv(allowed = EMAIL) {
  return {
    CF_ACCESS_TEAM_DOMAIN: TEAM,
    CF_ACCESS_AUD: AUD,
    CF_ACCESS_ALLOWED_EMAILS: allowed,
  };
}

test("rejects requests without the Cloudflare Access assertion", async () => {
  const result = await authenticateCloudflareAccess(new Request("https://example.com/private"), authEnv(), NOW);
  assert.equal(result.response?.status, 401);
});

test("returns a safe service error when Access configuration is missing", async () => {
  const result = await authenticateCloudflareAccess(new Request("https://example.com/private"), {}, NOW);
  assert.equal(result.response?.status, 503);
  assert.equal((await result.response!.json()).code, "ACCESS_AUTH_NOT_CONFIGURED");
});

test("validates signature, issuer, audience and expiry, then derives owner from sub", async () => {
  const { privateKey, publicJwk } = await makeKeyPair();
  const token = await signedToken(privateKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof globalThis.fetch;
  try {
    const request = new Request("https://example.com/private", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    const result = await authenticateCloudflareAccess(request, authEnv(), NOW);
    assert.equal(result.response, undefined);
    assert.deepEqual(result.identity, {
      ownerId: "access-subject-123",
      email: EMAIL,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an expired token before accepting its identity", async () => {
  const { privateKey, publicJwk } = await makeKeyPair();
  const token = await signedToken(privateKey, { exp: NOW });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [publicJwk] }))) as typeof globalThis.fetch;
  try {
    const result = await authenticateCloudflareAccess(
      new Request("https://example.com/private", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      authEnv(),
      NOW,
    );
    assert.equal(result.response?.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects wrong issuer and audience claims", async () => {
  const { privateKey, publicJwk } = await makeKeyPair();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [publicJwk] }))) as typeof globalThis.fetch;
  try {
    for (const overrides of [
      { iss: "https://attacker.cloudflareaccess.com/" },
      { aud: "another-application" },
    ]) {
      const token = await signedToken(privateKey, overrides);
      const result = await authenticateCloudflareAccess(
        new Request("https://example.com/private", { headers: { "Cf-Access-Jwt-Assertion": token } }),
        authEnv(),
        NOW,
      );
      assert.equal(result.response?.status, 401);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a validly signed identity outside the configured email allowlist", async () => {
  const { privateKey, publicJwk } = await makeKeyPair();
  const token = await signedToken(privateKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [publicJwk] }))) as typeof globalThis.fetch;
  try {
    const result = await authenticateCloudflareAccess(
      new Request("https://example.com/private", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      authEnv("different@example.com"),
      NOW,
    );
    assert.equal(result.response?.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a forged signature even when its claims look valid", async () => {
  const { privateKey: trustedPrivateKey, publicJwk: trustedJwk } = await makeKeyPair();
  const { privateKey: attackerPrivateKey } = await makeKeyPair();
  const token = await signedToken(attackerPrivateKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [trustedJwk] }))) as typeof globalThis.fetch;
  try {
    const result = await authenticateCloudflareAccess(
      new Request("https://example.com/private", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      authEnv(),
      NOW,
    );
    assert.equal(result.response?.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    // Keep a reference so static analysis sees the trusted key pair is intentionally generated.
    assert.ok(trustedPrivateKey);
  }
});
