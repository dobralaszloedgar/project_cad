import { test, expect } from "@playwright/test";
import { installAssistant, approveAssistant } from "./assistant-fixture";
import {
  downloads,
  mockAssistantDownloads,
} from "./assistant-download-fixture";

const healthUrl = "http://127.0.0.1:43118/health";
const route = "/sandbox/assistant";
const readyHealth = {
  name: "Project CAD assistant",
  version: 1,
  capabilities: ["desktop-consent-v1"],
};

// These cases cover the connection stages for a returning user. Fresh agent
// selection is exercised in assistant-agent-selection.spec.ts.
test.beforeEach(async ({ page }) => {
  await mockAssistantDownloads(page);
  await page.route("https://*.public.blob.vercel-storage.com/**", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 200 })
      : route.fallback(),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "project-cad.assistant-agents",
      JSON.stringify({ providers: ["codex"], preferred: "codex" }),
    );
  });
});

test("a blocked installer stays on downloads and retry recovers saved choices", async ({
  page,
}) => {
  let blocked = true;
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: { error: "Not running" } }),
  );
  await page.route("https://*.public.blob.vercel-storage.com/**", (request) =>
    request.fulfill({
      status: blocked ? 403 : 200,
      body: blocked ? "Your store is blocked" : "",
    }),
  );
  await page.goto(route);
  const notice = page
    .getByRole("region", { name: "Assistant connection", exact: true })
    .getByRole("alert");
  await expect(notice).toContainText(
    "Installer downloads are temporarily unavailable",
  );
  await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toHaveCount(0);
  blocked = false;
  await page
    .getByRole("button", { name: "Retry downloads", exact: true })
    .click();
  await expect(page.getByRole("link", { name: /^Download for/ })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose your agents" }),
  ).toHaveCount(0);
  blocked = true;
  await page.getByText("Other platforms", { exact: true }).click();
  await page
    .getByLabel("Choose your installer")
    .selectOption("ProjectCAD-Assistant-windows-arm64-Setup.exe");
  await expect(notice).toBeVisible();
  blocked = false;
  await page
    .getByRole("button", { name: "Retry downloads", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /^Download for/ }),
  ).toHaveAttribute("href", /ProjectCAD-Assistant-windows-arm64-Setup\.exe$/);
});

test("downloads directly from Vercel Blob and exposes public checksums", async ({
  page,
}) => {
  const base =
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.4";
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: { error: "Not running" } }),
  );
  await page.route("**/downloads/assistant/downloads.json", (request) =>
    request.fulfill({
      json: {
        ...downloads,
        version: "0.1.4",
        release: undefined,
        distribution: { provider: "vercel-blob", baseUrl: base },
      },
    }),
  );
  await page.context().route(`${base}/ProjectCAD-Assistant-*`, (request) =>
    request.fulfill({
      contentType: "application/octet-stream",
      headers: {
        "Content-Disposition":
          'attachment; filename="assistant-test-installer.txt"',
      },
      body: "Browser test download. This is not an installer.",
    }),
  );
  await page.goto(route);
  const download = page.getByRole("link", { name: /^Download for/ });
  await expect(download).toHaveAttribute(
    "href",
    `${base}/ProjectCAD-Assistant-macos-universal.pkg`,
  );
  await page.getByText("Other platforms", { exact: true }).click();
  await expect(page.locator("#assistant-installer option")).toHaveCount(5);
  await expect(
    page.getByRole("link", { name: "Download checksums" }),
  ).toHaveAttribute("href", `${base}/SHA256SUMS.txt`);
  await page
    .getByLabel("Choose your installer")
    .selectOption("ProjectCAD-Assistant-windows-arm64-Setup.exe");
  await expect(download).toHaveAttribute(
    "href",
    `${base}/ProjectCAD-Assistant-windows-arm64-Setup.exe`,
  );
  const downloaded = page.waitForEvent("download");
  await download.click();
  expect((await downloaded).suggestedFilename()).toBe(
    "assistant-test-installer.txt",
  );
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
});

