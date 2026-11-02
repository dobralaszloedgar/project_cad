import { test, expect } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";
import { universalDownloads } from "./assistant-download-fixture";

test("downloads from the connected chat header without losing the draft or connection", async ({
  page,
}, info) => {
  const dispose = await installAssistant(page);
  try {
    await page.addInitScript(() => {
      localStorage.setItem("project-cad.theme", "midnight");
      Object.defineProperty(navigator, "userAgentData", {
        value: { platform: "Windows", mobile: false },
        configurable: true,
      });
    });
    await page.route("**/downloads/assistant/downloads.json", (route) =>
      route.fulfill({ json: universalDownloads }),
    );
    await page
      .context()
      .route(`${universalDownloads.distribution.baseUrl}/**`, (route) => {
        const filename = new URL(route.request().url()).pathname
          .split("/")
          .at(-1);
        return route.fulfill({
          contentType: "application/octet-stream",
          headers: {
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
          body: "Test download. Not an installer.",
        });
      });
    await page.goto("/workspace");
    await connectAssistant(page);
    const prompt = page.getByLabel("Process prompt");
    await prompt.fill("Keep this draft while I download the connector.");
    const trigger = page.getByRole("button", {
      name: "Download connector",
      exact: true,
    });
    await expect(trigger).toHaveAttribute("title", "Download connector");
    await trigger.click();
    const menu = page.getByRole("dialog", {
      name: "Download connector",
      exact: true,
    });
    await expect(menu.getByRole("link")).toHaveCount(3);
    await expect(menu.getByRole("link").first()).toContainText(
      "Download for Windows",
    );
    await expect(prompt).toBeVisible();
    await page.screenshot({
      path: info.outputPath("connected-downloads-desktop.png"),
    });
    for (const file of universalDownloads.files) {
      const link = menu.locator(`a[href$="/${file.filename}"]`);
      const downloading = page.waitForEvent("download");
      await link.click();
      expect((await downloading).suggestedFilename()).toBe(file.filename);
      await expect(prompt).toHaveValue(
        "Keep this draft while I download the connector.",
      );
      await expect(
        page.getByRole("button", { name: "Assistant connection", exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/workspace$/);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.locator('[data-mode="panel"]').evaluate((root) => {
          const panel = root
            .querySelector(".assistant-drawer")!
            .getBoundingClientRect();
          const surface = root
            .querySelector("[data-animating]")!
            .getBoundingClientRect();
          return Math.max(
            Math.abs(panel.x - surface.x),
            Math.abs(panel.y - surface.y),
            Math.abs(panel.width - surface.width),
            Math.abs(panel.height - surface.height),
          );
        }),
      )
      .toBeLessThan(1);
    const panel = (await page.locator(".assistant-drawer").boundingBox())!;
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(panel.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x + panel.width);
    await page.screenshot({
      path: info.outputPath("connected-downloads-mobile.png"),
    });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(prompt).toHaveValue(
      "Keep this draft while I download the connector.",
    );
  } finally {
    await dispose();
  }
});

test("unavailable connector downloads can be retried without leaving chat", async ({
  page,
}) => {
  const dispose = await installAssistant(page);
  let unavailable = true;
  try {
    await page.route("**/downloads/assistant/downloads.json", (route) =>
      unavailable
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({ json: universalDownloads }),
    );
    await page.goto("/workspace");
    await connectAssistant(page);
    await page
      .getByRole("button", { name: "Download connector", exact: true })
      .click();
    const menu = page.getByRole("dialog", {
      name: "Download connector",
      exact: true,
    });
    await expect(menu.getByRole("alert")).toContainText(
      "We couldn’t load the installers",
    );
    await expect(menu.getByRole("link")).toHaveCount(0);
    unavailable = false;
    await menu.getByRole("button", { name: "Retry downloads" }).click();
    await expect(menu.getByRole("link")).toHaveCount(3);
    await expect(page.getByLabel("Process prompt")).toBeVisible();
  } finally {
    await dispose();
  }
});
