import assert from "node:assert/strict";
import test from "node:test";
import { requirePersonalOwner } from "./ownerAuth.ts";

const OWNER_TOKEN = "a".repeat(43);

type MiddlewareResult = {
  statusCode: number | null;
  payload: unknown;
  nextCalled: boolean;
  ownerId?: string;
};

async function invokeMiddleware(authorization: string | undefined, configuredToken: string | undefined): Promise<MiddlewareResult> {
  const previousToken = process.env.BADBOY_OWNER_TOKEN;
  if (configuredToken === undefined) delete process.env.BADBOY_OWNER_TOKEN;
  else process.env.BADBOY_OWNER_TOKEN = configuredToken;

  const result: MiddlewareResult = {
    statusCode: null,
    payload: undefined,
    nextCalled: false,
  };
  const request = {
    method: "POST",
    get: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined,
  };
  const response = {
    locals: {} as Record<string, unknown>,
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      result.payload = payload;
      return this;
    },
  };

  try {
    await requirePersonalOwner(
      request as never,
      response as never,
      (() => { result.nextCalled = true; }) as never,
    );
    result.ownerId = response.locals.ownerId as string | undefined;
    return result;
  } finally {
    if (previousToken === undefined) delete process.env.BADBOY_OWNER_TOKEN;
    else process.env.BADBOY_OWNER_TOKEN = previousToken;
  }
}

test("rejects unauthenticated Express API requests", async () => {
  const result = await invokeMiddleware(undefined, OWNER_TOKEN);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal((result.payload as { code?: string }).code, "PERSONAL_AUTH_REQUIRED");
});

test("fails closed when the Express owner secret is not configured", async () => {
  const result = await invokeMiddleware(`Bearer ${OWNER_TOKEN}`, undefined);
  assert.equal(result.statusCode, 503);
  assert.equal(result.nextCalled, false);
  assert.equal((result.payload as { code?: string }).code, "PERSONAL_AUTH_NOT_CONFIGURED");
});

test("allows only the configured owner and assigns the server-owned identity", async () => {
  const result = await invokeMiddleware(`Bearer ${OWNER_TOKEN}`, OWNER_TOKEN);
  assert.equal(result.statusCode, null);
  assert.equal(result.nextCalled, true);
  assert.equal(result.ownerId, "badboy-personal-owner-v1");
});

test("rejects a different well-formed owner token", async () => {
  const result = await invokeMiddleware(`Bearer ${"b".repeat(43)}`, OWNER_TOKEN);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal((result.payload as { code?: string }).code, "PERSONAL_AUTH_INVALID");
});
