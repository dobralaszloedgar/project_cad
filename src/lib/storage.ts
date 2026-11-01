import { openDB } from "idb";
import { z } from "zod";
import { type Workspace } from "./revisions";
import {
  parseWorkspaceImport,
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_NAME,
  serializeProjectFile,
  validateWorkspace,
  type ProjectFile,
} from "./project-file";
import {
  FolderStorageError,
  folderError,
  folderPermission,
  readDirectoryProject,
  requireFolderPermission,
  validateProjectFolderName,
  withProjectLock,
  writeDirectoryProject,
  projectFileName,
  type ProjectDirectoryHandle,
} from "./project-directory";
export {
  chooseProjectDirectory,
  supportsProjectFolders,
  validateProjectFolderName,
  FolderStorageError,
  type ProjectDirectoryHandle,
} from "./project-directory";
export { MAX_PROJECT_FILE_BYTES } from "./project-file";

export interface SavedProject {
  id: string;
  workspace: Workspace;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  trashedAt?: string;
  folderName?: string;
  fileName?: string;
  rootId?: string;
  rootName?: string;
  relativePath?: string;
  missing?: boolean;
  /** A discovered disk copy receives a new document identity when opened. */
  copyOf?: string;
  /** File version from which this view was loaded, for stale-edit checks. */
  fileRevision?: string;
}
interface FolderBinding {
  id: string;
  directory: ProjectDirectoryHandle;
  name: string;
  fileRevision: string;
  dirty: boolean;
  fileName?: string;
  rootId?: string;
  relativePath?: string;
}
export interface ProjectFolderInfo {
  name: string;
  fileName?: string;
  permission: PermissionState;
  hasRecovery: boolean;
  error?: string;
}
export interface SaveLocation {
  location: "browser" | "folder";
  folderName?: string;
  fileName?: string;
}
export interface ProjectRoot {
  id: string;
  name: string;
  directory: ProjectDirectoryHandle;
}
export interface ProjectLibraryFolder {
  rootId: string;
  path: string;
  directory: ProjectDirectoryHandle;
}
export interface ProjectLibrary {
  projects: SavedProject[];
  roots: ProjectRoot[];
  folders: ProjectLibraryFolder[];
  errors: string[];
}
function pendingRecoveryError() {
  return new FolderStorageError(
    "recovery",
    "This project has unsaved changes in this browser. Open it from the project library to recover them, then use Reload from folder if you want to discard them.",
  );
}
const db = () =>
  openDB("project-cad", 4, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("workspace"))
        database.createObjectStore("workspace");
      if (!database.objectStoreNames.contains("projects"))
        database.createObjectStore("projects", { keyPath: "id" });
      if (!database.objectStoreNames.contains("projectFolders"))
        database.createObjectStore("projectFolders", { keyPath: "id" });
      if (!database.objectStoreNames.contains("projectRoots"))
        database.createObjectStore("projectRoots", { keyPath: "id" });
    },
  });
