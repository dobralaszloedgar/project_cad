import { mockAssistantDownloads } from "./assistant-download-fixture";
import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "./test";
import {
  installAssistant,
  approveAssistant,
  pendingAssistantConnection,
} from "./assistant-fixture";

async function connectCodex(page: Page) {
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Codex", exact: true }).check();
  await page
    .getByRole("button", { name: "Connect agents", exact: true })
    .click();

  await approveAssistant(page);
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Codex");
}

async function waitForPanelSurface(page: Page) {
  // Resizing moves the dock and springs its background independently of the text.
  await expect
    .poll(() =>
      page.locator('[data-mode="panel"]').evaluate((root) => {
        const panel = root.querySelector(".assistant-drawer");
        const surface = root.querySelector("[data-animating]");
        if (!panel || !surface) return Infinity;
        const a = panel.getBoundingClientRect();
        const b = surface.getBoundingClientRect();
        return Math.max(
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.width - b.width),
          Math.abs(a.height - b.height),
        );
      }),
    )
    .toBeLessThan(1);
}

const output = "/tmp/project-cad-inline-setup-qa";
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

test("shows selected-agent setup and refreshes sign-in automatically on return", async ({
  page,
}) => {
  let signedIn = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dispose = await installAssistant(page, () => ({
    codex: {
      status: async () => ({
        id: "codex",
        name: "Codex",
        available: signedIn,
        message: signedIn
          ? "Signed in."
          : "Complete Codex sign-in in Project CAD Assistant.",
        models: signedIn
          ? [{ id: "test-model", name: "Test model", default: true }]
          : [],
      }),
      run: async (input) => {
        await input.call("get_project", {});
        input.text("Ready to work with your project.");
      },
    },
  }));
  try {
    await connectCodex(page);
    const setup = page.getByRole("region", { name: "Agent setup" });
    await expect(setup).toContainText("Finish setting up Codex");
    await expect(setup).toContainText("Your agent choice is already saved");
    await page.getByLabel("Process prompt").fill("Hello world");
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Choose your agents" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${output}/01-sign-in-needed.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPanelSurface(page);
    await page.screenshot({
      path: `${output}/02-sign-in-mobile.png`,
      fullPage: true,
    });
    signedIn = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(setup).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Ready to work with your project.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await dispose();
  }
});

test("keeps agent changes on the approval screen until consent succeeds", async ({
  page,
}) => {
  const dispose = await installAssistant(page);
  try {
    await connectCodex(page);
    await page
      .getByRole("button", { name: "Assistant connection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Manage agents", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Claude Code", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Connect agents", exact: true })
      .click();

    await expect(
      page.getByText("Waiting for your approval", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Process prompt")).toHaveCount(0);
    await page.screenshot({
      path: `${output}/approval-inline-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPanelSurface(page);
    await page.screenshot({
      path: `${output}/approval-inline-mobile.png`,
      fullPage: true,
    });
    await approveAssistant(page);
    await expect(page.getByLabel("Process prompt")).toBeVisible();
    await page
      .getByRole("button", { name: "Choose provider and model" })
      .click();
    await expect(
      page
        .getByRole("group", { name: "Assistant provider" })
        .getByRole("button", { name: "Claude Code", exact: true }),
    ).toBeVisible();
  } finally {
    await dispose();
  }
});

test("explains the old schema error and updates without repeating agent selection", async ({
  page,
}) => {
  const raw =
    "Invalid request: invalid type: integer `100000000000000000000` as u128, expected any value";
  let fail = true;
  const dispose = await installAssistant(page, () => ({
    codex: {
      status: async () => ({
        id: "codex",
        name: "Codex",
        available: true,
        message: "Signed in.",
        models: [{ id: "test-model", name: "Test model", default: true }],
      }),
      run: async (input) => {
        if (fail) throw new Error(raw);
        input.text("The updated connection is ready.");
      },
    },
  }));
  try {
    await page
      .context()
      .route(
        "https://*.public.blob.vercel-storage.com/**/ProjectCAD-Assistant-*",
        (route) =>
          route.fulfill({
            contentType: "application/octet-stream",
            headers: {
              "Content-Disposition": 'attachment; filename="test-update.pkg"',
            },
            body: "Test download. Not an installer.",
          }),
      );
    await connectCodex(page);
    await page.getByLabel("Process prompt").fill("Hello world");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("This connector issue is fixed in Assistant 0.1.3", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(raw, { exact: true })).not.toBeVisible();
    await page.screenshot({
      path: `${output}/03-error-recovery.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Update assistant", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Update Project CAD Assistant" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Choose your agents" }),
    ).toHaveCount(0);
    const download = page.getByRole("link", { name: /^Download for/ });
    await expect(download).toHaveAttribute(
      "href",
      /public\.blob\.vercel-storage\.com\/project-cad-assistant\/v0\.1\.4\//,
    );
    const downloaded = page.waitForEvent("download");
    await download.click();
    expect((await downloaded).suggestedFilename()).toBe("test-update.pkg");
    await expect(
      page.getByRole("button", { name: "Reconnect assistant", exact: true }),
    ).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPanelSurface(page);
    await page
      .getByRole("button", { name: "Reconnect assistant", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/04-update-mobile.png`,
      fullPage: true,
    });
    fail = false;

    await page
      .getByRole("button", { name: "Reconnect assistant", exact: true })
      .click();

    expect((await pendingAssistantConnection(page)).agents.providers).toEqual([
      "codex",
    ]);
    await approveAssistant(page);
    await page.getByLabel("Process prompt").fill("Hello again");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("The updated connection is ready.", { exact: true }),
    ).toBeVisible();
  } finally {
    await dispose();
  }
});

test.beforeEach(async ({ page }) => {
  await mockAssistantDownloads(page);
});
