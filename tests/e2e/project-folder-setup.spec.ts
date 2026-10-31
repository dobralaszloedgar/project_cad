import { expect, test, type Page } from "@playwright/test";
import {
  folderControls,
  folderText,
  installFolderPicker,
} from "./folder-fixture";

const setup = (page: Page) =>
  page.getByRole("dialog", { name: "Choose project folder", exact: true });

async function chooseFolder(page: Page) {
  await setup(page)
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(setup(page)).toHaveCount(0);
}

async function library(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function create(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await dialog.getByLabel("Project name", { exact: true }).fill(name);
  await expect(
    dialog.getByRole("button", { name: "Change folder" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".project-heading h1")).toHaveText(name);
}

test("first launch remembers one folder for creation, autosave, duplicates and later visits", async ({
  page,
  context,
}, info) => {
  await installFolderPicker(page);
  await page.goto("/");
  await expect(setup(page)).toBeVisible();
  await expect(
    setup(page).getByRole("button", { name: "Choose folder", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: info.outputPath("folder-setup-desktop.png") });
  await chooseFolder(page);
  await library(page);
  await create(page, "First study");
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Mixer", { exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "First study")).workspace.project
          .units.length,
    )
    .toBe(1);
  const first = JSON.parse(await folderText(page, "First study"));
  expect(first.workspace.revisions.length).toBeGreaterThan(1);
  await library(page);
  await page
    .getByRole("button", { name: "Actions for First study", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  const duplicate = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await expect(duplicate).toContainText("Laptop projects/First study copy");
  await duplicate
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(duplicate).toHaveCount(0);
  const copied = JSON.parse(await folderText(page, "First study copy"));
  expect(copied.projectId).not.toBe(first.projectId);
  expect(copied.workspace.project.units).toEqual(first.workspace.project.units);
  expect(copied.workspace.revisions).toEqual(
    expect.arrayContaining(first.workspace.revisions),
  );
  await page.reload();
  await expect(page.locator(".save-status")).toContainText(
    "Saved to Laptop projects/First study copy.pcad",
  );
  await expect(setup(page)).toHaveCount(0);
  await library(page);
  await create(page, "Second study");
  expect(
    JSON.parse(await folderText(page, "Second study")).workspace.project.name,
  ).toBe("Second study");
  expect(
    await page.evaluate(() => localStorage.getItem("folder-qa-picker-count")),
  ).toBe("1");
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("Laptop projects");
      const entries: string[] = [];
      for await (const project of parent.values()) {
        if (project.kind !== "file") throw new Error("Expected a project file");
        entries.push(project.name);
      }
      return entries.sort();
    }),
  ).toEqual(["First study copy.pcad", "First study.pcad", "Second study.pcad"]);
  const other = await context.newPage();
  await installFolderPicker(other);
  await other.goto("/");
  await expect(other.locator(".save-status")).toContainText(
    "Laptop projects/Second study.pcad",
  );
  await library(other);
  await expect(setup(other)).toHaveCount(0);
  await other.close();
  await library(page);
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Storage settings",
    exact: true,
  });
  await expect(settings).toContainText("Laptop projects");
  await expect(settings.locator("p")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("storage-settings-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("storage-settings-mobile.png"),
  });
});

test("cancelling a picker or failing to remember a folder keeps setup available", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/");
  await folderControls(page, { cancel: "yes" });
  await setup(page)
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(setup(page)).toBeVisible();
  await expect(setup(page).getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.name === "preferences" &&
        localStorage.getItem("fail-folder-preference") === "yes"
      )
        throw new DOMException(
          "Could not remember folder",
          "QuotaExceededError",
        );
      return put.call(this, value, key);
    };
    localStorage.setItem("fail-folder-preference", "yes");
  });
  await setup(page)
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(setup(page).getByRole("alert")).toContainText(
    "Could not remember folder",
  );
  await page.evaluate(() => localStorage.removeItem("fail-folder-preference"));
  await chooseFolder(page);
  await page.reload();
  await library(page);
  await expect(setup(page)).toHaveCount(0);
});

test("expired permission reconnects the remembered folder without another picker", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/");
  await chooseFolder(page);
  await library(page);
  await create(page, "Existing study");
  await folderControls(page, { permission: "prompt", grant: "denied" });
  await page.reload();
  const reconnect = page.getByRole("dialog", {
    name: "Reconnect project folder",
    exact: true,
  });
  await expect(reconnect).toContainText("Laptop projects");
  await reconnect
    .getByRole("button", { name: "Reconnect folder", exact: true })
    .click();
  await expect(reconnect.getByRole("alert")).toContainText(
    "Allow folder access",
  );
  await folderControls(page, { grant: "granted" });
  await reconnect
    .getByRole("button", { name: "Reconnect folder", exact: true })
    .click();
  await expect(reconnect).toHaveCount(0);
  await expect(page.locator(".save-status")).toContainText(
    "Saved to Laptop projects/Existing study.pcad",
  );
  await library(page);
  await create(page, "Reconnected study");
  expect(
    await page.evaluate(() => localStorage.getItem("folder-qa-picker-count")),
  ).toBe("1");
});

test("changing the default folder applies to new projects and keeps existing files connected", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/");
  await chooseFolder(page);
  await library(page);
  await create(page, "Original study");
  await library(page);
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Storage settings",
    exact: true,
  });
  await folderControls(page, { cancel: "yes", parent: "New projects" });
  await settings.getByRole("button", { name: "Change folder" }).click();
  await expect(settings).toContainText("Laptop projects");
  await settings.getByRole("button", { name: "Change folder" }).click();
  await expect(settings).toContainText("New projects");
  await page.keyboard.press("Escape");
  await create(page, "New study");
  expect(
    await page.evaluate(async () => {
      const parent = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("New projects");
      return JSON.parse(
        await (
          await (await parent.getFileHandle("New study.pcad")).getFile()
        ).text(),
      ).workspace.project.name;
    }),
  ).toBe("New study");
  await library(page);
  await page
    .getByRole("button", { name: "Open Original study", exact: true })
    .dblclick();
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Mixer", { exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Original study")).workspace.project
          .units.length,
    )
    .toBe(1);
});

test("browsers without folder access keep the existing workspace available", async ({
  page,
}) => {
  await installFolderPicker(page, true);
  await page.goto("/");
  await library(page);
  await expect(setup(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Storage settings",
    exact: true,
  });
  await expect(
    settings.getByRole("button", { name: "Choose folder", exact: true }),
  ).toBeDisabled();
  await expect(settings.getByRole("status")).toContainText("Chrome or Edge");
});
