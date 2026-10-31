import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { heatingExample } from "../src/domain/examples";
import { projectSchema } from "../src/domain/schema";
import { checkpoint, type Workspace } from "../src/lib/revisions";
import {
  parseProjectFile,
  serializeProjectFile,
} from "../src/lib/project-file";
import type { ProjectDirectoryHandle } from "../src/lib/project-directory";

// The cache is mocked here; browser tests cover IndexedDB migration and native
// handle cloning. File handles below commit JSON to a fresh OS temporary folder.
const memory = vi.hoisted(() => {
  const stores = new Map<string, Map<unknown, unknown>>();
  const clone = <T>(value: T): T => {
    if (value && typeof value === "object" && "directory" in value) {
      const { directory, ...rest } = value;
      return { ...structuredClone(rest), directory } as T;
    }
    return structuredClone(value);
  };
  const store = (name: string) => ({
    get: async (key: unknown) => clone(stores.get(name)?.get(key)),
    getAll: async () => [...stores.get(name)!.values()].map(clone),
    put: async (value: unknown, key?: unknown) => {
      const id = key ?? (value as { id: string }).id;
      stores.get(name)!.set(id, clone(value));
      return id;
    },
    delete: async (key: unknown) => stores.get(name)!.delete(key),
    clear: async () => stores.get(name)!.clear(),
  });
  return { stores, store };
});
vi.mock("idb", () => ({
  openDB: async (
    _name: string,
    _version: number,
    options: { upgrade: (database: unknown) => void },
  ) => {
    const database = {
      objectStoreNames: { contains: (name: string) => memory.stores.has(name) },
      createObjectStore: (name: string) => memory.stores.set(name, new Map()),
      get: (name: string, key: unknown) => memory.store(name).get(key),
      getAll: (name: string) => memory.store(name).getAll(),
      transaction: () => ({
        objectStore: memory.store,
        done: Promise.resolve(),
      }),
      close: () => {},
    };
    options.upgrade(database);
    return database;
  },
}));

interface DiskControl {
  permission: PermissionState;
  grant: PermissionState;
  failWrite: boolean;
  failClose: boolean;
  aborts: number;
  commits: number;
  maximumOpenWriters: number;
  openWriters: Set<string>;
}
const missing = () => new DOMException("Missing entry", "NotFoundError");
async function exists(path: string) {
  return stat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}
class DiskFile {
  readonly kind = "file";
  readonly name: string;
  constructor(
    readonly path: string,
    readonly control: DiskControl,
  ) {
    this.name = basename(path);
  }
  async getFile() {
    return new File([await readFile(this.path)], this.name);
  }
  async createWritable(options: { mode?: string }) {
    expect(options.mode).toBe("exclusive");
    if (this.control.openWriters.has(this.path))
      throw new DOMException("Busy file", "NoModificationAllowedError");
    this.control.openWriters.add(this.path);
    this.control.maximumOpenWriters = Math.max(
      this.control.maximumOpenWriters,
      this.control.openWriters.size,
    );
    const temporary = `${this.path}.${crypto.randomUUID()}.pending`;
    let text = "";
    return {
      write: async (value: string) => {
        if (this.control.failWrite) throw new Error("Disk full");
        text = value;
        await writeFile(temporary, value, "utf8");
      },
      close: async () => {
        if (this.control.failClose) throw new Error("Commit failed");
        if (!(await exists(temporary)))
          await writeFile(temporary, text, "utf8");
        await rename(temporary, this.path);
        this.control.openWriters.delete(this.path);
        this.control.commits++;
      },
      abort: async () => {
        await rm(temporary, { force: true });
        this.control.openWriters.delete(this.path);
        this.control.aborts++;
      },
    };
  }
}
class DiskDirectory {
  readonly kind = "directory";
  readonly name: string;
  constructor(
    readonly path: string,
    readonly control: DiskControl,
  ) {
    this.name = basename(path);
  }
  async queryPermission() {
    return this.control.permission;
  }
  async requestPermission() {
    this.control.permission = this.control.grant;
    return this.control.permission;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = join(this.path, name);
    let info = await exists(path);
    if (!info && options?.create) {
      await mkdir(path);
      info = await stat(path);
    }
    if (!info) throw missing();
    if (!info.isDirectory())
      throw new DOMException("Not a directory", "TypeMismatchError");
    return new DiskDirectory(path, this.control);
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const path = join(this.path, name);
    let info = await exists(path);
    if (!info && options?.create) {
      await writeFile(path, "", { flag: "wx" });
      info = await stat(path);
    }
    if (!info) throw missing();
    if (!info.isFile())
      throw new DOMException("Not a file", "TypeMismatchError");
    return new DiskFile(path, this.control);
  }
  async *values() {
    for (const name of await readdir(this.path)) {
      const path = join(this.path, name);
      yield (await stat(path)).isDirectory()
        ? new DiskDirectory(path, this.control)
        : new DiskFile(path, this.control);
    }
  }
  async isSameEntry(other: DiskDirectory) {
    return this.path === other.path;
  }
}

