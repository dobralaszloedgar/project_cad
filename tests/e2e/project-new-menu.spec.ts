// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { test, expect, type Page } from "./test";
import { folderControls, installFolderPicker } from "./folder-fixture";

async function newFolder(page: Page, contextMenu = false) {
  if (contextMenu) {
    await page.locator(".project-library-title h1").click({ button: "right" });
  } else {
    await page.getByRole("button", { name: "New", exact: true }).click();
  }
  await page
    .getByRole("menuitem", {
      name: contextMenu ? "New Folder" : "Folder",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "New folder", exact: true });
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "false");
  return dialog;
}

async function chooseStorage(page: Page, parent = "Laptop projects") {
  await folderControls(page, { parent });
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Storage",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: /^(Choose|Change) folder$/ })
    .click();
  await expect(dialog).toContainText(parent);
  await dialog.getByRole("button", { name: "Close Storage" }).click();
  await expect(
    page
      .locator(".project-connected-folders")
      .getByRole("button", { name: parent, exact: true }),
  ).toBeVisible();
}

async function directoryEntries(page: Page, path: string) {
  return page.evaluate(async (path) => {
    let directory = await navigator.storage.getDirectory();
    for (const part of path.split("/"))
      directory = await directory.getDirectoryHandle(part);
    const entries = [];
    for await (const entry of directory.values()) entries.push(entry.name);
    return entries.sort();
  }, path);
}

test.beforeEach(async ({ page }) => {
  await installFolderPicker(page);
  await page.goto("/workspace?home=1");
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
});

test("New offers project and folder actions with keyboard and mobile access", async ({
  page,
}, info) => {
  await expect(
    page.getByRole("button", { name: "Connect folder", exact: true }),
  ).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "New", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "New", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveText(["Project", "Folder"]);
  await expect(
    menu.getByRole("menuitem", { name: "Project", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Folder", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.screenshot({ path: info.outputPath("new-menu-desktop.png") });
  await menu.getByRole("menuitem", { name: "Project", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Create project", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("new-menu-mobile.png") });
});

test("folder creation chooses storage once and creates persistent filesystem directories", async ({
  page,
}) => {
  const dialog = await newFolder(page);
  await dialog.getByLabel("Folder name", { exact: true }).fill("Client A");
  await expect(
    dialog.getByRole("button", { name: "Create folder", exact: true }),
  ).toBeDisabled();
  await folderControls(page, { cancel: "yes" });
  await dialog.getByRole("button", { name: "Choose storage folder" }).click();
  await expect(
    dialog.getByRole("button", { name: "Create folder", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Folder name", { exact: true })).toHaveValue(
    "Client A",
  );
  await dialog.getByRole("button", { name: "Choose storage folder" }).click();
  await expect(dialog).toContainText("Laptop projects/Client A");
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(await directoryEntries(page, "Laptop projects")).toEqual(["Client A"]);
  expect(await directoryEntries(page, "Laptop projects/Client A")).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Open folder Client A", exact: true }),
  ).toBeVisible();
  await page.reload();
  const next = await newFolder(page);
  await next.getByLabel("Folder name", { exact: true }).fill("Client B");
  await expect(next).toContainText("Laptop projects/Client B");
  await expect(
    next.getByRole("button", { name: "Choose storage folder" }),
  ).toHaveCount(0);
  await next
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(next).toHaveCount(0);
  expect(await directoryEntries(page, "Laptop projects")).toEqual([
    "Client A",
    "Client B",
  ]);
});

test("right-click uses current storage settings and New nests in the browsed directory", async ({
  page,
}, info) => {
  await chooseStorage(page);
  await chooseStorage(page, "External drive");
  const dialog = await newFolder(page, true);
  await dialog.getByLabel("Folder name", { exact: true }).fill("Client A");
  await expect(dialog).toContainText("External drive/Client A");
  await page.screenshot({
    path: info.outputPath("create-folder-destination.png"),
  });
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(await directoryEntries(page, "Laptop projects")).toEqual([]);
  expect(await directoryEntries(page, "External drive")).toEqual(["Client A"]);
  await page
    .getByRole("button", { name: "Open folder Client A", exact: true })
    .click();
  const child = await newFolder(page);
  await child.getByLabel("Folder name", { exact: true }).fill("Utilities");
  await expect(child).toContainText("External drive/Client A/Utilities");
  await child.getByLabel("Folder name", { exact: true }).press("Enter");
  await expect(child).toHaveCount(0);
  expect(await directoryEntries(page, "External drive/Client A")).toEqual([
    "Utilities",
  ]);
  await expect(
    page.getByRole("button", {
      name: "Open folder Client A/Utilities",
      exact: true,
    }),
  ).toBeVisible();
  const nested = await newFolder(page, true);
  await expect(nested).toContainText("External drive/Client A/New folder");
  await nested.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const fromHome = await newFolder(page, true);
  await expect(fromHome).toContainText("External drive/New folder");
});

test("invalid, duplicate and denied folder creation keep the draft without extra directories", async ({
  page,
}) => {
  await chooseStorage(page);
  await page.evaluate(async () => {
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("Laptop projects");
    await directory.getDirectoryHandle("Existing", { create: true });
  });
  const dialog = await newFolder(page);
  const name = dialog.getByLabel("Folder name", { exact: true });
  const create = dialog.getByRole("button", {
    name: "Create folder",
    exact: true,
  });
  await name.fill("../Escape");
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("folder-safe");
  await name.fill("Existing");
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await name.fill("Retry");
  await folderControls(page, { permission: "denied", grant: "denied" });
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("Allow folder access");
  expect(await directoryEntries(page, "Laptop projects")).toEqual(["Existing"]);
  await expect(name).toHaveValue("Retry");
  await folderControls(page, { grant: "granted" });
  await create.click();
  await expect(dialog).toHaveCount(0);
  expect(await directoryEntries(page, "Laptop projects")).toEqual([
    "Existing",
    "Retry",
  ]);
});
