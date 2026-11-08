import { requestOwnerJson } from "./ownerJsonRequest";

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

type OwnerJsonRequester = <T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>,
) => Promise<T>;

export function createDeveloperDataClient(requestJson: OwnerJsonRequester = requestOwnerJson) {
  return {
    async listDeveloperTasks(limit = 25): Promise<DeveloperTaskRecord[]> {
      const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      const result = await requestJson<{ tasks: DeveloperTaskRecord[] }>(
        `/developer/tasks?limit=${boundedLimit}`,
        "GET",
      );
      return result.tasks;
    },

    async listDeveloperProjects(limit = 25): Promise<DeveloperProjectRecord[]> {
      const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      const result = await requestJson<{ projects: DeveloperProjectRecord[] }>(
        `/developer/projects?limit=${boundedLimit}`,
        "GET",
      );
      return result.projects;
    },

    async saveDeveloperProject(input: {
      projectKey: string;
      name: string;
      summary?: string;
    }): Promise<{ projectId: string; projectKey: string; name: string }> {
      return requestJson("/developer/projects", "POST", input);
    },

    async listDeveloperProjectMemory(projectId: string, limit = 50): Promise<DeveloperProjectMemoryRecord[]> {
      const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      const result = await requestJson<{ memories: DeveloperProjectMemoryRecord[] }>(
        `/developer/project-memory?projectId=${encodeURIComponent(projectId)}&limit=${boundedLimit}`,
        "GET",
      );
      return result.memories;
    },

    async addDeveloperProjectMemory(input: {
      projectId: string;
      category: string;
      content: string;
      source?: string;
      privacyLevel?: "private" | "sensitive" | "general";
    }): Promise<{ memoryId: string; saved: boolean }> {
      return requestJson("/developer/project-memory", "POST", input);
    },

    async deleteDeveloperProjectMemory(memoryId: string): Promise<{ deleted: boolean }> {
      return requestJson(
        `/developer/project-memory?memoryId=${encodeURIComponent(memoryId)}`,
        "DELETE",
      );
    },
  };
}

const developerDataClient = createDeveloperDataClient();

export const listDeveloperTasks = developerDataClient.listDeveloperTasks;
export const listDeveloperProjects = developerDataClient.listDeveloperProjects;
export const saveDeveloperProject = developerDataClient.saveDeveloperProject;
export const listDeveloperProjectMemory = developerDataClient.listDeveloperProjectMemory;
export const addDeveloperProjectMemory = developerDataClient.addDeveloperProjectMemory;
export const deleteDeveloperProjectMemory = developerDataClient.deleteDeveloperProjectMemory;
