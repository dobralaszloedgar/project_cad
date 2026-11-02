// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, it } from "vitest";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { buildAssistant } from "../scripts/assistant/build.mjs";
import {
  ownedProcessTree,
  waitForProcessTreeExit,
} from "../scripts/assistant/process-tree";

const execute = promisify(execFile);

it.each([false, true])(
  "does not promote an update while an old session outlives HTTP (blocked: %s)",
  async (blocked) => {
    const temporary = await mkdtemp(
      join(tmpdir(), "project-cad-portable-update-"),
    );
    const bundle = join(temporary, "incoming"),
      installed = join(temporary, "Installed CAD ü"),
      data = join(temporary, "data");
    await buildAssistant(bundle);
    await mkdir(installed);
    await mkdir(data);
    await writeFile(
      join(installed, "manifest.json"),
      JSON.stringify({ name: "Project CAD Assistant", version: "0.1.9" }),
    );
    await writeFile(join(installed, "old-version"), "previous application");
    await writeFile(
      join(data, "settings.json"),
      JSON.stringify({ startAtLogin: false }),
    );
    await writeFile(
      join(data, "saved-history"),
      "saved conversations, projects, and sign-in",
    );
    const fixture = join(temporary, "previous.mjs");
    await writeFile(
      fixture,
      `
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv[2] === 'session') {
  setInterval(() => {}, 1000);
  process.on('disconnect', () => {});
  process.on('message', () => {
    writeFileSync(join(process.env.TEST_ROOT, 'stopping'), 'yes');
    if (process.env.TEST_BLOCKED !== '1') setTimeout(() => {
      writeFileSync(join(process.env.TEST_ROOT, 'released'), 'yes');
      process.exit(0);
    }, 3000);
  });
  process.send('ready');
} else {
  const session = spawn(process.execPath, [process.argv[1], 'session'], { stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true, detached: true });
  session.once('message', () => {
    const server = createServer((req,res) => {
      if (req.url === '/health') { res.end(JSON.stringify({ name:'Project CAD desktop', version:1 })); return; }
      if (req.headers.authorization !== 'Bearer isolated-test-token') { res.writeHead(403); res.end(); return; }
      let body=''; req.on('data', x => body += x); req.on('end', () => {
        res.end(JSON.stringify({ stopping:true }));
        if (JSON.parse(body).action === 'shutdown') session.send('stop', () => {
          server.close(() => process.exit(0)); server.closeAllConnections();
        });
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port=server.address().port;
      writeFileSync(join(process.env.PROJECT_CAD_ASSISTANT_DATA,'desktop-control.json'),JSON.stringify({port,pid:process.pid,token:'isolated-test-token'}));
      process.send({port,sessionPid:session.pid});
    });
  });
}
`,
    );
    const environment = {
      ...process.env,
      PROJECT_CAD_ASSISTANT_DATA: data,
      PROJECT_CAD_NO_DESKTOP_OPEN: "1",
      PROJECT_CAD_DISABLE_AGENT_SETUP: "1",
      PROJECT_CAD_ASSISTANT_STARTUP_NAME: `ProjectCADAssistant-Test-${crypto.randomUUID()}`,
      XDG_CONFIG_HOME: join(temporary, "config"),
      XDG_DATA_HOME: join(temporary, "share"),
      TEST_ROOT: temporary,
      TEST_BLOCKED: blocked ? "1" : "0",
    };
    const old = spawn(process.execPath, [fixture], {
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let sessionPid = 0;
    try {
      const [ready] = (await once(old, "message")) as [
        { port: number; sessionPid: number },
      ];
      sessionPid = ready.sessionPid;
      const unused = createServer();
      await new Promise<void>((resolve) =>
        unused.listen(0, "127.0.0.1", resolve),
      );
      const assistantPort = (unused.address() as { port: number }).port;
      await new Promise<void>((resolve) => unused.close(() => resolve()));
      const sessionTree = await ownedProcessTree(sessionPid);
      const install = execute(
        process.execPath,
        [
          join(bundle, "app/desktop.mjs"),
          "install",
          bundle,
          installed,
          "--no-start",
        ],
        {
          env: {
            ...environment,
            PROJECT_CAD_DESKTOP_PORT: String(ready.port),
            PROJECT_CAD_ASSISTANT_PORT: String(assistantPort),
          },
          windowsHide: true,
          timeout: 45000,
        },
      ).then(
        () => ({ error: undefined }),
        (error: Error) => ({ error }),
      );
      await expect
        .poll(
          () => readFile(join(temporary, "stopping"), "utf8").catch(() => ""),
          { timeout: 15000 },
        )
        .toBe("yes");
      await expect.poll(() => old.exitCode, { timeout: 5000 }).toBe(0);
      await pause(500);
      // HTTP has gone away; the old payload must remain until its session exits.
      expect(await readFile(join(installed, "old-version"), "utf8")).toBe(
        "previous application",
      );
      const result = await install;
      if (blocked) {
        expect(result.error?.message).toContain(
          "previous assistant session is still stopping",
        );
        expect(await readFile(join(installed, "old-version"), "utf8")).toBe(
          "previous application",
        );
        expect((await ownedProcessTree(sessionPid)).length).toBeGreaterThan(0);
        const pending = JSON.parse(
          await readFile(join(data, "desktop-stopping.json"), "utf8"),
        );
        expect(
          pending.processes.some(
            (entry: { pid: number }) => entry.pid === sessionPid,
          ),
        ).toBe(true);
        // A second installer must remember the orphan after its parent is gone.
        const retry = execute(
          process.execPath,
          [
            join(bundle, "app/desktop.mjs"),
            "install",
            bundle,
            installed,
            "--no-start",
          ],
          {
            env: {
              ...environment,
              PROJECT_CAD_DESKTOP_PORT: String(ready.port),
              PROJECT_CAD_ASSISTANT_PORT: String(assistantPort),
            },
            windowsHide: true,
            timeout: 45000,
          },
        );
        await pause(2500);
        expect(await readFile(join(installed, "old-version"), "utf8")).toBe(
          "previous application",
        );
        process.kill(sessionPid);
        await retry;
        await expect(
          readFile(join(data, "desktop-stopping.json")),
        ).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        expect(result.error).toBeUndefined();
        expect(await readFile(join(temporary, "released"), "utf8")).toBe("yes");
        await waitForProcessTreeExit(sessionTree, 1000);
        await expect(
          readFile(join(installed, "old-version")),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(
          JSON.parse(await readFile(join(installed, "manifest.json"), "utf8"))
            .version,
        ).toBe("0.1.10");
      }
      expect(await readFile(join(data, "saved-history"), "utf8")).toBe(
        "saved conversations, projects, and sign-in",
      );
      expect(
        JSON.parse(await readFile(join(data, "settings.json"), "utf8")),
      ).toEqual({ startAtLogin: false });
      expect(
        (await readdir(temporary)).filter((name) =>
          /\.install-|\.previous-/.test(name),
        ),
      ).toEqual([]);
    } finally {
      if (old.exitCode === null) old.kill();
      if (sessionPid) {
        const tree = await ownedProcessTree(sessionPid);
        try {
          process.kill(sessionPid);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        await waitForProcessTreeExit(tree);
      }
      await rm(temporary, { recursive: true, force: true });
    }
  },
  60000,
);