test("a GitHub download leads to setup and detects the newly opened app", async ({
  page,
}) => {
  let ready = false;
  await page.route(healthUrl, (request) =>
    request.fulfill({
      status: ready ? 200 : 503,
      json: ready ? readyHealth : { error: "Not running" },
    }),
  );
  await page.route("**/downloads/assistant/downloads.json", (request) =>
    request.fulfill({
      json: {
        ...downloads,
        distribution: undefined,
        release: {
          repository: "dobralaszloedgar/project_cad",
          tag: `v${downloads.version}`,
        },
      },
    }),
  );
  // Exercise the real download link without downloading or installing a binary.
  await page
    .context()
    .route("https://github.com/**/releases/download/**", (request) =>
      request.fulfill({
        contentType: "application/octet-stream",
        headers: {
          "Content-Disposition":
            'attachment; filename="assistant-test-installer.txt"',
        },
        body: "Browser test download. This is not an installer.",
      }),
    );
  await page.goto(route);
  const download = page.getByRole("link", { name: /^Download for/ });
  await expect(download).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toHaveCount(0);
  await expect(download).toHaveAttribute(
    "href",
    new RegExp(
      `github\\.com/dobralaszloedgar/project_cad/releases/download/v${downloads.version.replaceAll(".", "\\.")}/`,
    ),
  );
  const downloaded = page.waitForEvent("download");
  await download.click();
  expect((await downloaded).suggestedFilename()).toBe(
    "assistant-test-installer.txt",
  );
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Looking for your assistant…", { exact: true }),
  ).toBeVisible();
  ready = true;
  // The polling loop, without another button click, advances the flow.
  await expect(
    page.getByRole("heading", { name: "Your assistant is ready" }),
  ).toBeVisible({ timeout: 7000 });
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('li[aria-current="step"]')).toHaveText("3Connect");
  ready = false;
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible({ timeout: 7000 });
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toHaveCount(0);
  await page.getByText("Assistant not appearing?", { exact: true }).click();
  await page.getByRole("button", { name: "Back to downloads" }).click();
  await expect(download).toBeVisible();
});

test("an existing assistant skips installation and completes real approval", async ({
  page,
}) => {
  const cleanup = await installAssistant(page);
  try {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Your assistant is ready" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(
      0,
    );

    await page
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();

    await expect(
      page.getByRole("heading", { name: "Approve in Project CAD Assistant" }),
    ).toBeVisible();
    await approveAssistant(page);
    await expect(
      page.getByRole("heading", { name: "You’re all connected" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to workspace" }),
    ).toHaveAttribute("href", "/workspace");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "You’re all connected" }),
    ).toBeVisible();
  } finally {
    await page.close();
    await cleanup();
  }
});

test("connection works with popups blocked and never opens another page", async ({
  page,
}) => {
  const cleanup = await installAssistant(page);
  try {
    await page.addInitScript(() => {
      window.open = () => {
        throw new Error("Unexpected browser popup");
      };
    });
    await page.goto(route);
    const pagesBefore = page.context().pages().length;
    await page
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();
    await expect(
      page.getByText("Waiting for your approval", { exact: true }),
    ).toBeVisible();
    await approveAssistant(page);
    await expect(
      page.getByRole("heading", { name: "You’re all connected" }),
    ).toBeVisible();
    expect(page.context().pages()).toHaveLength(pagesBefore);
  } finally {
    await page.close();
    await cleanup();
  }
});

