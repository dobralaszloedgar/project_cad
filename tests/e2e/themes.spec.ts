import { expect, test, type Page } from "@playwright/test";
import { THEMES, THEME_STORAGE_KEY } from "../../src/lib/theme";

async function projects(page: Page) {
  await page.goto("/");
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

test("project-library palettes remain available while the flowsheet uses its fixed appearance", async ({
  page,
}) => {
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
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "light",
  );
  await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(
    0,
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("library theme preferences persist and sync across tabs without changing the canvas", async ({
  page,
  context,
}) => {
  await projects(page);
  await themes(page);
  await page.getByRole("radio", { name: "Nord", exact: true }).check();
  await page.reload();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "light",
  );
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  const other = await context.newPage();
  await projects(other);
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
});