// Per-page acknowledgments prevent an update in another tab from authorizing
// this tab to overwrite a file version it has never loaded.
const acknowledged = new Map<string, string>();
const loadErrors = new Map<string, string>();
async function storedProject(id: string) {
  const database = await db();
  try {
    const [project, folder, deleted] = await Promise.all([
      database.get("projects", id) as Promise<SavedProject | undefined>,
      database.get("projectFolders", id) as Promise<FolderBinding | undefined>,
      database.get("workspace", `deletedProject:${id}`),
    ]);
    return { project, folder, deleted: Boolean(deleted) };
  } finally {
    database.close();
  }
}
async function writableProject(id: string) {
  const stored = await storedProject(id);
  if (stored.deleted)
    throw new Error(
      "This project was permanently deleted. Open another project or export your local copy.",
    );
  if (stored.project?.trashedAt)
    throw new Error("This project is in Trash. Restore it before editing it.");
  return stored;
}
async function cacheProject(
  project: SavedProject,
  folder: FolderBinding | undefined,
  activate: boolean,
  replaceId?: string,
) {
  const database = await db();
  try {
    const tx = database.transaction(
      ["workspace", "projects", "projectFolders"],
      "readwrite",
    );
    const current = tx.objectStore("workspace");
    const activeId = await current.get("activeProject");
    await tx.objectStore("projects").put(project);
    await current.delete(`deletedProject:${project.id}`);
    if (folder) await tx.objectStore("projectFolders").put(folder);
    if (replaceId && replaceId !== project.id) {
      await tx.objectStore("projects").delete(replaceId);
      await tx.objectStore("projectFolders").delete(replaceId);
    }
    if (
      activate ||
      activeId === project.id ||
      (replaceId !== undefined && activeId === replaceId)
    ) {
      await current.put(project.workspace, "current");
      await current.put(project.id, "activeProject");
    }
    await tx.done;
  } finally {
    database.close();
  }
}
function documentFor(entry: SavedProject): ProjectFile {
  return {
    format: "project-cad",
    formatVersion: 1,
    projectId: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    workspace: entry.workspace,
  };
}
async function persistProject(
  entry: SavedProject,
  folder: FolderBinding | undefined,
  activate: boolean,
  expected?: string,
): Promise<SaveLocation> {
  if (!folder) {
    await cacheProject(entry, undefined, activate);
    return { location: "browser" };
  }
  const text = serializeProjectFile(documentFor(entry));
  const baseline =
    expected ??
    acknowledged.get(entry.id) ??
    entry.fileRevision ??
    folder.fileRevision;
  // Preserve complete recovery data before attempting a disk write.
  const pending = {
    ...entry,
    folderName: folder.name,
    ...(folder.fileName ? { fileName: folder.fileName } : {}),
    rootId: folder.rootId,
    relativePath: folder.relativePath,
    fileRevision: baseline,
  };
  await cacheProject(pending, { ...folder, dirty: true }, activate);
  const revision = await writeDirectoryProject(
    folder.directory,
    text,
    baseline,
    folder.fileName,
  );
  acknowledged.set(entry.id, revision);
  loadErrors.delete(entry.id);
  try {
    await cacheProject(
      { ...pending, fileRevision: revision },
      { ...folder, fileRevision: revision, dirty: false },
      activate,
    );
  } catch {
    throw new FolderStorageError(
      "cache",
      "The project file was saved, but this browser could not remember the updated folder connection. Open the project folder again.",
    );
  }
  return {
    location: "folder",
    folderName: folder.name,
    ...(folder.fileName ? { fileName: folder.fileName } : {}),
  };
}
function workspaceEntry(
  workspace: Workspace,
  projectId: string,
  existing: SavedProject | undefined,
  folder: FolderBinding | undefined,
): SavedProject {
  const unchanged =
    existing &&
    JSON.stringify(existing.workspace) === JSON.stringify(workspace);
  const now = new Date().toISOString();
  return {
    id: projectId,
    workspace,
    createdAt: existing?.createdAt ?? now,
    updatedAt: unchanged ? existing.updatedAt : now,
    starred: existing?.starred ?? false,
    ...(folder
      ? {
          folderName: folder.name,
          ...(folder.fileName ? { fileName: folder.fileName } : {}),
          ...(existing?.rootId
            ? {
                rootId: existing.rootId,
                rootName: existing.rootName,
                relativePath: existing.relativePath,
              }
            : {}),
          fileRevision:
            acknowledged.get(projectId) ??
            existing?.fileRevision ??
            folder.fileRevision,
        }
      : {}),
  };
}
export async function saveWorkspace(
  value: Workspace,
  projectId = "main",
): Promise<SaveLocation> {
  const workspace = validateWorkspace(value);
  return withProjectLock(projectId, async () => {
    const { project: existing, folder } = await writableProject(projectId);
    const entry = workspaceEntry(workspace, projectId, existing, folder);
    return persistProject(entry, folder, true);
  });
}
/** Preserve the latest work before switching away from an unavailable file. */
export async function saveWorkspaceRecovery(
  value: Workspace,
  projectId = "main",
): Promise<void> {
  const workspace = validateWorkspace(value);
  return withProjectLock(projectId, async () => {
    const { project: existing, folder } = await writableProject(projectId);
    const entry = workspaceEntry(workspace, projectId, existing, folder);
    try {
      await cacheProject(
        entry,
        folder ? { ...folder, dirty: true } : undefined,
        true,
      );
    } catch {
      throw new FolderStorageError(
        "cache",
        "Your latest changes could not be preserved in this browser. Export a copy before leaving this project.",
      );
    }
  });
}
/** Read the workspace and its identity together, even if another tab switches. */
export async function loadActiveWorkspace(): Promise<{
  projectId: string;
  workspace: Workspace | null;
}> {
  const database = await db();
  let cached: Workspace | null;
  let id: string;
  let project: SavedProject | undefined;
  let folder: FolderBinding | undefined;
  try {
    const tx = database.transaction(
      ["workspace", "projects", "projectFolders"],
      "readonly",
    );
    const current = tx.objectStore("workspace");
    const [value, active] = await Promise.all([
      current.get("current"),
      current.get("activeProject"),
    ]);
    cached = value ? validateWorkspace(value) : null;
    id = active ?? "main";
    [project, folder] = await Promise.all([
      tx.objectStore("projects").get(id),
      tx.objectStore("projectFolders").get(id),
    ]);
    await tx.done;
  } finally {
    database.close();
  }
  if (!folder) return { projectId: id, workspace: cached };
  acknowledged.set(id, project?.fileRevision ?? folder.fileRevision);
  const recovery =
    cached ?? (project ? validateWorkspace(project.workspace) : null);
  if (folder.dirty || (await folderPermission(folder.directory)) !== "granted")
    return { projectId: id, workspace: recovery };
  try {
    const loaded = await withProjectLock(id, () =>
      readSavedProject(id, { activate: false, preserveRecovery: true }),
    );
    return { projectId: id, workspace: loaded.workspace };
  } catch (error) {
    loadErrors.set(
      id,
      error instanceof Error
        ? error.message
        : "Could not read the project file.",
    );
    return { projectId: id, workspace: recovery };
  }
}
/** Startup preserves unsaved recovery and never requests browser permission. */
export async function loadWorkspace(): Promise<Workspace | null> {
  return (await loadActiveWorkspace()).workspace;
}
export async function activeProjectId(): Promise<string> {
  const database = await db();
  try {
    return (await database.get("workspace", "activeProject")) ?? "main";
  } finally {
    database.close();
  }
}
export async function getProjectFolderInfo(
  id: string,
): Promise<ProjectFolderInfo | null> {
  const { folder } = await storedProject(id);
  return folder
    ? {
        name: folder.name,
        fileName: folder.fileName,
        permission: await folderPermission(folder.directory),
        hasRecovery: folder.dirty,
        ...(loadErrors.has(id) ? { error: loadErrors.get(id) } : {}),
      }
    : null;
}
/** Invoke from a user click before unrelated awaits so the browser can prompt. */
export async function requestProjectFolderAccess(id: string): Promise<boolean> {
  const { folder } = await storedProject(id);
  if (!folder) return true;
  try {
    return (
      (await folder.directory.requestPermission({ mode: "readwrite" })) ===
      "granted"
    );
  } catch (error) {
    throw folderError(error, "Could not reconnect the project folder.");
  }
}
async function rememberDirectoryProject(
  directory: ProjectDirectoryHandle,
  document: ProjectFile,
  revision: string,
  activate: boolean,
  discardRecovery = false,
  fileName?: string,
): Promise<SavedProject> {
  const { project: existing, folder } = await storedProject(document.projectId);
  if (existing?.trashedAt)
    throw new Error(
      "This project is in Trash. Restore it before opening its folder.",
    );
  if (
    folder &&
    (!(await folder.directory.isSameEntry(directory)) ||
      (folder.fileName ?? PROJECT_FILE_NAME) !==
        (fileName ?? PROJECT_FILE_NAME))
  )
    throw new FolderStorageError(
      "conflict",
      "This project is already connected to a different folder. Duplicate it from Home to make a separate copy.",
    );
  if (folder?.dirty && !discardRecovery) throw pendingRecoveryError();
  const entry: SavedProject = {
    id: document.projectId,
    workspace: document.workspace,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    starred: existing?.starred ?? false,
    folderName: directory.name,
    ...(fileName ? { fileName } : {}),
    ...(existing?.rootId
      ? {
          rootId: existing.rootId,
          rootName: existing.rootName,
          relativePath: existing.relativePath,
        }
      : {}),
    fileRevision: revision,
  };
  try {
    await cacheProject(
      entry,
      {
        id: entry.id,
        directory,
        name: directory.name,
        fileRevision: revision,
        dirty: false,
        ...(fileName ? { fileName } : {}),
        ...(folder?.rootId
          ? {
              rootId: folder.rootId,
              relativePath: folder.relativePath,
            }
          : {}),
      },
      activate,
    );
  } catch {
    throw new FolderStorageError(
      "cache",
      "The project file is intact, but this browser could not remember its folder. Check browser storage and open the folder again.",
    );
  }
  acknowledged.set(entry.id, revision);
  loadErrors.delete(entry.id);
  return entry;
}
/** Opening a folder never discards recovery without the caller's explicit choice. */
export async function openFolderProject(
  directory: ProjectDirectoryHandle,
  options: { discardRecovery?: boolean; fileName?: string } = {},
): Promise<SavedProject> {
  const first = await readDirectoryProject(directory, options.fileName);
  return withProjectLock(first.document.projectId, async () => {
    const { document, revision } = await readDirectoryProject(
      directory,
      options.fileName,
    );
    if (document.projectId !== first.document.projectId)
      throw new FolderStorageError(
        "conflict",
        "project.json changed while it was opening. Open the folder again.",
      );
    return rememberDirectoryProject(
      directory,
      document,
      revision,
      true,
      options.discardRecovery === true,
      options.fileName,
    );
  });
}
async function readSavedProject(
  id: string,
  options: {
    activate: boolean;
    preserveRecovery: boolean;
    discardRecovery?: boolean;
  },
): Promise<SavedProject> {
  const { project, folder } = await storedProject(id);
  if (!project)
    throw new FolderStorageError(
      "missing",
      "This project is no longer in the local library. Open its project folder again.",
    );
  if (project.trashedAt)
    throw new Error("This project is in Trash. Restore it before opening it.");
  if (
    folder?.dirty &&
    !options.preserveRecovery &&
    options.discardRecovery === false
  )
    throw pendingRecoveryError();
  if (
    !folder ||
    (options.preserveRecovery &&
      (folder.dirty ||
        (await folderPermission(folder.directory)) !== "granted"))
  ) {
    const entry = {
      ...project,
      workspace: validateWorkspace(project.workspace),
    };
    if (options.activate) await cacheProject(entry, folder, true);
    if (folder) acknowledged.set(id, entry.fileRevision ?? folder.fileRevision);
    return entry;
  }
  const { document, revision } = await readDirectoryProject(
    folder.directory,
    folder.fileName,
  );
  if (document.projectId !== id)
    throw new FolderStorageError(
      "conflict",
      "This file now belongs to a different project. Open its folder again to review it.",
    );
  return rememberDirectoryProject(
    folder.directory,
    document,
    revision,
    options.activate,
    !options.preserveRecovery && options.discardRecovery !== false,
    folder.fileName,
  );
}
/** Library activation retains unsaved recovery and does not write project.json. */
export async function activateSavedProject(id: string): Promise<SavedProject> {
  return withProjectLock(id, async () => {
    const { project, folder } = await storedProject(id);
    if (project?.copyOf && folder) {
      return withProjectLock(project.copyOf, async () => {
        const { document, revision } = await readDirectoryProject(
          folder.directory,
          folder.fileName,
        );
        if (
          document.projectId !== project.copyOf ||
          revision !== project.fileRevision
        )
          throw new FolderStorageError(
            "conflict",
            "This copy changed. Refresh the project library before opening it.",
          );
        const entry = {
          ...project,
          id: crypto.randomUUID(),
          copyOf: undefined,
          missing: false,
        };
        const nextRevision = await writeDirectoryProject(
          folder.directory,
          serializeProjectFile(documentFor(entry)),
          revision,
          folder.fileName,
        );
        const saved = { ...entry, fileRevision: nextRevision };
        await cacheProject(
          saved,
          { ...folder, id: saved.id, fileRevision: nextRevision },
          true,
          id,
        );
        acknowledged.set(saved.id, nextRevision);
        return saved;
      });
    }
    return readSavedProject(id, { activate: true, preserveRecovery: true });
  });
}
/** Explicit disk reload: callers confirm before discarding browser recovery. */
export async function loadSavedProject(
  id: string,
  options: { discardRecovery?: boolean } = {},
): Promise<SavedProject> {
  return withProjectLock(id, () =>
    readSavedProject(id, {
      activate: false,
      preserveRecovery: false,
      discardRecovery: options.discardRecovery,
    }),
  );
}
export async function listProjectRoots(): Promise<ProjectRoot[]> {
  const database = await db();
  try {
    return (await database.getAll("projectRoots")) as ProjectRoot[];
  } finally {
    database.close();
  }
}

