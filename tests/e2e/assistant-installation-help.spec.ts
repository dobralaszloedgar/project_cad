import type { Page } from "@playwright/test";
import {
  mockAssistantDownloads,
  universalDownloads,
} from "./assistant-download-fixture";
import { test, expect } from "./test";

const healthUrl = "http://127.0.0.1:43118/health";
const macUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36";

test.use({ userAgent: macUserAgent });
test.beforeEach(async ({ page }) => {
  await mockAssistantDownloads(page);
  await page.route(healthUrl, (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route("https://*.public.blob.vercel-storage.com/**", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 200 })
      : route.fulfill({
          contentType: "application/octet-stream",
          headers: {
            "Content-Disposition": 'attachment; filename="assistant-test.txt"',
          },
          body: "Test download, not an installer.",
        }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      value: undefined,
      configurable: true,
    });
  });
});

async function downloadInstaller(page: Page, filename?: string) {
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Assistant", exact: true });
  await panel.getByRole("checkbox", { name: "Codex", exact: true }).check();
  await panel.getByRole("button", { name: "Continue", exact: true }).click();
  if (filename) {
    await panel
      .getByLabel("Operating system", { exact: true })
      .selectOption(filename);
  }
  const download = page.waitForEvent("download");
  await panel.getByRole("link", { name: /^Download for/ }).click();
  expect((await download).suggestedFilename()).toBe("assistant-test.txt");
  await expect(
    panel.getByRole("heading", { name: "A quick setup on your computer" }),
  ).toBeVisible();
  return panel;
}

test("macOS help loads on request, plays inline and disappears when the assistant is ready", async ({
  page,
}) => {
  const assets: string[] = [];
  page.on("request", (request) => {
    if (decodeURIComponent(request.url()).includes("/assistant/install-guide/"))
      assets.push(request.url());
  });
  const panel = await downloadInstaller(page);
  const help = panel.getByRole("button", { name: /Installer won’t open/ });
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByRole("figure")).toHaveCount(0);
  expect(assets).toHaveLength(0);
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await expect(
    panel.getByRole("figure", { name: "macOS Tahoe 26 installer walkthrough" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("group", { name: "Operating system" }),
  ).toHaveCount(0);
  await expect(
    panel
      .getByRole("list", { name: "Installation steps" })
      .getByRole("listitem"),
  ).toHaveCount(6);
  await expect(
    panel.getByRole("list", { name: "Installation steps" }),
  ).toContainText("ProjectCAD-Assistant-macos-universal.pkg");
  await expect.poll(() => assets.length).toBeGreaterThan(0);
  // Opening help stays within the existing assistant panel.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(page.context().pages()).toHaveLength(1);

  await page.clock.install();
  await panel.getByRole("button", { name: "Play guide", exact: true }).click();
  await page.clock.runFor(2900);
  await expect(panel.locator('[class*="clickRing"]')).toHaveCSS("opacity", "1");
  await panel.getByRole("button", { name: "Pause guide", exact: true }).click();
  const progress = panel.getByRole("progressbar", { name: "Guide progress" });
  const paused = await progress.getAttribute("value");
  await page.clock.runFor(1000);
  await expect(progress).toHaveAttribute("value", paused!);
  await help.click();
  await expect(panel.getByRole("figure")).toHaveCount(0);

  await page.route(healthUrl, (route) =>
    route.fulfill({
      json: {
        name: "Project CAD assistant",
        version: 1,
        capabilities: ["desktop-consent-v1"],
      },
    }),
  );
  await panel.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Your assistant is ready" }),
  ).toBeVisible();
  await expect(help).toHaveCount(0);
});

for (const architecture of ["x64", "arm64", "universal"]) {
  test(`Windows ${architecture} help follows the selected installer even on a Mac browser`, async ({
    page,
  }) => {
    if (architecture === "universal") {
      await page.route("**/downloads/assistant/downloads.json", (request) =>
        request.fulfill({ json: universalDownloads }),
      );
    }
    const filename = `ProjectCAD-Assistant-windows-${architecture}-Setup.exe`;
    const panel = await downloadInstaller(page, filename);
    await panel.getByRole("button", { name: /Installer won’t open/ }).click();
    await expect(
      panel.getByRole("figure", { name: "Windows 11 installer walkthrough" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("list", { name: "Installation steps" }),
    ).toContainText(filename);
    if (architecture === "universal") {
      await expect(
        panel.getByRole("list", { name: "Installation steps" }),
      ).toContainText("automatically installs the correct version");
      await expect(
        panel.getByRole("list", { name: "Installation steps" }),
      ).not.toContainText("different installers");
    }
    await expect(panel.getByLabel("macOS version")).toHaveCount(0);
    await expect(
      panel.getByRole("combobox", { name: "Installer", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("group", { name: "Operating system" }),
    ).toHaveCount(0);
    await panel
      .getByRole("button", { name: /Check the filename → Run anyway/ })
      .click();
    await expect(panel.locator("[data-guide-target]")).toHaveText("Run anyway");
    await expect(panel.locator('[class*="nativeFrame"]')).toContainText(
      filename,
    );
  });
}

test("narrow macOS help supports reduced motion, version fallback and reopening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  const panel = await downloadInstaller(page);
  const help = panel.getByRole("button", { name: /Installer won’t open/ });
  await help.click();
  await expect(
    panel.getByText("Reduced motion is on. Read or play the still steps."),
  ).toBeVisible();
  await expect(panel.locator('[class*="cursorPosition"]')).toBeHidden();
  await panel.getByLabel("macOS version").selectOption("sequoia");
  await expect(
    panel.getByRole("figure", {
      name: "macOS Sequoia 15 installer walkthrough",
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Show whole window" }),
  ).toHaveAttribute("aria-pressed", "true");
  const fits = await panel.evaluate(
    (element) => element.scrollWidth <= element.clientWidth,
  );
  expect(fits).toBe(true);
  await panel.getByLabel("macOS version").selectOption("other");
  await expect(panel.getByRole("figure")).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: "Apple’s guidance" }),
  ).toBeVisible();
  await help.click();
  await help.click();
  await expect(
    panel.getByRole("button", { name: "Play guide", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("progressbar", { name: "Guide progress" }),
  ).toHaveAttribute("value", "0");
});

test("Linux setup keeps its executable instructions without a mismatched OS guide", async ({
  page,
}) => {
  const panel = await downloadInstaller(
    page,
    "ProjectCAD-Assistant-linux-x64.run",
  );
  await expect(
    panel.getByText(/Make the downloaded \.run file executable/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /Installer won’t open/ }),
  ).toHaveCount(0);
});
