import { test, expect } from "@playwright/test";
import { buildAssistant } from "../../scripts/assistant/build.mjs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("desktop receives website choices after consent without a second agent picker", async ({
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
    await page.goto((await command("ticket")).url);
    await expect(page).toHaveTitle("Project CAD Assistant");
    await expect(
      page.getByText("Start from your project", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Codex", exact: true }),
    ).toHaveCount(0);
    expect((await command("status")).running).toBe(true);
    expect((await command("status")).agents).toBeNull();
    await page.screenshot({
      path: join(output, "01-waiting-for-website.png"),
      fullPage: true,
    });
    const website = "https://projectcad.vercel.app";
    const select = async (providers: string[], preferred: string) => {
      const response = await fetch(endpoint + "/connections", {
        method: "POST",
        headers: { Origin: website, "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: crypto.randomUUID(),
          agents: { providers, preferred },
        }),
      });
      expect(response.status).toBe(202);
      const value = await response.json();
      await expect(
        page.getByRole("heading", { name: "Connect this website?" }),
      ).toBeVisible();
      await expect(page.locator("#request-origin")).toHaveText(website);
      return value.id as string;
    };
    const approve = async (id: string) => {
      await page
        .getByRole("button", { name: "Approve connection", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await (
                await fetch(`${endpoint}/connections/${id}`, {
                  headers: { Origin: website },
                })
              ).json()
            ).status,
        )
        .toBe("connected");
    };
    const first = await select(["claude", "muse"], "claude");
    expect((await command("status")).agents).toBeNull();
    await page.screenshot({
      path: join(output, "desktop-approval.png"),
      fullPage: true,
    });
    await approve(first);
    await expect(
      page.getByRole("heading", { name: "Your agents", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-agent-row=codex]")).toBeHidden();
    await expect(page.locator("[data-agent-row=claude]")).toBeVisible();
    await expect(page.locator("[data-agent-row=muse]")).toBeVisible();
    expect((await command("status")).agents).toEqual({
      providers: ["claude", "muse"],
      preferred: "claude",
    });
    await page.screenshot({
      path: join(output, "02-synced-agent-setup.png"),
      fullPage: true,
    });
    await expect(page.getByLabel("Muse API key")).toHaveCount(0);
    await page.getByText("Connection settings", { exact: true }).click();
    await page.getByLabel("Start the connector when I log in").uncheck();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.locator("#settings")).not.toHaveAttribute("open");
    expect((await command("status")).agents.preferred).toBe("claude");
    const changed = await select(["muse"], "muse");
    // Requesting approval does not change the saved selection.
    expect((await command("status")).agents.preferred).toBe("claude");
    await approve(changed);
    await expect(page.locator("[data-agent-row=claude]")).toBeHidden();
    await expect(page.locator("[data-agent-row=muse]")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your agents", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-agent-row=claude]")).toBeHidden();
    expect(
      JSON.parse(await readFile(join(data, "settings.json"), "utf8")).agents,
    ).toEqual({ providers: ["muse"], preferred: "muse" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(output, "03-synced-agents-mobile.png"),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: join(output, "04-dark-mobile.png"),
      fullPage: true,
    });
    const declined = await select(["codex"], "codex");
    await page.getByRole("button", { name: "Decline", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await fetch(`${endpoint}/connections/${declined}`, {
                headers: { Origin: website },
              })
            ).json()
          ).status,
      )
      .toBe("denied");
    expect((await command("status")).agents).toEqual({
      providers: ["muse"],
      preferred: "muse",
    });
    const rejected = await fetch(endpoint + "/connections", {
      method: "POST",
      headers: {
        Origin: "https://unconfigured.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nonce: crypto.randomUUID(),
        agents: { providers: ["muse"], preferred: "muse" },
      }),
    });
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).error).toContain("Enable this website");
    expect(errors).toEqual([]);
    const result = {
      passed: true,
      url: origin,
      viewport: "1100×950",
      pageIdentity: true,
      meaningfulContent: true,
      consoleErrors: errors,
      interactions: [
        "fresh desktop listens without selecting or starting providers",
        "website choices applied only after consent",
        "only selected setup rows",
        "sign-in replaces the obsolete API key form",
        "website changes sync without a second picker",
        "reload persistence",
        "hosted-origin approval",
        "unsupported-origin rejection",
        "decline preserves existing choices",
        "approval inside the existing connector window",
      ],
      screenshots: 4,
    };
    await writeFile(
      join(output, "desktop-results.json"),
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