async function relativeTo(
  root: ProjectDirectoryHandle,
  directory: ProjectDirectoryHandle,
) {
  if (await root.isSameEntry(directory)) return [];
  return typeof root.resolve === "function" ? root.resolve(directory) : null;
}

/** Display a folder's path within its connected root without an absolute path. */
export async function getProjectDirectoryPath(
  directory: ProjectDirectoryHandle,
): Promise<string> {
  const roots = await listProjectRoots();
  for (const root of roots) {
    try {
      const path = await relativeTo(root.directory, directory);
      if (path) return [root.name, ...path].join("/");
    } catch {
      /* Other disconnected folders must not block this location's preview. */
    }
  }
  return directory.name;
}

export async function connectProjectRoot(
  directory: ProjectDirectoryHandle,
): Promise<ProjectRoot> {
  return withProjectLock("project-roots", async () => {
    const roots = await listProjectRoots();
    for (const root of roots) {
      try {
        if (await relativeTo(root.directory, directory)) return root;
      } catch {
        /* A disconnected root must not prevent connecting another. */
      }
    }
    const root = { id: crypto.randomUUID(), name: directory.name, directory };
    const covered: string[] = [];
    for (const previous of roots) {
      try {
        if (await relativeTo(directory, previous.directory))
          covered.push(previous.id);
      } catch {
        /* Retain inaccessible roots for reconnection. */
      }
    }
    const database = await db();
    try {
      const tx = database.transaction("projectRoots", "readwrite");
      await tx.objectStore("projectRoots").put(root);
      for (const id of covered) await tx.objectStore("projectRoots").delete(id);
      await tx.done;
    } finally {
      database.close();
    }
    return root;
  });
}

