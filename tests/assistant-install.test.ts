// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(existing = true) {
  const root = await mkdtemp(join(tmpdir(), "project-cad-install-test-"));
  directories.push(root);
  const source = join(root, "new.app"),
    destination = join(root, "installed.app"),
    log = join(root, "actions"),
    history = join(root, "saved-history");
  for (const [app, version] of [
    [source, "new"],
    ...(existing ? [[destination, "old"]] : []),
  ]) {
    const resources = join(app, "Contents", "Resources");
    await mkdir(join(resources, "app"), { recursive: true });
    await mkdir(join(resources, "runtime", process.arch), { recursive: true });
    await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
    await symlink(
      process.execPath,
      join(resources, "runtime", process.arch, "node"),
    );
    await writeFile(join(app, "version"), version);
    await writeFile(
      join(resources, "app", "control.mjs"),
      `import { appendFileSync } from 'node:fs';
      const action = process.argv[2];
      appendFileSync(process.env.PROJECT_CAD_INSTALL_TEST_LOG, '${version}:' + action + '\\n');
      if ('${version}' === 'old' && action === 'stop') throw new Error('Outdated stop must not be used');
      if (action === 'stop' && process.env.PROJECT_CAD_INSTALL_TEST_STOP_ERROR) throw new Error('Previous session is still stopping');
      console.log(action === 'stop' && process.env.PROJECT_CAD_INSTALL_TEST_STATE || JSON.stringify({ running: action === 'start', managed: action === 'start' }));`,
    );
    await writeFile(
      join(app, "Contents", "MacOS", "ProjectCADAssistant"),
      '#!/bin/sh\nprintf "%s\\n" "native:$1" >> "$PROJECT_CAD_INSTALL_TEST_LOG"\nif [ "$PROJECT_CAD_INSTALL_TEST_NATIVE_BUSY" = "1" ]; then echo "Close Project CAD Assistant before updating." >&2; exit 1; fi\n',
      { mode: 0o755 },
    );
  }
  await writeFile(history, "existing conversations and sign-ins");
  const env = { ...process.env, PROJECT_CAD_INSTALL_TEST_LOG: log };
  const install = (noStart: boolean, extra: Partial<NodeJS.ProcessEnv> = {}) =>
    execute(
      process.execPath,
      [
        resolve("scripts/assistant/install.mjs"),
        "--source",
        source,
        "--destination",
        destination,
        ...(noStart ? ["--no-start"] : []),
      ],
      { env: { ...env, ...extra } },
    );
  return { root, destination, log, history, install };
}

it.skipIf(process.platform !== "darwin").each([false, true])(
  "macOS replaces the old connector before promotion (no-start: %s)",
  async (noStart) => {
    const { root, destination, log, history, install } = await fixture();
    await writeFile(join(destination, "obsolete-file"), "old version only");
    const staleBackup = `${destination}.previous-${randomUUID()}`;
    await mkdir(staleBackup);
    await writeFile(join(staleBackup, "old-runtime"), "partial old version");
    await install(noStart);
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
      "new:doctor",
      "native:--quit-for-update",
      "new:stop",
      ...(!noStart ? ["new:start"] : []),
    ]);
    expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
    await expect(
      readFile(join(destination, "obsolete-file")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(history, "utf8")).toBe(
      "existing conversations and sign-ins",
    );
    expect(
      (await readdir(root)).some(
        (name) => name.includes(".previous-") || name.includes(".install-"),
      ),
    ).toBe(false);
  },
);

it
  .skipIf(process.platform !== "darwin")
  .each([
    { running: true, managed: false },
    { running: false, managed: true },
    { running: false },
  ])(
  "does not replace an installation until complete shutdown: %j",
  async (state) => {
    const { root, destination, history, install } = await fixture();
    await expect(
      install(true, { PROJECT_CAD_INSTALL_TEST_STATE: JSON.stringify(state) }),
    ).rejects.toThrow("Close the running Project CAD assistant");
    expect(await readFile(join(destination, "version"), "utf8")).toBe("old");
    expect(await readFile(history, "utf8")).toBe(
      "existing conversations and sign-ins",
    );
    expect(
      (await readdir(root)).some((name) => /\.(previous|install)-/.test(name)),
    ).toBe(false);
  },
);

it.skipIf(process.platform !== "darwin").each([
  [
    "PROJECT_CAD_INSTALL_TEST_NATIVE_BUSY",
    "Close Project CAD Assistant before updating",
  ],
  ["PROJECT_CAD_INSTALL_TEST_STOP_ERROR", "Previous session is still stopping"],
])("keeps the installation when shutdown fails: %s", async (key, message) => {
  const { destination, history, log, install } = await fixture();
  await expect(install(false, { [key]: "1" })).rejects.toThrow(message);
  expect(await readFile(join(destination, "version"), "utf8")).toBe("old");
  expect(await readFile(history, "utf8")).toBe(
    "existing conversations and sign-ins",
  );
  expect(await readFile(log, "utf8")).not.toContain("new:start");
});

it.skipIf(process.platform !== "darwin")(
  "stops leftover services even when the old bundle is missing",
  async () => {
    const { destination, log, install } = await fixture(false);
    await expect(
      install(true, {
        PROJECT_CAD_INSTALL_TEST_STATE: JSON.stringify({
          running: false,
          managed: true,
        }),
      }),
    ).rejects.toThrow("Close the running Project CAD assistant");
    await expect(readFile(join(destination, "version"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await writeFile(log, "");
    await install(true);
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
      "new:doctor",
      "native:--quit-for-update",
      "new:stop",
    ]);
    expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
  },
);
