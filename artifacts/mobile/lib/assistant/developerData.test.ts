import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("react-native", { namedExports: { Platform: { OS: "web" } } });
const { createDeveloperDataClient, getAnalysisProjectNotes } = await import("./developerData");

test("lists Developer Agent tasks with bounded limits", async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const client = createDeveloperDataClient(async <T>(path, method) => {
    calls.push({ path, method });
    return { tasks: [] } as T;
  });
  assert.deepEqual(await client.listDeveloperTasks(500), []);
  assert.deepEqual(calls, [{ path: "/developer/tasks?limit=100", method: "GET" }]);
});

test("lists projects with the requested bounded limit", async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const client = createDeveloperDataClient(async <T>(path, method) => {
    calls.push({ path, method });
    return { projects: [] } as T;
  });
  assert.deepEqual(await client.listDeveloperProjects(0), []);
  assert.deepEqual(calls, [{ path: "/developer/projects?limit=1", method: "GET" }]);
});

test("saves a project using the supplied project metadata", async () => {
  let sent: { path: string; method: string; body?: Record<string, unknown> } | undefined;
  const client = createDeveloperDataClient(async <T>(path, method, body) => {
    sent = { path, method, body };
    return { projectId: "project-1", projectKey: "badboy", name: "Badboy AI" } as T;
  });
  const result = await client.saveDeveloperProject({ projectKey: "badboy", name: "Badboy AI" });
  assert.equal(result.projectId, "project-1");
  assert.deepEqual(sent, {
    path: "/developer/projects",
    method: "POST",
    body: { projectKey: "badboy", name: "Badboy AI" },
  });
});

test("encodes project IDs and bounds project memory result limits", async () => {
  let sentPath = "";
  const client = createDeveloperDataClient(async <T>(path) => {
    sentPath = path;
    return { memories: [] } as T;
  });
  assert.deepEqual(await client.listDeveloperProjectMemory("project / one", 1000), []);
  assert.equal(sentPath, "/developer/project-memory?projectId=project%20%2F%20one&limit=100");
});

test("adds private project memory with the caller's content and privacy", async () => {
  let sent: { path: string; method: string; body?: Record<string, unknown> } | undefined;
  const client = createDeveloperDataClient(async <T>(path, method, body) => {
    sent = { path, method, body };
    return { memoryId: "memory-1", saved: true } as T;
  });
  const result = await client.addDeveloperProjectMemory({
    projectId: "project-1",
    category: "project-note",
    content: "Keep existing features",
    privacyLevel: "private",
  });
  assert.deepEqual(result, { memoryId: "memory-1", saved: true });
  assert.deepEqual(sent, {
    path: "/developer/project-memory",
    method: "POST",
    body: {
      projectId: "project-1",
      category: "project-note",
      content: "Keep existing features",
      privacyLevel: "private",
    },
  });
});

test("deletes memory with a URL-encoded ID", async () => {
  let sent: { path: string; method: string } | undefined;
  const client = createDeveloperDataClient(async <T>(path, method) => {
    sent = { path, method };
    return { deleted: true } as T;
  });
  assert.deepEqual(await client.deleteDeveloperProjectMemory("memory / 1"), { deleted: true });
  assert.deepEqual(sent, {
    path: "/developer/project-memory?memoryId=memory%20%2F%201",
    method: "DELETE",
  });
});


test("excludes sensitive project notes from AI analysis context", () => {
  const notes = getAnalysisProjectNotes([
    {
      memory_id: "private-1",
      owner_id: "owner",
      project_id: "project",
      category: "preference",
      content: "Preserve all current features",
      source: "owner",
      privacy_level: "private",
      created_at: "2026-11-08T00:00:00.000Z",
      updated_at: "2026-11-08T00:00:00.000Z",
    },
    {
      memory_id: "sensitive-1",
      owner_id: "owner",
      project_id: "project",
      category: "secret",
      content: "Do not send this to an AI provider",
      source: "owner",
      privacy_level: "sensitive",
      created_at: "2026-11-08T00:00:00.000Z",
      updated_at: "2026-11-08T00:00:00.000Z",
    },
    {
      memory_id: "general-1",
      owner_id: "owner",
      project_id: "project",
      category: "architecture",
      content: "Cloudflare Worker + D1",
      source: "owner",
      privacy_level: "general",
      created_at: "2026-11-08T00:00:00.000Z",
      updated_at: "2026-11-08T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(notes, [
    {
      category: "preference",
      content: "Preserve all current features",
      privacyLevel: "private",
    },
    {
      category: "architecture",
      content: "Cloudflare Worker + D1",
      privacyLevel: "general",
    },
  ]);
});
