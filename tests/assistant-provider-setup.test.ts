import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const fake = vi.hoisted(() => ({
  installed: true,
  available: true,
  installs: vi.fn(),
  version: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    fake.version();
    (args.at(-1) as (err: null, result: string) => void)(null, "muse 1.4.14");
  },
}));
vi.mock("../src/server/assistant/config", () => ({
  providerExecutable: () => (fake.installed ? "/test/agent" : undefined),
}));
vi.mock("../src/server/assistant/install-provider", () => ({
  installProvider: async () => {
    fake.installs();
    return { path: "/test/agent", installed: !fake.installed };
  },
}));
vi.mock("../src/server/assistant/providers/codex", () => ({
  CodexProvider: class {
    async status() {
      return { available: fake.available };
    }
  },
}));
vi.mock("../src/server/assistant/providers/claude", () => ({
  ClaudeProvider: class {
    async status() {
      return { available: fake.available };
    }
  },
}));
vi.mock("../src/server/assistant/providers/muse", () => ({
  MuseProvider: class {
    async status() {
      return { available: fake.available };
    }
  },
}));
import { ProviderSetup } from "../src/server/assistant/provider-setup";
import { installMuse, museTarget } from "../src/server/assistant/install-muse";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fake.installed = true;
  fake.available = true;
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
it.each(["codex", "muse"] as const)(
  "installs missing %s, opens sign-in once, and detects completed login",
  async (id) => {
    fake.installed = false;
    fake.available = false;
    const login = vi.fn(async () => {});
    const setup = new ProviderSetup("/root", "/resources", login);
    setup.ensure([id]);
    setup.ensure([id]);
    await vi.waitFor(() => expect(setup.states[id]?.phase).toBe("signing-in"));
    expect(fake.installs).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledExactlyOnceWith(id, "/test/agent");
    await setup.refresh();
    expect(login).toHaveBeenCalledTimes(1);
    fake.available = true;
    await setup.refresh();
    expect(setup.states[id]?.phase).toBe("ready");
  },
);
it.each(["codex", "muse"] as const)(
  "reuses %s authentication without opening login",
  async (id) => {
    const login = vi.fn(async () => {});
    const setup = new ProviderSetup("/root", "/resources", login);
    await setup.prepare(id);
    expect(setup.states[id]?.phase).toBe("ready");
    expect(login).not.toHaveBeenCalled();
  },
);
it("reports login launch failures and permits an explicit retry", async () => {
  fake.available = false;
  const login = vi
    .fn()
    .mockRejectedValueOnce(Error("No terminal"))
    .mockResolvedValue(undefined);
  const setup = new ProviderSetup("/root", "/resources", login);
  await setup.prepare("muse");
  expect(setup.states.muse).toEqual({ phase: "error", message: "No terminal" });
  await setup.prepare("muse");
  expect(setup.states.muse?.phase).toBe("signing-in");
});
it.each([
  ["win32", "x64", "x86_windows"],
  ["win32", "arm64", "aarch64_windows"],
  ["darwin", "x64", "x86_macos"],
  ["darwin", "arm64", "aarch64_macos"],
  ["linux", "x64", "x86_linux"],
  ["linux", "arm64", "aarch64_linux"],
])("selects the official Muse package for %s %s", (os, arch, target) => {
  expect(museTarget(os, arch)).toBe(target);
});
it.each([false, true])(
  "verifies Muse download bytes before activation (corrupt: %s)",
  async (corrupt) => {
    const root = await mkdtemp(join(tmpdir(), "pcad-muse-install-"));
    roots.push(root);
    const bytes = Buffer.from("test executable fixture");
    const artifact =
      "https://lookaside.facebook.com/lookaside/muse/download/?file=muse";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("channels")
          ? Response.json({
              version: "1.4.14-R1",
              manifest_url: artifact + "-manifest",
            })
          : url.endsWith("-manifest")
            ? Response.json({
                version: "1.4.14-R1",
                checksum_algorithm: "sha256",
                artifacts: {
                  [museTarget(process.platform, process.arch)]: {
                    url: artifact,
                    size: bytes.length,
                    checksum: corrupt
                      ? "0".repeat(64)
                      : createHash("sha256").update(bytes).digest("hex"),
                  },
                },
              })
            : new Response(bytes),
      ),
    );
    if (corrupt) {
      await expect(installMuse(root)).rejects.toThrow("checksum");
      expect(fake.version).not.toHaveBeenCalled();
      expect(await readdir(join(root, "providers", "muse"))).toEqual([]);
    } else {
      const result = await installMuse(root);
      expect(await readFile(result.path)).toEqual(bytes);
      expect(fake.version).toHaveBeenCalledOnce();
      const pointer = JSON.parse(
        await readFile(
          join(root, "providers", "muse", "installation.json"),
          "utf8",
        ),
      );
      expect(result.path).toBe(
        join(root, "providers", "muse", pointer.executable),
      );
    }
  },
);