async function fileLocation(
  directory: ProjectDirectoryHandle,
  fileName: string,
) {
  const root = await connectProjectRoot(directory);
  const path = await relativeTo(root.directory, directory);
  return {
    rootId: root.id,
    rootName: root.name,
    relativePath: [...(path ?? []), fileName].join("/"),
    folderName: directory.name,
    fileName,
  };
}

/** Named documents need no wrapper directory. Keep legacy creation for imports/tests. */
export async function createProjectFile(
  directory: ProjectDirectoryHandle,
  name: string,
  value: Workspace,
): Promise<SavedProject> {
  const fileName = projectFileName(name);
  const workspace = validateWorkspace({
    ...value,
    project: {
      ...value.project,
      name: fileName.slice(0, -PROJECT_FILE_EXTENSION.length),
    },
  });
  const now = new Date().toISOString();
  const entry: SavedProject = {
    id: crypto.randomUUID(),
    workspace,
    createdAt: now,
    updatedAt: now,
    starred: false,
  };
  return writeNamedProject(entry, undefined, directory, fileName, true);
}

/** Copy, verify, then remove the source. Never overwrite an existing destination. */
async function writeNamedProject(
  entry: SavedProject,
  source: FolderBinding | undefined,
  directory: ProjectDirectoryHandle,
  fileName: string,
  activate: boolean,
  replaceId?: string,
): Promise<SavedProject> {
  return withProjectLock(
    `destination:${directory.name}:${fileName.toLowerCase()}`,
    async () => {
      await requireFolderPermission(directory);
      const location = await fileLocation(directory, fileName);
      if (
        source &&
        (await source.directory.isSameEntry(directory)) &&
        (source.fileName ?? PROJECT_FILE_NAME) === fileName
      ) {
        await persistProject(entry, source, activate, entry.fileRevision);
        return (await storedProject(entry.id)).project!;
      }
      let sourceRevision: string | undefined;
      if (source) {
        const current = await readDirectoryProject(
          source.directory,
          source.fileName,
        );
        sourceRevision = current.revision;
        if (
          current.document.projectId !== entry.id ||
          current.revision !== entry.fileRevision
        )
          throw new FolderStorageError(
            "conflict",
            "The source file changed. Reload it before renaming or moving it.",
          );
      }
      const text = serializeProjectFile(documentFor(entry));
      const revision = await writeDirectoryProject(
        directory,
        text,
        null,
        fileName,
      );
      const written = await readDirectoryProject(directory, fileName);
      if (written.revision !== revision)
        throw new FolderStorageError(
          "conflict",
          "The destination changed while saving. The original file has been kept.",
        );
      if (source) {
        try {
          // Check again after the destination commits, before touching the source.
          const current = await readDirectoryProject(
            source.directory,
            source.fileName,
          );
          if (current.revision !== sourceRevision)
            throw new FolderStorageError(
              "conflict",
              "The source changed during the move. Both files have been kept.",
            );
          await source.directory.removeEntry(
            source.fileName ?? PROJECT_FILE_NAME,
          );
        } catch (error) {
          // Both complete files are retained when deletion fails. Do not redirect autosave.
          throw new FolderStorageError(
            "write",
            `${error instanceof Error ? error.message : "Could not remove the source file."} The move did not finish; the original save location is unchanged and a complete copy is at ${directory.name}/${fileName}.`,
          );
        }
      }
      const saved = {
        ...entry,
        ...location,
        fileRevision: revision,
        missing: false,
      };
      try {
        await cacheProject(
          saved,
          {
            id: entry.id,
            directory,
            name: directory.name,
            fileName,
            rootId: location.rootId,
            relativePath: location.relativePath,
            fileRevision: revision,
            dirty: false,
          },
          activate,
          replaceId,
        );
      } catch {
        throw new FolderStorageError(
          "cache",
          `The complete project is at ${directory.name}/${fileName}, but its browser connection could not be updated. Refresh the project library to reconnect it.`,
        );
      }
      acknowledged.set(entry.id, revision);
      loadErrors.delete(entry.id);
      return saved;
    },
  );
}

