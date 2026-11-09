import { createAgentStorage, type D1Database } from "./agentStorage.ts";

export interface DeveloperDataEnv {
  AGENT_DB?: D1Database;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function boundedLimit(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : fallback;
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 20_000)) {
    throw new Error("Request body exceeds the endpoint size limit.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 20_000) {
    throw new Error("Request body exceeds the endpoint size limit.");
  }
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${name} must contain 1–${maxLength} characters.`);
  }
  return value.trim();
}

function isTaskStatus(value: unknown): value is "queued" | "running" | "completed" | "failed" | "cancelled" {
  return value === "queued" || value === "running" || value === "completed" ||
    value === "failed" || value === "cancelled";
}

function isEngine(value: unknown): value is "native" | "copilot" | "auto" {
  return value === "native" || value === "copilot" || value === "auto";
}

/**
 * Owner-scoped Developer Agent data API.
 * ownerId must come exclusively from the verified Worker authentication result.
 * Returns null when the request is not one of the supported data routes.
 */
export async function handleDeveloperDataRequest(
  request: Request,
  env: DeveloperDataEnv,
  ownerId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");
  const routes = new Set([
    "/api/developer/tasks",
    "/api/developer/projects",
    "/api/developer/project-memory",
  ]);
  if (!routes.has(pathname)) return null;
  if (!env.AGENT_DB) {
    return json({ code: "AGENT_STORAGE_NOT_CONFIGURED", error: "Developer Agent storage is not configured." }, 503);
  }

  const storage = createAgentStorage(env.AGENT_DB);
  try {
    if (request.method === "GET" && pathname === "/api/developer/tasks") {
      return json({ tasks: await storage.listTasks(ownerId, boundedLimit(url.searchParams.get("limit"), 25)) });
    }

    if (request.method === "POST" && pathname === "/api/developer/tasks") {
      const body = await readPayload(request);
      if (!body) return json({ code: "UNSUPPORTED_MEDIA_TYPE", error: "Content-Type must be application/json." }, 415);
      const taskId = crypto.randomUUID();
      const status = body.status === undefined ? "queued" : body.status;
      const engine = body.engine === undefined ? "native" : body.engine;
      if (!isTaskStatus(status) || !isEngine(engine)) {
        return json({ code: "INVALID_TASK", error: "Task status or engine is invalid." }, 400);
      }
      await storage.createTask({
        taskId,
        ownerId,
        status,
        engine,
        title: requiredString(body.title, "Task title", 200),
        summary: typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) : undefined,
        parentTaskId: typeof body.parentTaskId === "string" ? body.parentTaskId : null,
      });
      await storage.appendTaskEvent({
        eventId: crypto.randomUUID(),
        taskId,
        ownerId,
        eventType: "task_created",
        payload: { status, engine },
      });
      return json({ taskId, status }, 201);
    }

    if (request.method === "GET" && pathname === "/api/developer/projects") {
      return json({ projects: await storage.listProjects(ownerId, boundedLimit(url.searchParams.get("limit"), 25)) });
    }

    if (request.method === "POST" && pathname === "/api/developer/projects") {
      const body = await readPayload(request);
      if (!body) return json({ code: "UNSUPPORTED_MEDIA_TYPE", error: "Content-Type must be application/json." }, 415);
      const projectKey = requiredString(body.projectKey, "Project key", 160);
      const name = requiredString(body.name, "Project name", 200);
      const projectId = await storage.upsertProject({
        projectId: crypto.randomUUID(),
        ownerId,
        projectKey,
        name,
        summary: typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) : "",
      });
      return json({ projectId, projectKey, name }, 200);
    }

    if (request.method === "GET" && pathname === "/api/developer/project-memory") {
      const projectId = url.searchParams.get("projectId") ?? "";
      if (!projectId.trim()) return json({ code: "PROJECT_ID_REQUIRED", error: "projectId is required." }, 400);
      return json({
        memories: await storage.listProjectMemory(projectId, ownerId, boundedLimit(url.searchParams.get("limit"), 50)),
      });
    }

    if (request.method === "POST" && pathname === "/api/developer/project-memory") {
      const body = await readPayload(request);
      if (!body) return json({ code: "UNSUPPORTED_MEDIA_TYPE", error: "Content-Type must be application/json." }, 415);
      const privacyLevel = body.privacyLevel === undefined ? "private" : body.privacyLevel;
      if (privacyLevel !== "private" && privacyLevel !== "sensitive" && privacyLevel !== "general") {
        return json({ code: "INVALID_PRIVACY_LEVEL", error: "privacyLevel must be private, sensitive, or general." }, 400);
      }
      const memoryId = crypto.randomUUID();
      const inserted = await storage.addProjectMemory({
        memoryId,
        ownerId,
        projectId: requiredString(body.projectId, "Project ID", 128),
        category: requiredString(body.category, "Memory category", 80),
        content: requiredString(body.content, "Memory content", 8000),
        source: typeof body.source === "string" ? body.source.trim().slice(0, 80) : "user",
        privacyLevel,
      });
      return inserted
        ? json({ memoryId, saved: true }, 201)
        : json({ code: "PROJECT_NOT_FOUND", error: "Project was not found for this owner." }, 404);
    }

    if (request.method === "DELETE" && pathname === "/api/developer/project-memory") {
      const memoryId = url.searchParams.get("memoryId") ?? "";
      if (!memoryId.trim()) return json({ code: "MEMORY_ID_REQUIRED", error: "memoryId is required." }, 400);
      const deleted = await storage.deleteProjectMemory(memoryId, ownerId);
      return deleted
        ? json({ deleted: true })
        : json({ code: "MEMORY_NOT_FOUND", error: "Project memory was not found." }, 404);
    }

    return json({ code: "METHOD_NOT_ALLOWED", error: "Method not allowed for this Developer Agent resource." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("must contain") ||
      message.includes("characters") ||
      message.includes("must not exceed")
    ) {
      return json({ code: "INVALID_DEVELOPER_DATA", error: message }, 400);
    }
    if (message.includes("JSON") || message.includes("Request body")) {
      return json({ code: "INVALID_JSON_BODY", error: message }, 400);
    }
    console.error(JSON.stringify({
      component: "badboy-developer-data",
      event: "storage_request_failed",
      route: pathname,
      method: request.method,
    }));
    return json({ code: "DEVELOPER_STORAGE_FAILED", error: "Developer Agent data could not be saved or loaded." }, 500);
  }
}
