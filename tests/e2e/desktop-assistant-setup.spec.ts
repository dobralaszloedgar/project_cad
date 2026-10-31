import { test, expect } from "@playwright/test";
import { buildAssistant } from "../../scripts/assistant/build.mjs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("desktop agent setup persists choices and completes real browser consent", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const output = "/tmp/project-cad-connector-qa";
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
    await page.goto((await command("ticket")).url);
    await expect(page).toHaveTitle("Project CAD Assistant");
    await expect(
      page.getByRole("heading", { name: "Choose your agents" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeDisabled();
    await page.locator("#agent-choices input[value=claude]").check();
    await page.locator("#agent-choices input[value=muse]").check();
    await page.getByLabel("Default agent").selectOption("claude");
    await page.screenshot({
      path: join(output, "01-agent-selection.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Set up your agents" }),
    ).toBeVisible();
    await expect(page.locator("[data-agent-row=codex]")).toBeHidden();
    await expect(page.locator("[data-agent-row=claude]")).toBeVisible();
    await expect(page.locator("[data-agent-row=muse]")).toBeVisible();
    await expect(page.locator("#state")).toHaveText("Running on this computer");
    expect((await command("status")).agents).toEqual({
      providers: ["claude", "muse"],
      preferred: "claude",
    });
    await page.screenshot({
      path: join(output, "02-selected-agent-setup.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Configure", exact: true }).click();
    await page
      .getByLabel("Muse API key", { exact: true })
      .fill("ui-fixture-key");
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.locator("#key")).toHaveValue("");
    await expect(page.locator("#muse-status")).toContainText(
      "API key configured",
    );
    expect((await command("status")).agents.preferred).toBe("claude");
    await page.getByRole("button", { name: "Continue to connection" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Connect to Project CAD",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: join(output, "03-ready-to-connect.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Manage agents", exact: true })
      .click();
    await page.locator("#agent-choices input[value=claude]").uncheck();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Set up your agents" }),
    ).toBeVisible();
    expect((await command("status")).agents).toEqual({
      providers: ["muse"],
      preferred: "muse",
    });
    await page.reload();
    await expect(page.locator("[data-agent-row=claude]")).toBeHidden();
    await expect(page.locator("[data-agent-row=muse]")).toBeVisible();
    // Exercise real local approval for the exact hosted website, without visiting it or signing in.
    const approval = await browser.newPage({
      viewport: { width: 680, height: 650 },
    });
    await approval.route("**/favicon.ico", (route) =>
      route.fulfill({ status: 204 }),
    );
    const response = await approval.goto(
      endpoint +
        "/connect?" +
        new URLSearchParams({
          origin: "https://projectcad.vercel.app",
          nonce: crypto.randomUUID(),
          providers: "claude,muse",
          preferred: "claude",
        }),
    );
    expect(response!.status()).toBe(200);
    await expect(
      approval.getByRole("heading", { name: "Connect your agents" }),
    ).toBeVisible();
    await approval
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();
    await expect(
      approval.getByRole("heading", { name: "Connected", exact: true }),
    ).toBeVisible();
    expect(
      JSON.parse(await readFile(join(data, "settings.json"), "utf8")).agents,
    ).toEqual({ providers: ["claude", "muse"], preferred: "claude" });
    const rejected = await approval.goto(
      endpoint +
        "/connect?" +
        new URLSearchParams({
          origin: "https://unconfigured.example",
          nonce: crypto.randomUUID(),
          providers: "muse",
          preferred: "muse",
        }),
    );
    expect(rejected!.status()).toBe(403);
    await expect(
      approval.getByRole("heading", {
        name: "Enable this Project CAD website",
      }),
    ).toBeVisible();
    await approval.screenshot({
      path: join(output, "04-origin-recovery.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    const result = {
      passed: true,
      url: origin,
      viewport: "1100×950",
      pageIdentity: true,
      meaningfulContent: true,
      consoleErrors: errors,
      interactions: [
        "empty selection blocked",
        "multiple agents and default",
        "only selected setup rows",
        "private key saved without echo",
        "manage agents",
        "reload persistence",
        "hosted-origin approval",
        "unsupported-origin recovery",
      ],
      screenshots: 4,
    };
    await writeFile(
      join(output, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
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