export async function moveProjectFile(
  id: string,
  directory: ProjectDirectoryHandle,
  name: string,
): Promise<SavedProject> {
  const fileName = projectFileName(name);
  return withProjectLock(id, async () => {
    const { project, folder } = await writableProject(id);
    if (!project) throw new Error("This project is no longer available.");
    if (project.copyOf) throw new Error("Open this copy before moving it.");
    let entry = project;
    if (folder && !folder.dirty) {
      const { document, revision } = await readDirectoryProject(
        folder.directory,
        folder.fileName,
      );
      if (document.projectId !== id)
        throw new Error("The source file belongs to a different project.");
      entry = {
        ...entry,
        workspace: document.workspace,
        fileRevision: revision,
      };
    }
    if (!z.uuid().safeParse(entry.id).success)
      entry = { ...entry, id: crypto.randomUUID() };
    entry = {
      ...entry,
      updatedAt: new Date().toISOString(),
      workspace: {
        ...entry.workspace,
        project: {
          ...entry.workspace.project,
          name: fileName.slice(0, -PROJECT_FILE_EXTENSION.length),
        },
      },
    };
    return writeNamedProject(entry, folder, directory, fileName, false, id);
  });
}

export async function createProjectLibraryFolder(
  directory: ProjectDirectoryHandle,
  name: string,
) {
  const valid = validateProjectFolderName(name);
  await requireFolderPermission(directory);
  try {
    await directory.getDirectoryHandle(valid);
    throw new FolderStorageError(
      "exists",
      "A folder with that name already exists.",
    );
  } catch (error) {
    if (!(error instanceof Error && error.name === "NotFoundError"))
      throw error;
  }
  return directory.getDirectoryHandle(valid, { create: true });
}

export async function createFolderProject(
  parent: ProjectDirectoryHandle,
  name: string,
  value: Workspace,
): Promise<SavedProject> {
  const folderName = validateProjectFolderName(name);
  const workspace = validateWorkspace({
    ...value,
    project: { ...value.project, name: folderName },
  });
  const now = new Date().toISOString();
  const entry: SavedProject = {
    id: crypto.randomUUID(),
    workspace,
    createdAt: now,
    updatedAt: now,
    starred: false,
  };
  return writeNewProjectFolder(parent, folderName, entry, true);
}

/** Switch the save binding only after a complete file has committed successfully. */
export async function saveProjectToFolder(
  id: string,
  parent: ProjectDirectoryHandle,
  name: string,
): Promise<SavedProject> {
  const folderName = validateProjectFolderName(name);
  return withProjectLock(id, async () => {
    const { project: cached, folder } = await writableProject(id);
    if (!cached) throw new Error("This project is no longer available.");
    // Dirty recovery is the user's latest work. Otherwise read the source file
    // again so changing locations never silently copies a stale browser cache.
    let source = cached;
    if (folder && !folder.dirty) {
      const { document } = await readDirectoryProject(
        folder.directory,
        folder.fileName,
      );
      if (document.projectId !== id)
        throw new FolderStorageError(
          "conflict",
          "This file now belongs to a different project. Open its folder again to review it.",
        );
      // Do not acknowledge or cache this newer source until the destination
      // commits. A failed move must not authorize stale editor state to overwrite it.
      source = {
        ...cached,
        workspace: document.workspace,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      };
    }
    // Legacy browser entries use keys such as "main" and "example-reactor".
    // Native documents require a UUID; replace that browser key atomically.
    if (!z.uuid().safeParse(source.id).success)
      source = { ...source, id: crypto.randomUUID() };
    return writeNewProjectFolder(parent, folderName, source, false, id);
  });
}

