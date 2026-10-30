import {
  MAX_PROJECT_FILE_BYTES,
  PROJECT_FILE_NAME,
  parseProjectFile,
  type ProjectFile,
} from "./project-file";

export type ProjectDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

type DirectoryPicker = (options: {
  id: string;
  mode: "readwrite";
  startIn: "documents";
}) => Promise<ProjectDirectoryHandle>;

export type FolderErrorCode =
  | "unsupported"
  | "permission"
  | "exists"
  | "missing"
  | "invalid"
  | "conflict"
  | "recovery"
  | "write"
  | "cache";

export class FolderStorageError extends Error {
  constructor(
    public readonly code: FolderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FolderStorageError";
  }
}

function picker(): DirectoryPicker | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as Window & { showDirectoryPicker?: DirectoryPicker })
        .showDirectoryPicker;
}

export function supportsProjectFolders(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext !== false &&
    typeof picker() === "function"
  );
}

/** Call this directly from the Choose folder/Open folder click handler. */
export async function chooseProjectDirectory(): Promise<ProjectDirectoryHandle | null> {
  if (!supportsProjectFolders())
    throw new FolderStorageError(
      "unsupported",
      "Local project folders require a desktop browser with folder access, such as Chrome or Edge, on HTTPS or localhost.",
    );
  try {
    return await picker()!.call(window, {
      id: "project-cad-projects",
      mode: "readwrite",
      startIn: "documents",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null;
    throw folderError(error, "Could not choose a local folder.");
  }
}

export function validateProjectFolderName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80)
    throw new Error("Enter a project name between 1 and 80 characters.");
  if (
    /[<>:"/\\|?*]/.test(name) ||
    [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error(
      "Choose a folder-safe name without slashes, special file characters, trailing dots, or reserved device names.",
    );
  return name;
}

export function folderError(
  error: unknown,
  fallback: string,
): FolderStorageError {
  if (error instanceof FolderStorageError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return new FolderStorageError(
      "permission",
      "Folder access is needed. Reconnect the folder to save project.json. Your latest changes remain in this browser.",
    );
  if (name === "NotFoundError")
    return new FolderStorageError(
      "missing",
      "The project folder or project.json is missing. Open its folder again. Your latest changes remain in this browser.",
    );
  if (name === "NoModificationAllowedError")
    return new FolderStorageError(
      "conflict",
      "Another window is writing project.json. Wait for it to finish, then try saving again.",
    );
  return new FolderStorageError("write", fallback);
}

export async function folderPermission(
  directory: ProjectDirectoryHandle,
): Promise<PermissionState> {
  try {
    return await directory.queryPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

export async function requireFolderPermission(
  directory: ProjectDirectoryHandle,
) {
  if ((await folderPermission(directory)) !== "granted")
    throw new FolderStorageError(
      "permission",
      "Folder access is needed. Reconnect the folder to save project.json. Your latest changes remain in this browser.",
    );
}

export async function fileRevision(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function fileText(file: FileSystemFileHandle) {
  const value = await file.getFile();
  if (value.size > MAX_PROJECT_FILE_BYTES)
    throw new FolderStorageError("invalid", "Project file exceeds 32 MB.");
  return value.text();
}

export async function readDirectoryProject(
  directory: ProjectDirectoryHandle,
): Promise<{
  document: ProjectFile;
  revision: string;
}> {
  await requireFolderPermission(directory);
  let text: string;
  try {
    text = await fileText(await directory.getFileHandle(PROJECT_FILE_NAME));
  } catch (error) {
    throw folderError(
      error,
      "Could not read project.json from the selected folder.",
    );
  }
  try {
    return {
      document: parseProjectFile(text),
      revision: await fileRevision(text),
    };
  } catch (error) {
    throw new FolderStorageError(
      "invalid",
      error instanceof Error ? error.message : "This project.json is invalid.",
    );
  }
}

/** The browser commits the temporary writable stream only when close succeeds. */
export async function writeDirectoryProject(
  directory: ProjectDirectoryHandle,
  text: string,
  expectedRevision: string | null,
): Promise<string> {
  await requireFolderPermission(directory);
  let writable: FileSystemWritableFileStream | undefined;
  let closed = false;
  try {
    if (expectedRevision === null) {
      try {
        await directory.getFileHandle(PROJECT_FILE_NAME);
        throw new FolderStorageError(
          "exists",
          "This folder already contains project.json. Choose another project name.",
        );
      } catch (error) {
        if (!(error instanceof Error && error.name === "NotFoundError"))
          throw error;
      }
    }
    const file = await directory.getFileHandle(PROJECT_FILE_NAME, {
      create: expectedRevision === null,
    });
    writable = await file.createWritable({
      keepExistingData: false,
      mode: "exclusive",
    } as FileSystemCreateWritableOptions & { mode: "exclusive" });
    const current = await fileText(file);
    if (
      expectedRevision === null
        ? current.length !== 0
        : (await fileRevision(current)) !== expectedRevision
    )
      throw new FolderStorageError(
        "conflict",
        "project.json changed in another window or application. Export your latest changes, then reopen the folder before saving.",
      );
    await writable.write(text);
    await writable.close();
    closed = true;
    return fileRevision(text);
  } catch (error) {
    if (writable && !closed) await writable.abort().catch(() => {});
    throw folderError(
      error,
      "Could not save project.json. Your latest changes remain in this browser. Check the folder and available disk space, then try again.",
    );
  }
}

const pending = new Map<string, Promise<void>>();

/** Serialize this page and coordinate same-origin tabs without holding an IDB transaction. */
export async function withProjectLock<T>(
  key: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve();
  const work = previous
    .catch(() => {})
    .then(() => {
      const locks =
        typeof navigator === "undefined" ? undefined : navigator.locks;
      return locks ? locks.request(`project-cad:${key}`, action) : action();
    });
  const settled = work.then(
    () => {},
    () => {},
  );
  pending.set(key, settled);
  try {
    return await work;
  } finally {
    if (pending.get(key) === settled) pending.delete(key);
  }
}
