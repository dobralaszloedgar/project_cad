import { expect, test, type Page } from "@playwright/test";
import { THEMES } from "../../src/lib/theme";
import {
  folderControls,
  folderText,
  installFolderPicker,
  recoveryWorkspace,
  replaceFolderText,
} from "./folder-fixture";

async function home(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function saveDialog(page: Page) {
  await page.locator(".project-card-menu-toggle").first().click();
  await page.getByRole("menuitem", { name: "Save to folder…" }).click();
  return page.getByRole("dialog", {
    name: "Save project to folder",
    exact: true,
  });
}

test.beforeEach(async ({ page }) => {
  await installFolderPicker(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
  await home(page);
});

test("home selection, double-click, context menus and keyboard actions match the library", async ({
  page,
}) => {
  const project = page.locator(".project-open").first();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await project.click();
  await expect(project).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("toolbar", { name: "Selected project" }),
  ).toBeVisible();
  await project.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "Open", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Move to Trash" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Star", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(project).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Home", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await project.focus();
  await page.keyboard.press("F2");
  await expect(
    page.getByRole("dialog", { name: "Rename project" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".project-card-menu-toggle").click();
  await menu.getByRole("menuitem", { name: "Star", exact: true }).click();
  await page.getByRole("button", { name: "Starred", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await project.dblclick();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await home(page);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await project.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".projects-page")).toHaveCount(0);
  await home(page);
  await expect(page.locator(".project-list")).toBeVisible();
});

test("home themes and default save folder persist and apply when creating a project", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const themes = page.getByRole("dialog", { name: "Themes", exact: true });
  await themes.getByRole("radio", { name: "Nord", exact: true }).check();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  await expect(
    themes.getByRole("button", { name: "Storage settings" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Storage settings",
    exact: true,
  });
  await expect(settings.getByRole("radio")).toHaveCount(0);
  await settings
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(settings.getByRole("status")).toHaveText(
    "Default folder saved.",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("folder-qa-picker-call")!)
          .userActivation,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.reload();
  await home(page);
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-palette",
    "nord",
  );
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  await expect(settings).toContainText("Laptop projects");
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await create
    .getByLabel("Project name", { exact: true })
    .fill("Default folder study");
  await expect(create).toContainText("Laptop projects/Default folder study");
  await folderControls(page, { permission: "denied", grant: "denied" });
  await create
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(create.getByRole("alert")).toContainText(
    "Folder access was not granted",
  );
  await folderControls(page, { grant: "granted" });
  await create
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  expect(
    JSON.parse(await folderText(page, "Default folder study")).workspace.project
      .name,
  ).toBe("Default folder study");
  await home(page);
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Ask every time", exact: true })
    .click();
  await expect(settings).toContainText("Ask for each project");
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    create.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
});

test("every home palette applies and theme changes sync between tabs", async ({
  page,
  context,
}, info) => {
  const other = await context.newPage();
  await other.goto("/");
  await home(other);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const picker = page.getByRole("group", { name: "Theme", exact: true });
  await expect(picker.getByRole("radio")).toHaveCount(THEMES.length);
  for (const theme of THEMES) {
    await picker.getByRole("radio", { name: theme.label, exact: true }).check();
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-palette",
      theme.id,
    );
    await expect(page.locator(".workspace")).toHaveAttribute(
      "data-theme",
      theme.mode,
    );
    await expect(other.locator(".workspace")).toHaveAttribute(
      "data-palette",
      theme.id,
    );
  }
  await picker.getByRole("radio", { name: "Nord", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.locator(".project-card-menu-toggle").click();
  await expect(page.getByRole("menu")).toHaveCSS(
    "background-color",
    "rgb(59, 66, 82)",
  );
  await page.screenshot({ path: info.outputPath("home-nord-menu.png") });
  await other.close();
});

test("saving and relocating an existing project retains its identity and history and redirects autosave", async ({
  page,
}) => {
  const original = await recoveryWorkspace(page);
  let save = await saveDialog(page);
  await save.getByLabel("Folder name").fill("Original location");
  await save
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await save
    .getByRole("button", { name: "Save to folder", exact: true })
    .click();
  await expect(save).toHaveCount(0);
  const firstText = await folderText(page, "Original location");
  const first = JSON.parse(firstText);
  expect(first.workspace).toEqual(original);
  await expect(page.locator(".project-card")).toHaveCount(1);
  const newer = structuredClone(first);
  newer.workspace.project.name = "Updated on disk";
  await replaceFolderText(page, "Original location", JSON.stringify(newer));
  save = await saveDialog(page);
  await save.getByLabel("Folder name").fill("New location");
  await save
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await save
    .getByRole("button", { name: "Save to folder", exact: true })
    .click();
  await expect(save).toHaveCount(0);
  const relocated = JSON.parse(await folderText(page, "New location"));
  expect(relocated.projectId).toBe(first.projectId);
  expect(relocated.workspace).toEqual(newer.workspace);
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-open").dblclick();
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Mixer", { exact: true }).click();
  await expect(page.locator(".save-status")).toContainText(
    "Saved to New location/project.json",
  );
  const updated = JSON.parse(await folderText(page, "New location"));
  expect(updated.workspace.project.units).toHaveLength(
    original.project.units.length + 1,
  );
  expect(updated.workspace.revisions).toHaveLength(
    original.revisions.length + 1,
  );
  expect(JSON.parse(await folderText(page, "Original location"))).toEqual(
    newer,
  );
  await page.reload();
  await expect(page.locator(".save-status")).toContainText(
    "New location/project.json",
  );
});

test("cancelled picks and failed folder saves keep the existing project intact", async ({
  page,
}) => {
  const original = await recoveryWorkspace(page);
  const save = await saveDialog(page);
  await folderControls(page, { cancel: "yes" });
  await save
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(
    save.getByRole("button", { name: "Save to folder", exact: true }),
  ).toBeDisabled();
  await save.getByLabel("Folder name").fill("Failed destination");
  await save
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await folderControls(page, { "write-failure": "yes" });
  await save
    .getByRole("button", { name: "Save to folder", exact: true })
    .click();
  await expect(save.getByRole("alert")).toBeVisible();
  expect(await recoveryWorkspace(page)).toEqual(original);
  await folderControls(page, { "write-failure": null });
  await save
    .getByRole("button", { name: "Save to folder", exact: true })
    .click();
  await expect(save.getByRole("alert")).toContainText("already exists");
  await save.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-card")).toContainText("Browser storage");
});

test("home menus stay within the screen and respect reduced motion on mobile", async ({
  page,
}, info) => {
  await page.screenshot({ path: info.outputPath("home-desktop.png") });
  await page
    .getByRole("region", { name: "Project library" })
    .click({ button: "right", position: { x: 1200, y: 800 } });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1024);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".project-card-menu-toggle").click();
  await expect(menu).toHaveCSS("animation-name", "none");
  const mobileBounds = await menu.boundingBox();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("home-mobile-menu.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Paper", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("home-mobile-themes.png") });
});
