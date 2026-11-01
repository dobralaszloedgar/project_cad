import { it, expect } from "vitest";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAssistant } from "../scripts/assistant/build.mjs";
import { assistantDownloads } from "../src/assistant/downloads";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { ConnectionRequests } from "../src/server/assistant/connections";

it("only offers real platform installers from the release manifest", () => {
  const files = [
    {
      filename: "ProjectCAD-Assistant-macos-universal.pkg",
      platform: "macos",
      bytes: 100,
    },
    {
      filename: "ProjectCAD-Assistant-windows-x64-Setup.exe",
      platform: "windows",
      bytes: 200,
    },
    {
      filename: "ProjectCAD-Assistant-windows-arm64-Setup.exe",
      platform: "windows",
      bytes: 200,
    },
    {
      filename: "ProjectCAD-Assistant-linux-arm64.run",
      platform: "linux",
      bytes: 300,
    },
    { filename: "../../foreign.exe", platform: "windows", bytes: 100 },
    {
      filename: "ProjectCAD-Assistant-linux-x64-Setup.exe",
      platform: "linux",
      bytes: 100,
    },
    {
      filename: "ProjectCAD-Assistant-linux-x64.tar.gz",
      platform: "linux",
      bytes: 100,
    },
  ];
  const release = assistantDownloads({
    name: "Project CAD Assistant",
    version: "0.1.0",
    files,
  });
  expect(release?.installers).toHaveLength(4);
  expect(release?.installers.map((file) => file.name)).toEqual([
    "macOS",
    "Windows",
    "Windows",
    "Linux",
  ]);
  expect(
    assistantDownloads({ name: "Other app", version: "0.1.0", files }),
  ).toBeUndefined();
});

