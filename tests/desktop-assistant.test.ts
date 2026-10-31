import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAssistant } from "../scripts/assistant/build.mjs";
import { assistantDownloads } from "../src/assistant/downloads";

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
  const child = spawn(
    process.execPath,
    [join(bundle, "app", "desktop.mjs"), "serve"],
    {
      env: {
        ...process.env,
        PROJECT_CAD_ASSISTANT_DATA: data,
        PROJECT_CAD_DESKTOP_PORT: String(desktopPort),
        PROJECT_CAD_ASSISTANT_PORT: String(assistantPort),
        XDG_CONFIG_HOME: join(temporary, "config"),
        XDG_DATA_HOME: join(temporary, "share"),
        PROJECT_CAD_NO_DESKTOP_OPEN: "1",
      },
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
    expect((await command("status")).running).toBe(false);
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
    const choose = (agents: unknown) =>
      fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
          "X-Project-CAD-Desktop": "1",
        },
        body: JSON.stringify({ action: "agents", agents }),
      });
    expect((await choose({ providers: [], preferred: "codex" })).status).toBe(
      400,
    );
    expect(
      (await choose({ providers: ["muse"], preferred: "muse" })).status,
    ).toBe(200);
    expect((await command("status")).running).toBe(true);
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