let temporary: string;
let control: DiskControl;
let parent: ProjectDirectoryHandle;
let storage: typeof import("../src/lib/storage");
const workspace = (): Workspace => {
  const project = projectSchema.parse(heatingExample());
  return { version: 1, project, revisions: [checkpoint(project, "Initial")] };
};
const contents = (name = "Study") =>
  readFile(join(temporary, name, "project.json"), "utf8");
const directory = (name = "Study") =>
  new DiskDirectory(
    join(temporary, name),
    control,
  ) as unknown as ProjectDirectoryHandle;
beforeEach(async () => {
  vi.resetModules();
  memory.stores.clear();
  temporary = await mkdtemp(join(tmpdir(), "project-cad-files-"));
  control = {
    permission: "granted",
    grant: "granted",
    failWrite: false,
    failClose: false,
    aborts: 0,
    commits: 0,
    maximumOpenWriters: 0,
    openWriters: new Set(),
  };
  parent = new DiskDirectory(
    temporary,
    control,
  ) as unknown as ProjectDirectoryHandle;
  storage = await import("../src/lib/storage");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(temporary, { recursive: true, force: true });
});

describe("local folder project persistence", () => {
  it("writes full JSON and revision snapshots, then opens authoritative disk contents", async () => {
    const initial = workspace();
    const created = await storage.createFolderProject(parent, "Study", initial);
    const first = parseProjectFile(await contents());
    expect(first.projectId).toBe(created.id);
    expect(first.workspace.project.name).toBe("Study");
    expect(first.workspace.revisions).toEqual(initial.revisions);
    const edited = structuredClone(created.workspace);
    edited.project.units[1].params.temperature = 490;
    edited.revisions.push(checkpoint(edited.project, "Higher temperature"));
    await expect(storage.saveWorkspace(edited, created.id)).resolves.toEqual({
      location: "folder",
      folderName: "Study",
    });
    const saved = parseProjectFile(await contents());
    expect(saved.workspace).toEqual(edited);
    expect(saved.createdAt).toBe(first.createdAt);
    expect(saved.projectId).toBe(first.projectId);
    saved.workspace.project.name = "Changed outside browser";
    await writeFile(
      join(temporary, "Study", "project.json"),
      serializeProjectFile(saved),
    );
    const reopened = await storage.loadSavedProject(created.id);
    expect(reopened.workspace.project.name).toBe("Changed outside browser");
    expect(await storage.loadWorkspace()).toEqual(saved.workspace);
  });

  it("keeps existing folders and files untouched on name collision", async () => {
    await mkdir(join(temporary, "Study"));
    await writeFile(join(temporary, "Study", "notes.txt"), "Keep me");
    await expect(
      storage.createFolderProject(parent, "Study", workspace()),
    ).rejects.toMatchObject({ code: "exists" });
    expect(await readFile(join(temporary, "Study", "notes.txt"), "utf8")).toBe(
      "Keep me",
    );
    expect(await readdir(join(temporary, "Study"))).toEqual(["notes.txt"]);
    await writeFile(join(temporary, "Other"), "Existing file");
    await expect(
      storage.createFolderProject(parent, "Other", workspace()),
    ).rejects.toMatchObject({ code: "exists" });
    expect(await storage.listProjects()).toEqual([]);
  });

  it.each([
    "../escape",
    ".",
    "..",
    "foo/bar",
    "foo\\bar",
    "CON",
    "lpt1.txt",
    "bad\u0000name",
    "trailing.",
  ])("rejects unsafe folder name %s before creating entries", async (name) => {
    await expect(
      storage.createFolderProject(parent, name, workspace()),
    ).rejects.toThrow();
    expect(await readdir(temporary)).toEqual([]);
  });

  it("keeps denied saves as browser recovery and commits after a permission regrant", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const original = await contents();
    const edited = structuredClone(created.workspace);
    edited.project.name = "Pending edits";
    control.permission = "denied";
    await expect(
      storage.saveWorkspace(edited, created.id),
    ).rejects.toMatchObject({ code: "permission" });
    expect(await contents()).toBe(original);
    expect(await storage.loadWorkspace()).toEqual(edited);
    expect(await storage.getProjectFolderInfo(created.id)).toMatchObject({
      permission: "denied",
      hasRecovery: true,
    });
    await expect(storage.loadSavedProject(created.id)).rejects.toMatchObject({
      code: "permission",
    });
    control.grant = "denied";
    expect(await storage.requestProjectFolderAccess(created.id)).toBe(false);
    control.grant = "granted";
    expect(await storage.requestProjectFolderAccess(created.id)).toBe(true);
    await storage.saveWorkspace(edited, created.id);
    expect(parseProjectFile(await contents()).workspace).toEqual(edited);
    expect((await storage.getProjectFolderInfo(created.id))?.hasRecovery).toBe(
      false,
    );
  });

  it.each(["failWrite", "failClose"] as const)(
    "aborts %s without replacing the complete old file",
    async (failure) => {
      const created = await storage.createFolderProject(
        parent,
        "Study",
        workspace(),
      );
      const original = await contents();
      const edited = structuredClone(created.workspace);
      edited.project.name = "Recovery from failed write";
      control[failure] = true;
      await expect(
        storage.saveWorkspace(edited, created.id),
      ).rejects.toMatchObject({ code: "write" });
      expect(await contents()).toBe(original);
      expect(control.aborts).toBe(1);
      expect(control.openWriters.size).toBe(0);
      expect(await storage.loadWorkspace()).toEqual(edited);
      expect(await readdir(join(temporary, "Study"))).toEqual(["project.json"]);
    },
  );

  it("does not list a project whose initial file commit failed", async () => {
    control.failClose = true;
    await expect(
      storage.createFolderProject(parent, "Study", workspace()),
    ).rejects.toMatchObject({ code: "write" });
    expect(await storage.listProjects()).toEqual([]);
    expect(await storage.loadWorkspace()).toBeNull();
    expect(control.aborts).toBe(1);
  });

  it("detects external edits before overwriting and preserves both file and browser recovery", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const external = parseProjectFile(await contents());
    external.workspace.project.name = "External update";
    const externalText = serializeProjectFile(external);
    await writeFile(join(temporary, "Study", "project.json"), externalText);
    const local = structuredClone(created.workspace);
    local.project.name = "Local update";
    await expect(
      storage.saveWorkspace(local, created.id),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await contents()).toBe(externalText);
    expect(await storage.loadWorkspace()).toEqual(local);
    expect(control.aborts).toBe(1);
    await expect(storage.openFolderProject(directory())).rejects.toMatchObject({
      code: "recovery",
    });
    expect(await storage.loadWorkspace()).toEqual(local);
    expect(
      (await storage.openFolderProject(directory(), { discardRecovery: true }))
        .workspace,
    ).toEqual(external.workspace);
  });

  it("serializes queued saves and rejects a stale independent project edit", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const one = structuredClone(created.workspace);
    one.project.name = "One";
    const two = structuredClone(one);
    two.project.name = "Two";
    await Promise.all([
      storage.saveWorkspace(one, created.id),
      storage.saveWorkspace(two, created.id),
    ]);
    expect(parseProjectFile(await contents()).workspace).toEqual(two);
    expect(control.maximumOpenWriters).toBe(1);
    const stale = structuredClone(created);
    stale.workspace.project.name = "Stale rename";
    await expect(storage.updateSavedProject(stale)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(parseProjectFile(await contents()).workspace).toEqual(two);
  });

  it("protects a stale tab even when another tab has advanced the shared cache", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const staleTab = storage;
    vi.resetModules();
    const otherTab = await import("../src/lib/storage");
    await otherTab.loadSavedProject(created.id);
    const otherEdit = structuredClone(created.workspace);
    otherEdit.project.name = "Other tab";
    await otherTab.saveWorkspace(otherEdit, created.id);
    const staleEdit = structuredClone(created.workspace);
    staleEdit.project.name = "Old tab";
    await expect(
      staleTab.saveWorkspace(staleEdit, created.id),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(parseProjectFile(await contents()).workspace).toEqual(otherEdit);
  });

  it("keeps a linked folder when the workspace is cleared", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const previous = await contents();
    await storage.clearWorkspace(created.id);
    expect(await contents()).toBe(previous);
    expect((await storage.getProjectFolderInfo(created.id))?.name).toBe(
      "Study",
    );
    const empty: Workspace = {
      version: 1,
      project: { version: 1, name: "Study", units: [], edges: [] },
      revisions: [],
    };
    await storage.saveWorkspace(empty, created.id);
    expect(parseProjectFile(await contents()).workspace.project.units).toEqual(
      [],
    );
  });

  it("does not retarget saves to a copied folder with the same project identity", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    await mkdir(join(temporary, "Copy"));
    await writeFile(join(temporary, "Copy", "project.json"), await contents());
    await expect(
      storage.openFolderProject(directory("Copy")),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await storage.getProjectFolderInfo(created.id))?.name).toBe(
      "Study",
    );
  });

  it("keeps browser favorites outside project.json", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const previous = await contents();
    control.permission = "denied";
    await storage.updateSavedProject({ ...created, starred: true });
    expect(await contents()).toBe(previous);
    expect((await storage.listProjects())[0].starred).toBe(true);
  });

  it("activates dirty recovery without writing disk or discarding another project's recovery", async () => {
    const first = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const second = await storage.createFolderProject(
      parent,
      "Other",
      workspace(),
    );
    const firstFile = await contents();
    const secondFile = await contents("Other");
    const firstEdit = structuredClone(first.workspace);
    firstEdit.project.name = "First recovery";
    const secondEdit = structuredClone(second.workspace);
    secondEdit.project.name = "Second recovery";
    control.failWrite = true;
    await expect(
      storage.saveWorkspace(firstEdit, first.id),
    ).rejects.toMatchObject({ code: "write" });
    await expect(
      storage.saveWorkspace(secondEdit, second.id),
    ).rejects.toMatchObject({ code: "write" });
    control.failWrite = false;
    expect(await storage.activeProjectId()).toBe(second.id);
    expect((await storage.activateSavedProject(first.id)).workspace).toEqual(
      firstEdit,
    );
    expect(await storage.loadActiveWorkspace()).toEqual({
      projectId: first.id,
      workspace: firstEdit,
    });
    expect(await contents()).toBe(firstFile);
    expect(await contents("Other")).toBe(secondFile);
    expect(control.commits).toBe(2);
    expect((await storage.getProjectFolderInfo(first.id))?.hasRecovery).toBe(
      true,
    );
    expect((await storage.getProjectFolderInfo(second.id))?.hasRecovery).toBe(
      true,
    );
    expect(
      (await storage.listProjects()).find((entry) => entry.id === second.id)
        ?.workspace,
    ).toEqual(secondEdit);
  });

  it("preserves the latest project for switching without attempting any disk write", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const previous = await contents();
    const recovery = structuredClone(created.workspace);
    recovery.project.name = "Latest unsaved work";
    control.permission = "denied";
    await storage.saveWorkspaceRecovery(recovery, created.id);
    expect(await storage.loadActiveWorkspace()).toEqual({
      projectId: created.id,
      workspace: recovery,
    });
    expect(await contents()).toBe(previous);
    expect(control.commits).toBe(1);
    expect(control.aborts).toBe(0);
    expect((await storage.getProjectFolderInfo(created.id))?.hasRecovery).toBe(
      true,
    );
    await storage.openExampleWorkspace("heating", workspace());
    expect((await storage.activateSavedProject(created.id)).workspace).toEqual(
      recovery,
    );
  });

  it("does not advance a stale tab's file baseline when preserving recovery", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const staleTab = storage;
    vi.resetModules();
    const otherTab = await import("../src/lib/storage");
    await otherTab.loadSavedProject(created.id);
    const current = structuredClone(created.workspace);
    current.project.name = "New file version";
    await otherTab.saveWorkspace(current, created.id);
    const stale = structuredClone(created.workspace);
    stale.project.name = "Older tab recovery";
    await staleTab.saveWorkspaceRecovery(stale, created.id);
    expect(parseProjectFile(await contents()).workspace).toEqual(current);
    await expect(
      staleTab.saveWorkspace(stale, created.id),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(parseProjectFile(await contents()).workspace).toEqual(current);
    expect(await staleTab.loadWorkspace()).toEqual(stale);
  });

  it("preserves ordinary browser projects without creating a folder binding", async () => {
    const initial = workspace();
    await storage.saveWorkspaceRecovery(initial, "browser-project");
    expect(await storage.loadActiveWorkspace()).toEqual({
      projectId: "browser-project",
      workspace: initial,
    });
    expect(await storage.getProjectFolderInfo("browser-project")).toBeNull();
    expect(await readdir(temporary)).toEqual([]);
  });

  it("reports failed browser recovery instead of allowing a false saved result", async () => {
    const originalStore = memory.store;
    const mock = vi.spyOn(memory, "store").mockImplementation((name) => ({
      ...originalStore(name),
      put: async () => {
        throw new DOMException("Storage full", "QuotaExceededError");
      },
    }));
    try {
      await expect(
        storage.saveWorkspaceRecovery(workspace(), "browser-project"),
      ).rejects.toMatchObject({ code: "cache" });
    } finally {
      mock.mockRestore();
    }
    expect(await storage.listProjects()).toEqual([]);
    expect(await readdir(temporary)).toEqual([]);
  });

  it("checks pending recovery under the lock before loading a file for rename", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const recovery = structuredClone(created.workspace);
    recovery.project.name = "Pending recovery";
    const original = await contents();
    // A caller can observe clean metadata before a concurrent operation creates recovery.
    expect((await storage.getProjectFolderInfo(created.id))?.hasRecovery).toBe(
      false,
    );
    await storage.saveWorkspaceRecovery(recovery, created.id);
    await expect(
      storage.loadSavedProject(created.id, { discardRecovery: false }),
    ).rejects.toMatchObject({ code: "recovery" });
    expect((await storage.activateSavedProject(created.id)).workspace).toEqual(
      recovery,
    );
    expect(await contents()).toBe(original);
    expect((await storage.loadSavedProject(created.id)).workspace).toEqual(
      created.workspace,
    );
    expect(
      (await storage.loadSavedProject(created.id, { discardRecovery: false }))
        .workspace,
    ).toEqual(created.workspace);
  });

  it.each(["denied", "prompt"] as const)(
    "activates the cached project without requesting %s folder permission",
    async (permission) => {
      const created = await storage.createFolderProject(
        parent,
        "Study",
        workspace(),
      );
      await storage.openExampleWorkspace("heating", workspace());
      const original = await contents();
      control.permission = permission;
      expect(
        (await storage.activateSavedProject(created.id)).workspace,
      ).toEqual(created.workspace);
      expect(await storage.activeProjectId()).toBe(created.id);
      expect(control.permission).toBe(permission);
      expect(await contents()).toBe(original);
      expect(
        (await storage.getProjectFolderInfo(created.id))?.hasRecovery,
      ).toBe(false);
    },
  );

  it("activates a clean linked project from disk but rejects a changed project identity", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const external = parseProjectFile(await contents());
    external.workspace.project.name = "External update";
    await writeFile(
      join(temporary, "Study", "project.json"),
      serializeProjectFile(external),
    );
    await storage.openExampleWorkspace("heating", workspace());
    expect((await storage.activateSavedProject(created.id)).workspace).toEqual(
      external.workspace,
    );
    expect(await storage.activeProjectId()).toBe(created.id);
    await storage.openExampleWorkspace("heating", workspace());
    external.projectId = crypto.randomUUID();
    await writeFile(
      join(temporary, "Study", "project.json"),
      serializeProjectFile(external),
    );
    await expect(
      storage.activateSavedProject(created.id),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await storage.activeProjectId()).toBe("example-heating");
  });

  it("preserves copied-folder identity protection even when recovery discard is explicit", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const recovery = structuredClone(created.workspace);
    recovery.project.name = "Recovery";
    control.failWrite = true;
    await expect(
      storage.saveWorkspace(recovery, created.id),
    ).rejects.toMatchObject({ code: "write" });
    control.failWrite = false;
    await mkdir(join(temporary, "Copy"));
    await writeFile(join(temporary, "Copy", "project.json"), await contents());
    await expect(
      storage.openFolderProject(directory("Copy"), { discardRecovery: true }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await storage.activateSavedProject(created.id)).workspace).toEqual(
      recovery,
    );
    expect((await storage.getProjectFolderInfo(created.id))?.name).toBe(
      "Study",
    );
    expect((await storage.loadSavedProject(created.id)).workspace).toEqual(
      created.workspace,
    );
    expect((await storage.getProjectFolderInfo(created.id))?.hasRecovery).toBe(
      false,
    );
  });
});

