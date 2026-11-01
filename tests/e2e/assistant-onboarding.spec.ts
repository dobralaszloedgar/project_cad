import { mockAssistantDownloads } from "./assistant-download-fixture";
import { test, expect } from "./test";
import {
  installAssistant,
  approveAssistant,
  pendingAssistantConnection,
} from "./assistant-fixture";

const healthUrl = "http://127.0.0.1:43118/health";
test.beforeEach(async ({ page }) => {
  await mockAssistantDownloads(page);
  await page.route("https://*.public.blob.vercel-storage.com/**", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 200 })
      : route.fallback(),
  );
  // Keep the independent folder prompt out of these assistant setup scenarios.
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      value: undefined,
      configurable: true,
    });
  });
});
const platforms = [
  {
    name: "macOS",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    filename: "macos-universal.pkg",
  },
  {
    name: "Windows",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    filename: "windows-x64-Setup.exe",
  },
  {
    name: "Linux",
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    filename: "linux-x64.run",
  },
];

for (const platform of platforms) {
  test.describe(platform.name, () => {
    test.use({ userAgent: platform.ua });
    test("chooses agents first, then shows the download for this platform", async ({
      page,
    }) => {
      await page.route(healthUrl, (request) =>
        request.fulfill({ status: 503, json: {} }),
      );
      await page.goto("/workspace");
      await page
        .getByRole("button", { name: "Open assistant", exact: true })
        .click();
      const panel = page.getByRole("dialog", {
        name: "Assistant",
        exact: true,
      });
      await expect(
        panel.getByRole("heading", { name: "Choose your agents" }),
      ).toBeVisible();
      await expect(
        panel.getByRole("link", { name: /^Download for/ }),
      ).toHaveCount(0);
      await panel.getByRole("checkbox", { name: "Codex", exact: true }).check();
      await panel
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(
        panel.getByRole("link", { name: `Download for ${platform.name}` }),
      ).toHaveAttribute(
        "href",
        new RegExp(`${platform.filename.replaceAll(".", "\\.")}$`),
      );
      await expect(
        panel.getByRole("button", { name: "Connect assistant", exact: true }),
      ).toHaveCount(0);
      await expect(
        panel.getByRole("heading", { name: "Choose your agents" }),
      ).toHaveCount(0);
      await expect(panel.locator('li[aria-current="step"]')).toHaveText(
        "2Set up",
      );
      await expect(
        panel.getByRole("group", { name: "Connection scenario" }),
      ).toHaveCount(0);
    });
  });
}

test("download, setup and automatic detection lead into a real chat", async ({
  page,
}) => {
  const cleanup = await installAssistant(page);
  let running = false;
  await page.route(healthUrl, (request) =>
    running ? request.fallback() : request.fulfill({ status: 503, json: {} }),
  );
  await page
    .context()
    .route(
      /https:\/\/(github\.com\/.*\/releases\/download|[^/]+\.public\.blob\.vercel-storage\.com)\//,
      (request) =>
        request.fulfill({
          contentType: "application/octet-stream",
          headers: {
            "Content-Disposition": 'attachment; filename="assistant-test.txt"',
          },
          body: "Test download, not an installer.",
        }),
    );
  try {
    await page.goto("/workspace");
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Assistant", exact: true });
    await panel.getByRole("checkbox", { name: "Codex", exact: true }).check();
    await panel.getByRole("button", { name: "Continue", exact: true }).click();
    const download = page.waitForEvent("download");
    await panel.getByRole("link", { name: /^Download for/ }).click();
    expect((await download).suggestedFilename()).toBe("assistant-test.txt");
    await expect(
      panel.getByRole("heading", { name: "A quick setup on your computer" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close assistant panel" }).click();
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
    await expect(
      panel.getByRole("heading", { name: "A quick setup on your computer" }),
    ).toBeVisible();
    running = true;
    await expect(
      panel.getByRole("heading", { name: "Your assistant is ready" }),
    ).toBeVisible({ timeout: 7000 });

    await panel
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();

    await expect(
      panel.getByRole("heading", { name: "Approve in Project CAD Assistant" }),
    ).toBeVisible();
    await approveAssistant(page);
    await expect(panel.getByLabel("Process prompt")).toBeVisible();
    await expect(
      panel.getByRole("region", { name: "Assistant connection" }),
    ).toHaveCount(0);
    await panel.getByLabel("Process prompt").fill("read my project");
    await panel
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(panel.getByRole("log")).toContainText("Current project:");
  } finally {
    await page.close();
    await cleanup();
  }
});

test("an installed assistant goes straight to connect and remembers the selected agents", async ({
  page,
}) => {
  const cleanup = await installAssistant(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "project-cad.assistant-agents",
      JSON.stringify({ providers: ["claude"], preferred: "claude" }),
    ),
  );
  try {
    await page.goto("/workspace");
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Assistant", exact: true });
    await expect(
      panel.getByRole("heading", { name: "Your assistant is ready" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /^Download for/ }),
    ).toHaveCount(0);
    await expect(panel.getByText("Claude Code", { exact: true })).toBeVisible();

    await panel
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();

    expect((await pendingAssistantConnection(page)).agents.providers).toEqual([
      "claude",
    ]);
    await approveAssistant(page);
    await expect(panel.getByLabel("Process prompt")).toBeVisible();
    await panel
      .getByRole("button", { name: "Assistant connection", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Manage agents", exact: true })
      .click();
    await expect(
      panel.getByRole("checkbox", { name: "Claude Code", exact: true }),
    ).toBeChecked();
    await panel
      .getByRole("button", { name: "Back to chat", exact: true })
      .click();
    await expect(panel.getByLabel("Process prompt")).toBeVisible();
    await panel
      .getByRole("button", { name: "Assistant connection", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Manage agents", exact: true })
      .click();
    await panel.getByRole("checkbox", { name: "Muse", exact: true }).check();
    await panel
      .getByLabel("Default agent", { exact: true })
      .selectOption("muse");
    await panel
      .getByRole("button", { name: "Connect agents", exact: true })
      .click();

    expect((await pendingAssistantConnection(page)).agents.preferred).toBe(
      "muse",
    );
    await approveAssistant(page);
    await expect(
      panel.getByRole("button", { name: "Choose provider and model" }),
    ).toContainText("Muse");
  } finally {
    await page.close();
    await cleanup();
  }
});

test("narrow assistant panel keeps setup controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Assistant", exact: true });
  await expect(
    panel.getByRole("heading", { name: "Choose your agents" }),
  ).toBeVisible();
  await panel
    .getByRole("checkbox", { name: "Claude Code", exact: true })
    .check();
  await panel.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    panel.getByRole("link", { name: /^Download for/ }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Check for assistant" }).click();
  await expect(
    panel.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Check again" }).click();
  const flow = panel.getByRole("region", { name: "Assistant connection" });
  expect(await flow.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
