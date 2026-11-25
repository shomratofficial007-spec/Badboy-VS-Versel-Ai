export interface DeveloperMemoryProject {
  project_id: string;
  name: string;
}

export interface DeveloperMemoryEntry {
  category: string;
  content: string;
}

export async function buildDeveloperMemoryContext(
  developerMode: boolean,
  query: string,
  listProjects: (limit: number) => Promise<DeveloperMemoryProject[]>,
  searchMemory: (projectId: string, query: string, limit: number) => Promise<DeveloperMemoryEntry[]>,
): Promise<string> {
  if (!developerMode) return '';

  try {
    const projects = await listProjects(20);
    const matches = await Promise.all(projects.slice(0, 10).map(async (project) => {
      try {
        const memories = await searchMemory(project.project_id, query, 3);
        return memories.map((memory) => ({ project: project.name, ...memory }));
      } catch {
        return [];
      }
    }));
    return matches.flat().slice(0, 8).map((memory) =>
      '[' + memory.project + ' / ' + memory.category + '] ' + memory.content.slice(0, 900),
    ).join('\n').slice(0, 5000);
  } catch {
    return '';
  }
}
