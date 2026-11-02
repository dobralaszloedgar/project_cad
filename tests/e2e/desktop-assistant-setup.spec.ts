import { test, expect } from "@playwright/test";
import { buildAssistant } from "../../scripts/assistant/build.mjs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("Muse connector fits one screen and returns to the original project tab", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const output = join(process.cwd(), "test-results", "connector-redesign");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "project-cad-ui-"));
  const bundle = join(temporary, "bundle"),
    data = join(temporary, "data");
  await mkdir(data);
  await buildAssistant(bundle);
  async function freePort() {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    await new Promise((resolve) => server.close(resolve));
    return port;
  }
  const desktopPort = await freePort(),
    assistantPort = await freePort();
  const origin = `http://127.0.0.1:${desktopPort}`,
    endpoint = `http://127.0.0.1:${assistantPort}`;
  const child = spawn(
    process.execPath,
    [join(bundle, "app/desktop.mjs"), "serve"],
    {
      env: {
        ...process.env,
        PROJECT_CAD_ASSISTANT_DATA: data,
        PROJECT_CAD_DESKTOP_PORT: String(desktopPort),
        PROJECT_CAD_ASSISTANT_PORT: String(assistantPort),
        PROJECT_CAD_NO_DESKTOP_OPEN: "1",
        PROJECT_CAD_DISABLE_AGENT_SETUP: "1",
        PROJECT_CAD_ASSISTANT_STARTUP_NAME: `ProjectCADAssistant-Test-${desktopPort}`,
        PROJECT_CAD_APP_ORIGINS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let processLog = "",
    token = "";
  child.stdout.on("data", (chunk) => {
    processLog += chunk;
  });
  child.stderr.on("data", (chunk) => {
    processLog += chunk;
  });
  const command = async (action: string) =>
    (
      await fetch(origin + "/command", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
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
    if (!token) throw Error("Desktop did not start: " + processLog);
    const page = await browser.newPage({
      viewport: { width: 1100, height: 950 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/favicon.ico", (route) =>
      route.fulfill({ status: 204 }),
    );
    const context = page.context();
    await context.grantPermissions(["local-network-access"]);
    await context.route(origin + "/api/state", async (route) => {
      const response = await route.fetch();
      const value = await response.json();
      await route.fulfill({
        response,
        json: {
          ...value,
          providerSetup: { muse: { phase: "ready", message: "Ready" } },
        },
      });
    });
    const projectUrl = "http://127.0.0.1:3000/workspace?example=heating";
    await page.route(projectUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `
      <button id="connect">Connect Muse</button><p id="returned"></p>
      <script>
      addEventListener('message', event => { if(event.data?.type === 'project-cad-return') document.querySelector('#returned').textContent = 'Returned'; });
      document.querySelector('#connect').onclick = async () => {
        const popup = window.open('about:blank', 'muse-test-connector');
        const response = await fetch('${endpoint}/connections', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:crypto.randomUUID(),agents:{providers:['muse'],preferred:'muse'},browserWindow:true})});
        const request = await response.json();
        popup.location.href = request.windowUrl;
      };
      </script>`,
      }),
    );
    await page.goto(projectUrl);
    const opened = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Connect Muse" }).click();
    const connector = await opened;
    await connector.waitForURL(origin + "/", { timeout: 15000 }).catch(() => {
      throw Error(JSON.stringify({ url: connector.url(), errors, processLog }));
    });
    connector.on("pageerror", (error) => errors.push(error.message));
    await expect(
      connector.getByRole("heading", { name: "Connect this website?" }),
    ).toBeVisible();
    await expect(connector.locator("[data-agent-row]")).toHaveCount(1);
    await expect(connector.locator("body")).not.toContainText(
      /Codex|Claude|Your agents/,
    );
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 680, height: 620 },
      { width: 390, height: 600 },
    ]) {
      await connector.setViewportSize(viewport);
      expect(
        await connector.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        })),
      ).toEqual({ height: viewport.height, width: viewport.width });
    }
    await connector.setViewportSize({ width: 680, height: 620 });
    await connector.screenshot({ path: join(output, "muse-approval.png") });
    await connector
      .getByRole("button", { name: "Approve connection", exact: true })
      .click();
    await expect(connector.locator("#approval")).toBeHidden();
    await expect(connector.locator("[data-status=muse]")).toHaveText("Ready");
    await connector.screenshot({ path: join(output, "muse-ready.png") });
    const count = context.pages().length;
    await connector.getByRole("button", { name: "Return to project" }).click();
    await expect(page.locator("#returned")).toHaveText("Returned");
    expect(page.url()).toBe(projectUrl);
    expect(context.pages()).toHaveLength(count);
    expect(
      await connector.evaluate(() => !!window.opener && !window.opener.closed),
    ).toBe(true);
    await connector.getByText("Settings", { exact: true }).click();
    await connector.screenshot({ path: join(output, "muse-settings.png") });
    expect(errors).toEqual([]);
    await context.close();
  } finally {
    if (token) await command("shutdown").catch(() => {});
    if (child.exitCode === null)
      await new Promise((resolve) => {
        child.once("exit", () => resolve(undefined));
        setTimeout(() => {
          child.kill("SIGTERM");
          resolve(undefined);
        }, 5000).unref();
      });
    await rm(temporary, { recursive: true, force: true });
  }
});
