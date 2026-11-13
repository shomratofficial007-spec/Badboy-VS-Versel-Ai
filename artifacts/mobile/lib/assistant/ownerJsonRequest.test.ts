import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

let createOwnerJsonRequester: typeof import("./ownerJsonRequest").createOwnerJsonRequester;
before(async () => {
  mock.module("react-native", { namedExports: { Platform: { OS: "web" } } });
  ({ createOwnerJsonRequester } = await import("./ownerJsonRequest"));
});

test("adds the verified owner token and JSON body to a POST request", async () => {
  let sentUrl = "";
  let sentInit: RequestInit | undefined;
  const request = createOwnerJsonRequester(
    async () => "owner-session-token",
    async (url, init) => {
      sentUrl = url;
      sentInit = init;
      return Response.json({ saved: true }, { status: 201 });
    },
  );
  const result = await request<{ saved: boolean }>("/developer/projects", "POST", { name: "Badboy" });
  assert.equal(result.saved, true);
  assert.equal(sentUrl.endsWith("/api/developer/projects"), true);
  assert.equal(sentInit?.method, "POST");
  assert.equal(new Headers(sentInit?.headers).get("Authorization"), "Bearer owner-session-token");
  assert.equal(new Headers(sentInit?.headers).get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(sentInit?.body)), { name: "Badboy" });
});

test("does not set a request body for GET and DELETE", async () => {
  const calls: RequestInit[] = [];
  const request = createOwnerJsonRequester(
    async () => "owner-session-token",
    async (_url, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  );
  await request("/developer/tasks", "GET");
  await request("/developer/project-memory?memoryId=memory-1", "DELETE");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[1].body, undefined);
  assert.equal(calls[1].method, "DELETE");
});

test("fails before network access when no owner token exists", async () => {
  let called = false;
  const request = createOwnerJsonRequester(
    async () => null,
    async () => {
      called = true;
      return Response.json({});
    },
  );
  await assert.rejects(() => request("/developer/tasks", "GET"), /Owner login session is required/);
  assert.equal(called, false);
});

test("surfaces safe API errors and handles non-JSON error bodies", async () => {
  const apiError = createOwnerJsonRequester(
    async () => "owner-session-token",
    async () => Response.json({ error: "Storage is unavailable." }, { status: 503 }),
  );
  await assert.rejects(() => apiError("/developer/tasks", "GET"), /Storage is unavailable/);

  const fallbackError = createOwnerJsonRequester(
    async () => "owner-session-token",
    async () => new Response("upstream failure", { status: 502 }),
  );
  await assert.rejects(() => fallbackError("/developer/tasks", "GET"), /HTTP 502/);
});

test("returns a successful JSON payload without changing its fields", async () => {
  const request = createOwnerJsonRequester(
    async () => "owner-session-token",
    async () => Response.json({ tasks: [{ task_id: "task-1" }], count: 1 }),
  );
  assert.deepEqual(await request("/developer/tasks", "GET"), {
    tasks: [{ task_id: "task-1" }],
    count: 1,
  });
});