describe("project documents and legacy storage", () => {
  it("accepts new project files and legacy project/workspace imports", async () => {
    const seed = workspace();
    await storage.createFolderProject(parent, "Study", seed);
    expect(storage.parseImport(await contents()).revisions).toEqual(
      seed.revisions,
    );
    expect(storage.parseImport(JSON.stringify(seed))).toEqual(seed);
    expect(storage.parseImport(JSON.stringify(seed.project))).toEqual({
      version: 1,
      project: seed.project,
      revisions: [],
    });
  });

  it.each(["invalid-json", "version", "schema", "history-graph"])(
    "rejects %s without changing the current project",
    async (reason) => {
      const created = await storage.createFolderProject(
        parent,
        "Study",
        workspace(),
      );
      const document = JSON.parse(await contents());
      if (reason === "version") document.formatVersion = 2;
      if (reason === "schema")
        document.workspace.project.units[0].params.temperature = "bad";
      if (reason === "history-graph")
        document.workspace.revisions[0].project.edges[0].target = "absent-unit";
      const invalid =
        reason === "invalid-json" ? "{ broken" : JSON.stringify(document);
      await writeFile(join(temporary, "Study", "project.json"), invalid);
      await expect(
        storage.openFolderProject(directory()),
      ).rejects.toMatchObject({ code: "invalid" });
      expect((await storage.listProjects())[0].workspace).toEqual(
        created.workspace,
      );
      expect(await contents()).toBe(invalid);
    },
  );

  it("rejects invalid revision graphs before any disk save", async () => {
    const created = await storage.createFolderProject(
      parent,
      "Study",
      workspace(),
    );
    const previous = await contents();
    const invalid = structuredClone(created.workspace);
    invalid.revisions[0].project.edges[0].target = "missing";
    await expect(storage.saveWorkspace(invalid, created.id)).rejects.toThrow();
    expect(await contents()).toBe(previous);
  });

  it("upgrades the cache by adding only the new store and preserves legacy projects/examples", async () => {
    const seed = workspace();
    const legacy = {
      id: "main",
      workspace: seed,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      starred: true,
    };
    memory.stores.set(
      "workspace",
      new Map<unknown, unknown>([
        ["current", seed],
        ["activeProject", "main"],
      ]),
    );
    memory.stores.set("projects", new Map([["main", legacy]]));
    expect(await storage.loadWorkspace()).toEqual(seed);
    expect(memory.stores.has("projectFolders")).toBe(true);
    expect(await storage.listProjects()).toEqual([legacy]);
    const example = await storage.openExampleWorkspace("heating", seed);
    expect(example.projectId).toBe("example-heating");
    const changed = structuredClone(seed);
    changed.project.name = "My saved example";
    expect(await storage.saveWorkspace(changed, example.projectId)).toEqual({
      location: "browser",
    });
    expect(
      (await storage.openExampleWorkspace("heating", seed)).workspace,
    ).toEqual(changed);
    expect(
      (await storage.listProjects()).find((project) => project.id === "main"),
    ).toEqual(legacy);
  });

  it("handles a canceled chooser without creating or listing anything", async () => {
    const chooser = vi
      .fn()
      .mockRejectedValue(new DOMException("Canceled", "AbortError"));
    vi.stubGlobal("window", {
      isSecureContext: true,
      showDirectoryPicker: chooser,
    });
    expect(storage.supportsProjectFolders()).toBe(true);
    expect(await storage.chooseProjectDirectory()).toBeNull();
    expect(chooser).toHaveBeenCalledWith({
      id: "project-cad-projects",
      mode: "readwrite",
      startIn: "documents",
    });
    expect(await storage.listProjects()).toEqual([]);
    expect(await readdir(temporary)).toEqual([]);
  });

  it("reports unsupported browsers and rejected picker access explicitly", async () => {
    vi.stubGlobal("window", { isSecureContext: true });
    expect(storage.supportsProjectFolders()).toBe(false);
    await expect(storage.chooseProjectDirectory()).rejects.toMatchObject({
      code: "unsupported",
    });
    vi.stubGlobal("window", {
      isSecureContext: true,
      showDirectoryPicker: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
    await expect(storage.chooseProjectDirectory()).rejects.toMatchObject({
      code: "permission",
    });
  });
});