async function writeNewProjectFolder(
  parent: ProjectDirectoryHandle,
  folderName: string,
  entry: SavedProject,
  activate: boolean,
  replaceId?: string,
): Promise<SavedProject> {
  const text = serializeProjectFile(documentFor(entry));
  return withProjectLock(
    `create:${parent.name}:${folderName.toLocaleLowerCase()}`,
    async () => {
      await requireFolderPermission(parent);
      try {
        await parent.getDirectoryHandle(folderName);
        throw new FolderStorageError(
          "exists",
          "A folder with this project name already exists. Choose another name or open the existing project.",
        );
      } catch (error) {
        if (error instanceof Error && error.name === "TypeMismatchError")
          throw new FolderStorageError(
            "exists",
            "A file already uses this project name. Choose another name.",
          );
        if (!(error instanceof Error && error.name === "NotFoundError"))
          throw error;
      }
      const directory = (await parent.getDirectoryHandle(folderName, {
        create: true,
      })) as ProjectDirectoryHandle;
      let revision: string;
      try {
        // Never write into a concurrently populated, existing folder.
        for await (const item of directory.values()) {
          void item;
          throw new FolderStorageError(
            "exists",
            "This project folder is no longer empty. Choose another project name.",
          );
        }
        revision = await writeDirectoryProject(directory, text, null);
      } catch (error) {
        // Do not delete entries: another application can populate this folder
        // between checks. A failed creation is never added to the project list.
        throw folderError(
          error,
          "Could not create project.json. Check the folder and available disk space, then try again.",
        );
      }
      const saved = {
        ...entry,
        folderName: directory.name,
        fileRevision: revision,
      };
      try {
        await cacheProject(
          saved,
          {
            id: entry.id,
            directory,
            name: directory.name,
            fileRevision: revision,
            dirty: false,
          },
          activate,
          replaceId,
        );
      } catch {
        throw new FolderStorageError(
          "cache",
          "project.json was saved, but the folder connection could not be updated. Your previous save location is still available. Try again after checking browser storage.",
        );
      }
      acknowledged.set(entry.id, revision);
      loadErrors.delete(entry.id);
      return saved;
    },
  );
}
/** Open a named example as a separate browser project, retaining its edits. */
export async function openExampleWorkspace(exampleId: string, seed: Workspace) {
  const initial = validateWorkspace(seed);
  const projectId = `example-${exampleId}`;
  const database = await db();
  try {
    const tx = database.transaction(["workspace", "projects"], "readwrite");
    const currentStore = tx.objectStore("workspace");
    const projects = tx.objectStore("projects");
    const [current, activeId, existing] = await Promise.all([
      currentStore.get("current"),
      currentStore.get("activeProject"),
      projects.get(projectId) as Promise<SavedProject | undefined>,
    ]);
    if (existing?.trashedAt) {
      await tx.done;
      // Old example links must still leave the library accessible for Restore.
      return {
        projectId: activeId ?? "",
        workspace: current ? validateWorkspace(current) : null,
      };
    }
    const workspace = existing
      ? validateWorkspace(existing.workspace)
      : initial;
    const now = new Date().toISOString();
    const previousId = activeId ?? "main";
    if (current && !(await projects.get(previousId)))
      await projects.put({
        id: previousId,
        workspace: validateWorkspace(current),
        createdAt: now,
        updatedAt: now,
        starred: false,
      } satisfies SavedProject);
    if (!existing)
      await projects.put({
        id: projectId,
        workspace,
        createdAt: now,
        updatedAt: now,
        starred: false,
      } satisfies SavedProject);
    await currentStore.put(workspace, "current");
    await currentStore.put(projectId, "activeProject");
    await currentStore.delete(`deletedProject:${projectId}`);
    await tx.done;
    return { projectId, workspace };
  } finally {
    database.close();
  }
}
interface DiscoveredProject {
  directory: ProjectDirectoryHandle;
  fileName: string;
  root: ProjectRoot;
  path: string;
  document: ProjectFile;
  revision: string;
}

async function discoverRoot(root: ProjectRoot) {
  const files: DiscoveredProject[] = [];
  const folders: ProjectLibraryFolder[] = [];
  const errors: string[] = [];
  let visited = 0;
  async function visit(
    directory: ProjectDirectoryHandle,
    path: string,
    depth: number,
  ) {
    if (depth > 32) throw new Error("Folder nesting exceeds 32 levels.");
    folders.push({ rootId: root.id, path, directory });
    for await (const child of directory.values()) {
      if (++visited > 10000)
        throw new Error(
          "This folder contains more than 10,000 entries. Connect a smaller project folder.",
        );
      const childPath = path ? `${path}/${child.name}` : child.name;
      if (child.kind === "directory") {
        await visit(child as ProjectDirectoryHandle, childPath, depth + 1);
      } else if (
        child.name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION) ||
        child.name === PROJECT_FILE_NAME
      ) {
        try {
          const file = await readDirectoryProject(directory, child.name);
          files.push({
            directory,
            fileName: child.name,
            root,
            path: childPath,
            ...file,
          });
        } catch (error) {
          errors.push(
            `${root.name}/${childPath}: ${error instanceof Error ? error.message : "Could not read project."}`,
          );
        }
      }
    }
  }
  await requireFolderPermission(root.directory);
  await visit(root.directory, "", 0);
  return { files, folders, errors };
}

async function sameLocation(folder: FolderBinding, file: DiscoveredProject) {
  return (
    (folder.fileName ?? PROJECT_FILE_NAME) === file.fileName &&
    (await folder.directory.isSameEntry(file.directory))
  );
}

/** Scanning changes the library cache only; never advances a live editor's baseline. */
async function cacheLibraryProject(entry: SavedProject, folder: FolderBinding) {
  const database = await db();
  try {
    const tx = database.transaction(
      ["projects", "projectFolders"],
      "readwrite",
    );
    await tx.objectStore("projects").put(entry);
    await tx.objectStore("projectFolders").put(folder);
    await tx.done;
  } finally {
    database.close();
  }
}

async function rememberDiscovered(
  file: DiscoveredProject,
  id: string,
  activeId: string,
) {
  const { project, folder } = await storedProject(id);
  const preserve = project && (folder?.dirty || activeId === id);
  const entry: SavedProject = {
    id,
    workspace: preserve ? project.workspace : file.document.workspace,
    createdAt: file.document.createdAt,
    updatedAt: preserve ? project.updatedAt : file.document.updatedAt,
    starred: project?.starred ?? false,
    ...(project?.trashedAt ? { trashedAt: project.trashedAt } : {}),
    ...(id !== file.document.projectId
      ? { copyOf: file.document.projectId }
      : {}),
    folderName: file.directory.name,
    fileName: file.fileName,
    rootId: file.root.id,
    rootName: file.root.name,
    relativePath: file.path,
    missing: false,
    fileRevision: preserve ? project.fileRevision : file.revision,
  };
  const binding: FolderBinding = {
    id,
    directory: file.directory,
    name: file.directory.name,
    fileName: file.fileName,
    rootId: file.root.id,
    relativePath: file.path,
    fileRevision: preserve
      ? (folder?.fileRevision ?? file.revision)
      : file.revision,
    dirty: folder?.dirty ?? false,
  };
  await cacheLibraryProject(entry, binding);
  // A changed file must still report a conflict when the live editor next saves.
  if (!preserve || entry.fileRevision === file.revision) loadErrors.delete(id);
  else
    loadErrors.set(
      id,
      "The project file changed on disk. Export your local copy or reload the file before continuing.",
    );
  return entry;
}

