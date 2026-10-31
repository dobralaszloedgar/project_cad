import { expect, test, type Page } from "@playwright/test";
import { THEMES, THEME_STORAGE_KEY } from "../../src/lib/theme";

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
}

async function openThemes(page: Page) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Themes", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Themes" }),
  ).toBeVisible();
}

function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(", ")})`;
}

test("every theme applies its palette without changing the flowsheet", async ({
  page,
}, info) => {
  await start(page);
  const viewport = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await openThemes(page);
  const picker = page.getByRole("group", { name: "Theme", exact: true });
  await expect(picker.getByRole("radio")).toHaveCount(THEMES.length);
  for (const theme of THEMES) {
    const option = picker.getByRole("radio", {
      name: theme.label,
      exact: true,
    });
    await option.check();
    await expect(option).toBeChecked();
    await expect(page.locator("main.workspace")).toHaveAttribute(
      "data-palette",
      theme.id,
    );
    await expect(page.locator("main.workspace")).toHaveAttribute(
      "data-theme",
      theme.mode,
    );
    await expect(page.locator("main.workspace")).toHaveCSS(
      "background-color",
      rgb(theme.swatch[1]),
    );
    await expect(page.locator(".react-flow")).toHaveCSS(
      "background-color",
      rgb(theme.swatch[0]),
    );
    await expect(
      page.getByRole("button", { name: "Run simulation", exact: true }),
    ).toHaveCSS("background-color", rgb(theme.swatch[2]));
    if (["paper", "nord", "dracula"].includes(theme.id)) {
      await page.screenshot({
        path: info.outputPath(`${theme.id}-desktop.png`),
      });
    }
  }
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.locator(".react-flow__viewport")).toHaveAttribute(
    "style",
    viewport!,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await picker
    .getByRole("radio", { name: "Catppuccin Latte", exact: true })
    .check();
  const drawer = page.getByRole("complementary", { name: "Themes" });
  expect(
    await drawer.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("themes-mobile.png") });
});

test("theme preferences persist, sync across tabs, and follow the projects view", async ({
  page,
  context,
}) => {
  await start(page);
  await openThemes(page);
  await page.getByRole("radio", { name: "Nord", exact: true }).check();
  await page.reload();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  const other = await context.newPage();
  await start(other);
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  await openThemes(page);
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "paper",
  );
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator(".projects-page")).toBeVisible();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "paper",
  );
  await expect(page.locator(".projects-page")).toHaveCSS(
    "background-color",
    rgb("#f4f1ea"),
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "dark",
  );
  await expect(other.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "dark",
  );
});

test("invalid saved themes fall back and unavailable storage still allows theme changes", async ({
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
  await start(page);
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "light",
  );
  await openThemes(page);
  await page.getByRole("radio", { name: "Ocean", exact: true }).check();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "ocean",
  );
});
