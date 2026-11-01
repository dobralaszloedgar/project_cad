import { expect, test, type Page } from "./test";
import { THEMES, THEME_STORAGE_KEY } from "../../src/lib/theme";

async function projects(page: Page) {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
}
async function themes(page: Page) {
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Themes", exact: true }),
  ).toBeVisible();
}

async function workspaceThemes(page: Page) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Themes", exact: true })
    .click();
}

test("project-library palettes are also available from the workspace pull-tab menu", async ({
  page,
}, info) => {
  await projects(page);
  await themes(page);
  for (const theme of THEMES) {
    await page.getByRole("radio", { name: theme.label, exact: true }).check();
    await expect(page.locator("main.workspace")).toHaveAttribute(
      "data-palette",
      theme.id,
    );
  }
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Back to canvas", exact: true })
    .click();
  const pullTab = page.getByRole("button", {
    name: "Workspace menu",
    exact: true,
  });
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    THEMES.at(-1)!.id,
  );
  await workspaceThemes(page);
  const panel = page.getByRole("complementary", {
    name: "Themes",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(pullTab).toHaveAttribute("aria-expanded", "false");
  for (const theme of THEMES) {
    await panel.getByRole("radio", { name: theme.label, exact: true }).check();
    await expect(page.locator("main.workspace")).toHaveAttribute(
      "data-palette",
      theme.id,
    );
    await expect(page.locator("main.workspace")).toHaveCSS(
      "color-scheme",
      theme.mode,
    );
    const canvasColor = await page
      .locator(".react-flow")
      .evaluate((element) => {
        const color = document.createElement("span");
        color.style.color = getComputedStyle(element).backgroundColor;
        return color.style.color;
      });
    const expectedColor = await page.evaluate((hex) => {
      const color = document.createElement("span");
      color.style.color = hex;
      return color.style.color;
    }, theme.swatch[0]);
    expect(canvasColor).toBe(expectedColor);
  }
  await panel.getByRole("radio", { name: "Nord", exact: true }).check();
  await page.screenshot({
    path: info.outputPath("workspace-themes-desktop.png"),
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(pullTab).toBeFocused();
  await expect(pullTab).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await workspaceThemes(page);
  await panel.getByRole("radio", { name: "Paper", exact: true }).check();
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: info.outputPath("workspace-themes-mobile.png"),
  });
  await panel
    .getByRole("button", { name: "Close Themes", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});

test("theme preferences persist and sync between the workspace, library and browser tabs", async ({
  page,
  context,
}) => {
  await projects(page);
  await themes(page);
  await page.getByRole("radio", { name: "Nord", exact: true }).check();
  await page.reload();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  const other = await context.newPage();
  await other.goto("/workspace");
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  await themes(page);
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "paper",
  );
  await workspaceThemes(other);
  await other.getByRole("radio", { name: "Dark Blue", exact: true }).check();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "midnight",
  );
  await other.reload();
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "midnight",
  );
});

test("invalid theme preferences and unavailable storage do not block library settings", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "retired-theme");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, THEME_STORAGE_KEY);
  await projects(page);
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "light",
  );
  await themes(page);
  await page.getByRole("radio", { name: "Ocean", exact: true }).check();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "ocean",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Back to canvas", exact: true })
    .click();
  await workspaceThemes(page);
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "paper",
  );
});