export async function scanProjectLibrary(): Promise<ProjectLibrary> {
  return withProjectLock("project-library", async () => {
    const roots = await listProjectRoots();
    const files: DiscoveredProject[] = [];
    const folders: ProjectLibraryFolder[] = [];
    const errors: string[] = [];
    for (const root of roots) {
      try {
        const discovered = await discoverRoot(root);
        files.push(...discovered.files);
        folders.push(...discovered.folders);
        errors.push(...discovered.errors);
      } catch (error) {
        errors.push(
          `${root.name}: ${error instanceof Error ? error.message : "Could not scan folder."}`,
        );
      }
    }
    const activeId = await activeProjectId();
    const seen = new Set<string>();
    const cachedCopies = (await listProjects()).filter((entry) => entry.copyOf);
    for (const file of files) {
      await withProjectLock(file.document.projectId, async () => {
        try {
          const fresh = await readDirectoryProject(
            file.directory,
            file.fileName,
          );
          if (fresh.document.projectId !== file.document.projectId) return;
          file.document = fresh.document;
          file.revision = fresh.revision;
        } catch (error) {
          errors.push(
            `${file.root.name}/${file.path}: ${error instanceof Error ? error.message : "Could not refresh file."}`,
          );
          return;
        }
        let id = file.document.projectId;
        const existing = await storedProject(id);
        if (existing.folder && !(await sameLocation(existing.folder, file))) {
          let originalMissing = false;
          try {
            await readDirectoryProject(
              existing.folder.directory,
              existing.folder.fileName,
            );
          } catch (error) {
            originalMissing =
              error instanceof FolderStorageError && error.code === "missing";
          }
          const candidates = files.filter(
            (item) => item.document.projectId === id,
          );
          if (!originalMissing || candidates.length !== 1) {
            // A copied document must not retarget the original's autosave.
            id = `copy:${file.root.id}:${file.path}`;
          }
        } else if (existing.deleted) {
          id = `copy:${file.root.id}:${file.path}`;
        }
        await rememberDiscovered(file, id, activeId);
        seen.add(id);
        // A located original can replace a previously ambiguous copy entry.
        for (const entry of cachedCopies) {
          if (!entry.copyOf || entry.id === id) continue;
          const duplicate = await storedProject(entry.id);
          if (
            duplicate.folder &&
            (await sameLocation(duplicate.folder, file))
          ) {
            const database = await db();
            try {
              const tx = database.transaction(
                ["projects", "projectFolders"],
                "readwrite",
              );
              await tx.objectStore("projects").delete(entry.id);
              await tx.objectStore("projectFolders").delete(entry.id);
              await tx.done;
            } finally {
              database.close();
            }
          }
        }
      });
    }
    for (const entry of await listProjects()) {
      if (!entry.folderName || seen.has(entry.id)) continue;
      await withProjectLock(entry.id, async () => {
        const { project, folder } = await storedProject(entry.id);
        if (!project || !folder) return;
        try {
          const current = await readDirectoryProject(
            folder.directory,
            folder.fileName,
          );
          if (current.document.projectId !== (project.copyOf ?? project.id))
            throw new FolderStorageError(
              "missing",
              "Another project now occupies this file location.",
            );
        } catch (error) {
          if (error instanceof FolderStorageError && error.code === "missing") {
            await cacheLibraryProject({ ...project, missing: true }, folder);
            loadErrors.set(
              entry.id,
              "This project file moved or is missing. Use Locate project to reconnect it. Your work remains in this browser.",
            );
          }
        }
      });
    }
    return { projects: await listProjects(), roots, folders, errors };
  });
}

/** The user selects a containing folder; a unique document ID reconnects a moved file. */
export async function locateProjectFile(
  id: string,
  directory: ProjectDirectoryHandle,
) {
  const root = await connectProjectRoot(directory);
  const searchRoot = { ...root, directory, name: directory.name };
  const { files } = await discoverRoot(searchRoot);
  const candidates = files.filter((file) => file.document.projectId === id);
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "Several copies of this project are in that folder. Choose the folder containing only the file you want."
        : "This folder does not contain the project. Choose its new containing folder.",
    );
  return withProjectLock(id, async () => {
    const file = candidates[0];
    const { folder } = await storedProject(id);
    if (folder && !(await sameLocation(folder, file))) {
      try {
        await readDirectoryProject(folder.directory, folder.fileName);
        throw new FolderStorageError(
          "exists",
          "The original file still exists. Open the discovered copy as a separate project instead.",
        );
      } catch (error) {
        if (!(error instanceof FolderStorageError && error.code === "missing"))
          throw error;
      }
    }
    const location = await fileLocation(file.directory, file.fileName);
    await rememberDiscovered(
      { ...file, root, path: location.relativePath },
      id,
      await activeProjectId(),
    );
    return (await storedProject(id)).project!;
  });
}

