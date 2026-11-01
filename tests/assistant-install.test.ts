import { expect, it } from "vitest";
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

const execute = promisify(execFile);

it.skipIf(process.platform !== "darwin").each([false, true])(
  "macOS replaces the old connector before promotion (no-start: %s)",
  async (noStart) => {
    const root = await mkdtemp(join(tmpdir(), "project-cad-install-test-"));
    const source = join(root, "new.app"),
      destination = join(root, "installed.app"),
      log = join(root, "actions");
    const env = { ...process.env, PROJECT_CAD_INSTALL_TEST_LOG: log };
    try {
      for (const [app, version] of [
        [source, "new"],
        [destination, "old"],
      ]) {
        const resources = join(app, "Contents", "Resources");
        await mkdir(join(resources, "app"), { recursive: true });
        await mkdir(join(resources, "runtime", process.arch), {
          recursive: true,
        });
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
          console.log(JSON.stringify({ running: action === 'start' || process.env.PROJECT_CAD_INSTALL_TEST_BUSY === '1' }));`,
        );
        await writeFile(
          join(app, "Contents", "MacOS", "ProjectCADAssistant"),
          '#!/bin/sh\nprintf "%s\\n" "native:$1" >> "$PROJECT_CAD_INSTALL_TEST_LOG"\n',
          { mode: 0o755 },
        );
      }
      const history = join(root, "saved-history");
      await writeFile(history, "existing conversations and sign-ins");
      const args = [
        resolve("scripts/assistant/install.mjs"),
        "--source",
        source,
        "--destination",
        destination,
        ...(noStart ? ["--no-start"] : []),
      ];
      await execute(process.execPath, args, { env });
      expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
        "new:doctor",
        "native:--quit-for-update",
        "old:stop",
        ...(!noStart ? ["new:start"] : []),
      ]);
      expect(await readFile(join(destination, "version"), "utf8")).toBe("new");
      expect(await readFile(history, "utf8")).toBe(
        "existing conversations and sign-ins",
      );
      expect(
        (await readdir(root)).some(
          (name) => name.includes(".previous-") || name.includes(".install-"),
        ),
      ).toBe(false);

      // A connector that did not stop must not be reported as an installed update.
      await writeFile(join(destination, "version"), "still-running");
      await expect(
        execute(process.execPath, args, {
          env: { ...env, PROJECT_CAD_INSTALL_TEST_BUSY: "1" },
        }),
      ).rejects.toThrow("Close the running Project CAD assistant");
      expect(await readFile(join(destination, "version"), "utf8")).toBe(
        "still-running",
      );
      expect(await readFile(history, "utf8")).toBe(
        "existing conversations and sign-ins",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
