import { requestOwnerJson } from "./api";

export interface DeveloperTaskRecord {
  task_id: string;
  owner_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  engine: "native" | "copilot" | "auto";
  title: string;
  summary: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperProjectRecord {
  project_id: string;
  owner_id: string;
  project_key: string;
  name: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface DeveloperProjectMemoryRecord {
  memory_id: string;
  owner_id: string;
  project_id: string;
  category: string;
  content: string;
  source: string;
  privacy_level: "private" | "sensitive" | "general";
  created_at: string;
  updated_at: string;
}

export async function listDeveloperTasks(limit = 25): Promise<DeveloperTaskRecord[]> {
  const result = await requestOwnerJson<{ tasks: DeveloperTaskRecord[] }>(
    `/developer/tasks?limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    "GET",
  );
  return result.tasks;
}

export async function listDeveloperProjects(limit = 25): Promise<DeveloperProjectRecord[]> {
  const result = await requestOwnerJson<{ projects: DeveloperProjectRecord[] }>(
    `/developer/projects?limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    "GET",
  );
  return result.projects;
}

export async function saveDeveloperProject(input: {
  projectKey: string;
  name: string;
  summary?: string;
}): Promise<{ projectId: string; projectKey: string; name: string }> {
  return requestOwnerJson("/developer/projects", "POST", input);
}

export async function listDeveloperProjectMemory(
  projectId: string,
  limit = 50,
): Promise<DeveloperProjectMemoryRecord[]> {
  const result = await requestOwnerJson<{ memories: DeveloperProjectMemoryRecord[] }>(
    `/developer/project-memory?projectId=${encodeURIComponent(projectId)}&limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    "GET",
  );
  return result.memories;
}

export async function addDeveloperProjectMemory(input: {
  projectId: string;
  category: string;
  content: string;
  source?: string;
  privacyLevel?: "private" | "sensitive" | "general";
}): Promise<{ memoryId: string; saved: boolean }> {
  return requestOwnerJson("/developer/project-memory", "POST", input);
}

export async function deleteDeveloperProjectMemory(memoryId: string): Promise<{ deleted: boolean }> {
  return requestOwnerJson(
    `/developer/project-memory?memoryId=${encodeURIComponent(memoryId)}`,
    "DELETE",
  );
}