it("runs the packaged desktop controller with authenticated settings and graceful worker shutdown", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "project-cad-desktop-test-"));
  const bundle = join(temporary, "bundle"),
    data = join(temporary, "data");
  async function port() {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const value = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return value;
  }
  const desktopPort = await port(),
    assistantPort = await port(),
    origin = `http://127.0.0.1:${desktopPort}`;
  await buildAssistant(bundle);
  await mkdir(data);
  const environment = {
    ...process.env,
    PROJECT_CAD_ASSISTANT_DATA: data,
    PROJECT_CAD_DESKTOP_PORT: String(desktopPort),
    PROJECT_CAD_ASSISTANT_PORT: String(assistantPort),
    XDG_CONFIG_HOME: join(temporary, "config"),
    XDG_DATA_HOME: join(temporary, "share"),
    PROJECT_CAD_NO_DESKTOP_OPEN: "1",
  };
  let child = spawn(
    process.execPath,
    [join(bundle, "app", "desktop.mjs"), "serve"],
    {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (value) => {
    logs += value;
  });
  child.stderr.on("data", (value) => {
    logs += value;
  });
  let token = "";
  const command = async (action: string) =>
    (
      await fetch(origin + "/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ action }),
      })
    ).json();
  try {
    for (let i = 0; i < 150; i++) {
      try {
        token = JSON.parse(
          await readFile(join(data, "desktop-control.json"), "utf8"),
        ).token;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    expect(token, logs).not.toBe("");
    expect((await command("status")).running).toBe(true);
    expect((await command("status")).agents).toBeNull();
    expect((await fetch(origin + "/api/state")).status).toBe(403);
    expect(
      (
        await fetch(origin + "/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"action":"stop"}',
        })
      ).status,
    ).toBe(403);
    const ticket = await command("ticket");
    const landing = await fetch(ticket.url, { redirect: "manual" });
    expect(landing.status).toBe(303);
    const cookie = landing.headers.get("set-cookie")!.split(";")[0];
    expect((await fetch(ticket.url, { redirect: "manual" })).status).toBe(403);
    const page = await fetch(origin, { headers: { Cookie: cookie } });
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await page.text()).toContain("Your local assistant");
    // A fresh installation listens for consent, but cannot launch any provider.
    const endpoint = `http://127.0.0.1:${assistantPort}`;
    const consent = await (
      await fetch(
        endpoint +
          "/connect?" +
          new URLSearchParams({
            origin: "https://projectcad.vercel.app",
            nonce: crypto.randomUUID(),
            providers: "muse",
            preferred: "muse",
          }),
      )
    ).text();
    expect((await command("status")).agents).toBeNull();
    const csrf = consent.match(/name="csrf" value="([a-f0-9]+)"/)![1];
    expect(
      (
        await fetch(endpoint + "/connect", {
          method: "POST",
          headers: {
            Origin: endpoint,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `csrf=${csrf}`,
        })
      ).status,
    ).toBe(200);
    expect((await command("status")).agents).toEqual({
      providers: ["muse"],
      preferred: "muse",
    });
    const unselected = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Project-CAD-Desktop": "1",
      },
      body: JSON.stringify({ action: "signin", provider: "codex" }),
    });
    expect(unselected.status).toBe(400);
    expect(await unselected.text()).toContain("Choose this agent");
    const save = (requestOrigin: string) =>
      fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: requestOrigin,
          "Content-Type": "application/json",
          "X-Project-CAD-Desktop": "1",
        },
        body: JSON.stringify({
          action: "settings",
          websiteUrl: "https://project.example",
          startAtLogin: false,
          museApiKey: "test-key-never-returned",
        }),
      });
    expect((await save("https://foreign.example")).status).toBe(403);
    const result = await save(origin);
    expect(result.status, await result.text()).toBe(200);
    const state = await (
      await fetch(origin + "/api/state", { headers: { Cookie: cookie } })
    ).text();
    expect(state).not.toContain("test-key-never-returned");
    expect(JSON.parse(state).museConfigured).toBe(true);
    expect(JSON.parse(state).agents).toEqual({
      providers: ["muse"],
      preferred: "muse",
    });
    expect(
      JSON.parse(await readFile(join(data, "settings.json"), "utf8"))
        .museApiKey,
    ).toBe("test-key-never-returned");
    if (process.platform !== "win32")
      expect((await stat(join(data, "settings.json"))).mode & 0o777).toBe(
        0o600,
      );
    expect((await command("stop")).running).toBe(false);
    const started = await Promise.all([command("start"), command("start")]);
    expect(started.every((value) => value.running)).toBe(true);
    expect(
      await readFile(join(data, "logs", "assistant.log"), "utf8"),
    ).not.toContain("EADDRINUSE");

    // An actual installer run must retire both the desktop session and worker,
    // even when the installer asks not to start the replacement yet.
    const connectionOrigin = "https://project.example";
    const request = await (
      await fetch(endpoint + "/connections", {
        method: "POST",
        headers: {
          Origin: connectionOrigin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nonce: crypto.randomUUID(),
          agents: { providers: ["muse"], preferred: "muse" },
        }),
      })
    ).json();
    new ConnectionRequests(data).decide(request.id, true);
    const connection = await (
      await fetch(endpoint + "/connections/" + request.id, {
        headers: { Origin: connectionOrigin },
      })
    ).json();
    expect(connection.token).toBeTruthy();
    const history = new DatabaseSync(join(data, "conversations.sqlite"));
    const savedChat = JSON.stringify({
      id: "upgrade-history",
      runs: [],
      title: "Keep this conversation",
    });
    history
      .prepare("INSERT INTO conversations VALUES (?, ?, ?, ?, ?)")
      .run(
        "upgrade-history",
        connectionOrigin,
        "project",
        new Date().toISOString(),
        savedChat,
      );
    history.close();
    const settingsBefore = await readFile(join(data, "settings.json"), "utf8");
    const installed = join(temporary, "installed");
    await mkdir(join(bundle, "runtime"));
    const bundledRuntime = join(
      bundle,
      "runtime",
      process.platform === "win32" ? "node.exe" : "node",
    );
    // Windows symlinks require privileges that ordinary test runs may not have.
    if (process.platform === "win32")
      await copyFile(process.execPath, bundledRuntime);
    else await symlink(process.execPath, bundledRuntime);
    await promisify(execFile)(
      process.execPath,
      [
        join(bundle, "app", "desktop.mjs"),
        "install",
        bundle,
        installed,
        "--no-start",
      ],
      { env: environment, timeout: 30000 },
    );
    await expect.poll(() => child.exitCode).toBe(0);
    expect(
      await fetch(endpoint + "/health").then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    await expect(stat(join(data, "desktop-control.json"))).rejects.toThrow();
    expect(await readFile(join(data, "settings.json"), "utf8")).toBe(
      settingsBefore,
    );

    const orphan = spawn(
      process.execPath,
      [join(installed, "app", "assistant.mjs")],
      { env: environment, stdio: "ignore" },
    );
    try {
      await expect
        .poll(() =>
          fetch(endpoint + "/health").then(
            (response) => response.ok,
            () => false,
          ),
        )
        .toBe(true);
      await expect(
        promisify(execFile)(
          process.execPath,
          [
            join(bundle, "app", "desktop.mjs"),
            "install",
            bundle,
            installed,
            "--no-start",
          ],
          { env: environment, timeout: 30000 },
        ),
      ).rejects.toThrow("previous session is still active");
      expect(await readFile(join(data, "settings.json"), "utf8")).toBe(
        settingsBefore,
      );
    } finally {
      const exited = new Promise<void>((resolve) =>
        orphan.once("exit", () => resolve()),
      );
      orphan.kill();
      await exited;
    }

    child = spawn(
      process.execPath,
      [join(installed, "app", "desktop.mjs"), "serve"],
      { env: environment, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    const oldToken = token;
    await expect
      .poll(
        async () => {
          try {
            token = JSON.parse(
              await readFile(join(data, "desktop-control.json"), "utf8"),
            ).token;
            return token !== oldToken;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
    expect((await command("status")).running).toBe(true);
    expect(
      (
        await fetch(endpoint + "/connections/" + request.id, {
          headers: { Origin: connectionOrigin },
        })
      ).status,
    ).toBe(404);
    expect(
      (await fetch(origin + "/api/state", { headers: { Cookie: cookie } }))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint + "/providers", {
          headers: {
            Origin: connectionOrigin,
            Authorization: "Bearer " + connection.token,
            "x-project-cad-client": crypto.randomUUID(),
          },
        })
      ).status,
    ).toBe(401);
    const preserved = new DatabaseSync(join(data, "conversations.sqlite"));
    expect(
      preserved
        .prepare("SELECT data FROM conversations WHERE id=?")
        .get("upgrade-history")?.data,
    ).toBe(savedChat);
    preserved.close();
  } finally {
    if (token) await command("shutdown").catch(() => {});
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 10000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await rm(temporary, { recursive: true, force: true });
  }
}, 60000);
