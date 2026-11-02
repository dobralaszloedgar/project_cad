import { afterEach, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removePreviousInstallations } from "../scripts/assistant/install-cleanup.mjs";

const directories: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(name = "Assistant") {
  const directory = await mkdtemp(
    join(tmpdir(), "project-cad-install-cleanup-"),
  );
  directories.push(directory);
  const destination = join(directory, name);
  await mkdir(destination);
  await writeFile(join(destination, "version"), "new");
  const backup = () => `${destination}.previous-${randomUUID()}`;
  return { directory, destination, backup };
}

it.each(["Assistant", "Project CAD Assistant.app"])(
  "removes old %s versions and partial backups without touching other folders",
  async (name) => {
    const { directory, destination, backup } = await fixture(name);
    const old = backup(),
      partial = backup(),
      source = backup(),
      data = backup();
    const unrelated = `${destination}.previous-my-backup`;
    const stage = `${destination}.install-${randomUUID()}`;
    const otherApp = join(directory, `Other.previous-${randomUUID()}`);
    for (const folder of [
      old,
      partial,
      source,
      data,
      unrelated,
      stage,
      otherApp,
    ]) {
      await mkdir(join(folder, "runtime"), { recursive: true });
      await writeFile(join(folder, "runtime", "keep.txt"), "saved contents");
    }
    await writeFile(
      join(old, "manifest.json"),
      JSON.stringify({ name: "Project CAD Assistant" }),
    );
    // A junction/symlink with a backup name must never be followed or removed.
    const link = backup();
    await symlink(
      unrelated,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );

    await removePreviousInstallations(destination, [
      join(source, "runtime"),
      data,
    ]);
    await expect(readdir(old)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(partial)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
    for (const folder of [source, data, unrelated, stage, otherApp, link])
      expect(await readFile(join(folder, "runtime", "keep.txt"), "utf8")).toBe(
        "saved contents",
      );
  },
);

async function lockedBackup() {
  const result = await fixture();
  const old = result.backup();
  await mkdir(old);
  const runtime = join(old, "node.exe");
  await copyFile(process.execPath, runtime);
  const child = spawn(
    runtime,
    ["-e", "setInterval(() => {}, 1000); process.stdout.write('ready');"],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  children.push(child);
  await once(child.stdout!, "data");
  return { ...result, old, child };
}

it.skipIf(process.platform !== "win32")(
  "retries cleanup while the old Windows executable is exiting",
  async () => {
    const { destination, old, child } = await lockedBackup();
    const timer = setTimeout(() => child.kill(), 600);
    try {
      await removePreviousInstallations(destination);
      await expect(readdir(old)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
    } finally {
      clearTimeout(timer);
    }
  },
);

it.skipIf(process.platform !== "win32")(
  "reports a persistent cleanup failure and keeps the new installation intact",
  async () => {
    const { destination, old } = await lockedBackup();
    await expect(removePreviousInstallations(destination)).rejects.toThrow(
      "run the installer again to finish cleanup",
    );
    expect(await readdir(old)).toContain("node.exe");
    expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
  },
  30000,
);
