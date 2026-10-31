import { expect, test, type Page } from "./test";
import {
  folderControls,
  folderText,
  installFolderPicker,
} from "./folder-fixture";

async function library(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function trash(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to Trash", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("moved to Trash");
}

test("last project can be trashed, restored, and permanently deleted without reappearing on reload", async ({
  page,
}, info) => {
  await installFolderPicker(page);
  await page.goto("/workspace");
  await library(page);
  const name = await page.locator(".project-card-title strong").innerText();
  await page.locator(".project-open").click();
  await page
    .getByRole("button", { name: "Move selected project to Trash" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back to canvas" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-open").dblclick();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore selected project" }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-open").dblclick();
  await expect(page.locator(".project-heading h1")).toHaveText(name);
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await library(page);
  await page.getByRole("button", { name: "List view" }).click();
  await page.locator(".project-open").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(".project-open").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", {
    name: "Delete project permanently?",
  });
  await expect(dialog).toContainText(name);
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("trash-mobile-confirm.png") });
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await create.getByLabel("Project name", { exact: true }).fill("After trash");
  await create
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await create
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".project-heading h1")).toHaveText("After trash");
  await library(page);
  await expect(page.locator(".project-card")).toHaveCount(1);
});

test("folder projects keep their file in Trash and delete it from disk only after confirmation and permission", async ({
  page,
}, info) => {
  await installFolderPicker(page);
  await page.goto("/workspace");
  await library(page);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await create.getByLabel("Project name", { exact: true }).fill("Trash study");
  await create
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await create
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  const original = await folderText(page, "Trash study");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle("Laptop projects");
    const folder = await parent.getDirectoryHandle("Trash study");
    const writer = await (
      await folder.getFileHandle("notes.txt", { create: true })
    ).createWritable();
    await writer.write("Keep these notes");
    await writer.close();
  });
  await library(page);
  await trash(page, "Trash study");
  await expect(page.locator(".project-card")).toHaveCount(1);
  expect(await folderText(page, "Trash study")).toBe(original);
  await page.getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.locator(".project-heading h1")).not.toHaveText(
    "Trash study",
  );
  await library(page);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Actions for Trash study" }).click();
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await trash(page, "Trash study");
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(".project-open").click();
  await page
    .getByRole("button", { name: "Permanently delete selected project" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete project permanently?",
  });
  await expect(dialog).toContainText("Trash study/project.json");
  await page.screenshot({ path: info.outputPath("trash-desktop-confirm.png") });
  await folderControls(page, { permission: "denied", grant: "denied" });
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Folder access is needed to delete",
  );
  expect(await folderText(page, "Trash study")).toBe(original);
  await folderControls(page, { grant: "granted" });
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("Laptop projects");
      const folder = await parent.getDirectoryHandle("Trash study");
      const notes = await (await folder.getFileHandle("notes.txt")).getFile();
      let missing = false;
      try {
        await folder.getFileHandle("project.json");
      } catch (error) {
        missing =
          error instanceof DOMException && error.name === "NotFoundError";
      }
      return { missing, notes: await notes.text() };
    }),
  ).toEqual({ missing: true, notes: "Keep these notes" });
  await page.reload();
  await library(page);
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
});

test("a stale editor in another tab cannot recreate a trashed or deleted project", async ({
  page,
  context,
}) => {
  await page.goto("/workspace");
  await library(page);
  const name = await page.locator(".project-card-title strong").innerText();
  const other = await context.newPage();
  await other.goto("/workspace");
  await expect(
    other.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await trash(page, name);
  await other.getByRole("button", { name: "Equipment", exact: true }).click();
  await other.getByTitle("Add Mixer", { exact: true }).click();
  await expect(
    other.getByRole("alert").filter({ hasText: "Trash" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await other.getByTitle("Add Mixer", { exact: true }).click();
  await other.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    other.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeEnabled();
  await expect(other.locator(".save-status")).toContainText(
    "Could not finish saving",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
});
