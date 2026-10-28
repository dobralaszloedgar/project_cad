import { openDB } from "idb";
import { workspaceSchema, type Workspace } from "./revisions";
import { projectSchema, validateGraph } from "../domain/schema";
export interface SavedProject {
  id: string;
  workspace: Workspace;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
}
const db = () =>
  openDB("project-cad", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("workspace"))
        database.createObjectStore("workspace");
      if (!database.objectStoreNames.contains("projects"))
        database.createObjectStore("projects", { keyPath: "id" });
    },
  });
export async function saveWorkspace(value: Workspace, projectId = "main") {
  const parsed = workspaceSchema.parse(value),
    database = await db();
  try {
    const tx = database.transaction(["workspace", "projects"], "readwrite");
    const existing = (await tx.objectStore("projects").get(projectId)) as
      SavedProject | undefined;
    const now = new Date().toISOString();
    await tx.objectStore("projects").put({
      id: projectId,
      workspace: parsed,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      starred: existing?.starred ?? false,
    } satisfies SavedProject);
    await tx.objectStore("workspace").put(parsed, "current");
    await tx.objectStore("workspace").put(projectId, "activeProject");
    await tx.done;
  } finally {
    database.close();
  }
}
export async function loadWorkspace() {
  const database = await db();
  try {
    const value = await database.get("workspace", "current");
    return value ? workspaceSchema.parse(value) : null;
  } finally {
    database.close();
  }
}
export async function activeProjectId(): Promise<string> {
  const database = await db();
  try {
    return (await database.get("workspace", "activeProject")) ?? "main";
  } finally {
    database.close();
  }
}
export async function listProjects(): Promise<SavedProject[]> {
  const database = await db();
  try {
    return ((await database.getAll("projects")) as SavedProject[])
      .map((entry) => ({
        ...entry,
        workspace: workspaceSchema.parse(entry.workspace),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}
export async function updateSavedProject(entry: SavedProject) {
  const database = await db();
  try {
    await database.put("projects", {
      ...entry,
      workspace: workspaceSchema.parse(entry.workspace),
    });
  } finally {
    database.close();
  }
}
export async function clearWorkspace(projectId = "main") {
  const database = await db();
  try {
    const tx = database.transaction(["workspace", "projects"], "readwrite");
    await tx.objectStore("workspace").clear();
    await tx.objectStore("projects").delete(projectId);
    await tx.done;
  } finally {
    database.close();
  }
}
export function parseImport(text: string): Workspace {
  if (text.length > 2_000_000) throw new Error("Project file exceeds 2 MB.");
  const raw = JSON.parse(text);
  const workspace =
    "project" in raw
      ? workspaceSchema.parse(raw)
      : {
          version: 1 as const,
          project: projectSchema.parse(raw),
          revisions: [],
        };
  for (const p of [
    workspace.project,
    ...workspace.revisions.map((r) => r.project),
  ]) {
    const errors = validateGraph(p);
    if (errors.length) throw new Error(errors.join(" "));
  }
  return workspace;
}
