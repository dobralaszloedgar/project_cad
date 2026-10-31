import { openDB } from "idb";
import type { ProjectDirectoryHandle } from "./project-directory";

// Keep preferences independent from project recovery and project deletion.
async function preferences() {
  return openDB("project-cad-preferences", 1, {
    upgrade(database) {
      database.createObjectStore("preferences");
    },
  });
}

export async function getDefaultProjectDirectory(): Promise<ProjectDirectoryHandle | null> {
  const database = await preferences();
  try {
    return (await database.get("preferences", "projectDirectory")) ?? null;
  } finally {
    database.close();
  }
}

export async function setDefaultProjectDirectory(
  directory: ProjectDirectoryHandle | null,
) {
  const database = await preferences();
  try {
    if (directory)
      await database.put("preferences", directory, "projectDirectory");
    else await database.delete("preferences", "projectDirectory");
  } finally {
    database.close();
  }
}