export async function listProjects(): Promise<SavedProject[]> {
  const database = await db();
  try {
    return ((await database.getAll("projects")) as SavedProject[])
      .map((entry) => ({
        ...entry,
        workspace: validateWorkspace(entry.workspace),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}
export async function updateSavedProject(
  value: SavedProject,
  options: { rename?: boolean } = {},
) {
  const entry = { ...value, workspace: validateWorkspace(value.workspace) };
  return withProjectLock(entry.id, async () => {
    const { project: existing, folder } = await writableProject(entry.id);
    if (
      folder &&
      existing &&
      (options.rename ||
        entry.workspace.project.name !== existing.workspace.project.name) &&
      folder.fileName
    ) {
      return writeNamedProject(
        entry,
        folder,
        folder.directory,
        projectFileName(entry.workspace.project.name),
        false,
      );
    }
    if (
      folder &&
      existing &&
      JSON.stringify(entry.workspace) === JSON.stringify(existing.workspace)
    ) {
      // Favorites belong to this browser, not to the engineering document.
      await cacheProject(
        {
          ...entry,
          folderName: folder.name,
          ...(folder.fileName ? { fileName: folder.fileName } : {}),
          fileRevision: existing.fileRevision,
        },
        folder,
        false,
      );
      return entry;
    }
    await persistProject(entry, folder, false, entry.fileRevision);
    return (await storedProject(entry.id)).project!;
  });
}
/** Trash keeps the complete workspace and folder binding without touching disk. */
export async function trashSavedProject(
  id: string,
): Promise<SavedProject | null> {
  return withProjectLock(id, async () => {
    const database = await db();
    try {
      const tx = database.transaction(["workspace", "projects"], "readwrite");
      const projects = tx.objectStore("projects");
      const current = tx.objectStore("workspace");
      const entry: SavedProject | undefined = await projects.get(id);
      if (!entry) throw new Error("This project is no longer available.");
      await projects.put({
        ...entry,
        trashedAt: entry.trashedAt ?? new Date().toISOString(),
      });
      const activeId = (await current.get("activeProject")) ?? "main";
      let active: SavedProject | null = null;
      if (activeId === id) {
        const remaining = (await projects.getAll()) as SavedProject[];
        active =
          remaining
            .filter((candidate) => !candidate.trashedAt)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
        // An explicit empty identity prevents startup from recreating the demo.
        await current.put(active?.id ?? "", "activeProject");
        if (active) await current.put(active.workspace, "current");
        else await current.delete("current");
      } else {
        active = (await projects.get(activeId)) ?? null;
      }
      await tx.done;
      return active;
    } finally {
      database.close();
    }
  });
}

export async function restoreSavedProject(id: string): Promise<void> {
  return withProjectLock(id, async () => {
    const { project, folder } = await storedProject(id);
    if (!project?.trashedAt)
      throw new Error("This project is no longer in Trash.");
    const restored = { ...project };
    delete restored.trashedAt;
    await cacheProject(restored, folder, false);
  });
}

/** Only a trashed project can be permanently deleted. Keep it in Trash on failure. */
export async function deleteSavedProject(id: string): Promise<void> {
  return withProjectLock(id, async () => {
    const { project, folder } = await storedProject(id);
    if (!project?.trashedAt)
      throw new Error(
        "Move this project to Trash before deleting it permanently.",
      );
    if (folder) {
      if (!(await requestProjectFolderAccess(id)))
        throw new Error(
          "Folder access is needed to delete the project file. The project remains in Trash.",
        );
      try {
        const { document, revision } = await readDirectoryProject(
          folder.directory,
          folder.fileName,
        );
        if (
          document.projectId !== (project.copyOf ?? id) ||
          revision !== folder.fileRevision
        )
          throw new FolderStorageError(
            "conflict",
            "The project file changed on disk. Restore the project and reload its folder before deleting it.",
          );
        await folder.directory.removeEntry(
          folder.fileName ?? PROJECT_FILE_NAME,
        );
      } catch (error) {
        // A missing file is already deleted; other failures must retain recovery.
        if (
          !(error instanceof FolderStorageError && error.code === "missing") &&
          !(error instanceof Error && error.name === "NotFoundError")
        ) {
          if (error instanceof FolderStorageError) throw error;
          throw new FolderStorageError(
            error instanceof Error &&
              ["NotAllowedError", "SecurityError"].includes(error.name)
              ? "permission"
              : "write",
            "Could not delete the project file from disk. The project remains in Trash. Close any app using the file and try again.",
          );
        }
      }
    }
    const database = await db();
    try {
      const tx = database.transaction(
        ["workspace", "projects", "projectFolders"],
        "readwrite",
      );
      await tx.objectStore("projects").delete(id);
      await tx.objectStore("projectFolders").delete(id);
      // A stale editor in another tab must never recreate a deleted project.
      await tx.objectStore("workspace").put(true, `deletedProject:${id}`);
      await tx.done;
      acknowledged.delete(id);
      loadErrors.delete(id);
    } finally {
      database.close();
    }
  });
}
export async function clearWorkspace(projectId = "main") {
  const database = await db();
  try {
    const tx = database.transaction(
      ["workspace", "projects", "projectFolders"],
      "readwrite",
    );
    const folder = await tx.objectStore("projectFolders").get(projectId);
    await tx.objectStore("workspace").delete("current");
    await tx.objectStore("workspace").delete("activeProject");
    // The following accepted empty-workspace save must retain its native folder.
    if (!folder) await tx.objectStore("projects").delete(projectId);
    await tx.done;
  } finally {
    database.close();
  }
}
export const parseImport = parseWorkspaceImport;