test("unavailable installers can be retried and other platforms can be selected", async ({
  page,
}) => {
  let unavailable = true;
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/downloads/assistant/downloads.json", (request) =>
    unavailable
      ? request.fulfill({ status: 503, json: {} })
      : request.fulfill({ json: downloads }),
  );
  await page.goto(route);
  await expect(
    page
      .getByRole("region", { name: "Assistant connection" })
      .getByRole("alert"),
  ).toContainText("We couldn’t load the installers");
  unavailable = false;
  await page.getByRole("button", { name: "Retry downloads" }).click();
  await expect(page.getByRole("link", { name: /^Download for/ })).toBeVisible();
  await page.getByText("Other platforms", { exact: true }).click();
  await page
    .getByLabel("Choose your installer")
    .selectOption("ProjectCAD-Assistant-windows-arm64-Setup.exe");
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveAttribute("href", /windows-arm64-Setup\.exe$/);
  await expect(page.getByText(/ARM64 · 23 MB/)).toBeVisible();
});

test("an unrelated local service is not treated as an assistant", async ({
  page,
}) => {
  await page.route(healthUrl, (request) =>
    request.fulfill({ json: { name: "Another app", version: 1 } }),
  );
  await page.goto(route);
  await expect(page.getByRole("link", { name: /^Download for/ })).toBeVisible();
  await page.getByRole("button", { name: "Check for assistant" }).click();
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toHaveCount(0);
});

test("preview completes without downloads or pairing and supports cancel and reset", async ({
  page,
}) => {
  const externalActions: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/connect?") ||
      request.url().includes("github.com/")
    )
      externalActions.push(request.url());
  });
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: {} }),
  );
  await page.goto(route);
  await page
    .getByRole("button", { name: "New installation", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Codex", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const download = page.getByRole("link", { name: /^Download for/ });
  await download.focus();
  await page.keyboard.press("Enter");
  const setupHeading = page.getByRole("heading", {
    name: "A quick setup on your computer",
  });
  await expect(setupHeading).toBeVisible();
  await expect(setupHeading).toBeFocused();
  await page.getByRole("button", { name: "Simulate app opened" }).click();
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel connection" }).click();
  await expect(
    page.getByRole("heading", { name: "Your assistant is ready" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Simulate approval" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all connected" }),
  ).toBeVisible();
  expect(externalActions).toEqual([]);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your agents" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
});

test("mobile flow stays readable, fits the viewport, and respects reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(healthUrl, (request) =>
    request.fulfill({ status: 503, json: {} }),
  );
  await page.goto(route);
  await expect(page).toHaveTitle("Project CAD – Assistant sandbox");
  await page
    .getByRole("button", { name: "New installation", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Codex", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: /^Download for/ }).click();
  await expect(
    page.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Simulate app opened" }).click();
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await expect(page.locator('[role="status"] svg')).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an older connector offers an update before connecting and never offers an incompatible installer", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/connections")) requests.push(request.url());
  });
  await page.route(healthUrl, (route) =>
    route.fulfill({
      json: {
        name: "Project CAD assistant",
        version: 1,
        capabilities: ["agent-selection-v1"],
      },
    }),
  );
  let published = false;
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({
      json: published
        ? downloads
        : {
            ...downloads,
            version: "0.1.3",
            distribution: {
              ...downloads.distribution,
              baseUrl: downloads.distribution.baseUrl.replace("0.1.4", "0.1.3"),
            },
          },
    }),
  );
  await page.goto("/sandbox/assistant");
  await expect(
    page.getByRole("heading", { name: "Update Project CAD Assistant" }),
  ).toBeVisible();
  await expect(
    page.getByText("The updated installer is not available yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  published = true;
  await page.getByRole("button", { name: "Retry downloads" }).click();
  await expect(page.getByRole("link", { name: /^Download for/ })).toBeVisible();
});

test("declining in the connector keeps choices and reports a clear retryable result", async ({
  page,
}) => {
  const cleanup = await installAssistant(page);
  try {
    await page.goto(route);
    await page
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();
    await approveAssistant(page, false);
    await expect(
      page
        .getByRole("region", { name: "Assistant connection" })
        .getByRole("alert"),
    ).toHaveText(
      "Connection declined in the assistant. Your agent choices are saved.",
    );
    await expect(
      page.getByRole("button", { name: "Connect assistant", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Choose your agents" }),
    ).toHaveCount(0);
  } finally {
    await page.close();
    await cleanup();
  }
});
