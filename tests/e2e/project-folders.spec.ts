import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { newUnit } from "../../src/domain/schema";
import { checkpoint } from "../../src/lib/revisions";
import {
  folderControls,
  folderText,
  installFolderPicker,
  recoveryWorkspace,
  releaseWrite,
  replaceFolderText,
} from "./folder-fixture";

const evidence = "/tmp/project-cad-folder-qa";
const pageErrors = new WeakMap<Page, string[]>();
test.setTimeout(90_000);
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function start(page: Page) {
  await installFolderPicker(page);
  page.on("dialog", async (dialog) => {
    // Reload intentionally exercises recovery of this test's unsaved work.
    if (dialog.type() === "beforeunload") await dialog.accept();
    else await dialog.dismiss();
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}

async function addEquipment(page: Page, kind: string) {
  const equipment = page.getByRole("button", {
    name: "Equipment",
    exact: true,
  });
  if ((await equipment.getAttribute("aria-expanded")) !== "true")
    await equipment.click();
  await page.getByTitle(`Add ${kind}`, { exact: true }).click();
}

async function library(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function createDialog(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Project name", { exact: true }).fill(name);
  return dialog;
}

async function createProject(page: Page, name: string, capture = false) {
  await library(page);
  const dialog = await createDialog(page, name);
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(dialog.locator("code").last()).toContainText(
    `${name}/project.json`,
  );
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeEnabled();
  if (capture) {
    await page.screenshot({
      path: `${evidence}/create-project-desktop.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${evidence}/create-project-mobile.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
  }
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".project-heading h1")).toHaveText(name);
  await expect(page.locator(".save-status")).toContainText(/saved/i);
}

test("folder project writes JSON, autosaves history, reloads and opens from its real file", async ({
  page,
}) => {
  const errors: string[] = [];
  const downloads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await start(page);
  await createProject(page, "Laptop study", true);
  const created = JSON.parse(await folderText(page, "Laptop study"));
  expect(created).toMatchObject({
    format: "project-cad",
    formatVersion: 1,
    workspace: {
      version: 1,
      project: { name: "Laptop study", units: [], edges: [] },
    },
  });
  expect(created.projectId).toMatch(/^[0-9a-f-]{36}$/);
  expect(created.workspace.revisions.length).toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("folder-qa-picker-call")!),
    ),
  ).toMatchObject({ options: { mode: "readwrite" }, userActivation: true });
  await addEquipment(page, "Feed");
  await addEquipment(page, "Product");
  await page
    .locator(".react-flow__handle.source")
    .first()
    .dragTo(page.locator(".react-flow__handle.target").first());
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Laptop study")).workspace.project
          .units.length,
    )
    .toBe(2);
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Laptop study")).workspace.project
          .edges.length,
    )
    .toBe(1);
  const saved = JSON.parse(await folderText(page, "Laptop study"));
  expect(saved.projectId).toBe(created.projectId);
  expect(saved.workspace.revisions.length).toBeGreaterThan(
    created.workspace.revisions.length,
  );
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".plant-label")).toHaveCount(2);
  await page.getByRole("button", { name: "2D flowsheet", exact: true }).click();
  await page.screenshot({
    path: `${evidence}/saved-project-desktop.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText("Laptop study");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(".save-status")).toContainText(/saved/i);
  const disk = JSON.parse(await folderText(page, "Laptop study"));
  disk.workspace.project.name = "Edited on disk";
  await replaceFolderText(page, "Laptop study", JSON.stringify(disk, null, 2));
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Edited on disk",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await library(page);
  await page
    .getByRole("button", { name: "Open Edited on disk", exact: true })
    .dblclick();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Edited on disk",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(JSON.parse(await folderText(page, "Laptop study")).projectId).toBe(
    created.projectId,
  );
  expect((await recoveryWorkspace(page)).revisions).toEqual(
    saved.workspace.revisions,
  );
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("creating a project cannot be dismissed while its file is committing", async ({
  page,
}) => {
  await start(page);
  await library(page);
  const dialog = await createDialog(page, "Committing study");
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await folderControls(page, { "write-hold": "yes" });
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("folder-qa-writing")))
    .toBe("yes");
  await expect(
    dialog.getByRole("button", { name: "Creating project…", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close Create project", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await releaseWrite(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Committing study",
  );
  expect(
    JSON.parse(await folderText(page, "Committing study")).workspace.project
      .name,
  ).toBe("Committing study");
});

test("cancelled picks and existing directories never create or overwrite a project", async ({
  page,
}) => {
  await start(page);
  await library(page);
  const before = await page.locator(".project-card").count();
  const dialog = await createDialog(page, "Cancelled study");
  await folderControls(page, { cancel: "yes" });
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(before);
  expect(
    await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const parent = await root.getDirectoryHandle("Laptop projects");
        await parent.getDirectoryHandle("Cancelled study");
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError")
          return false;
        throw error;
      }
    }),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Back to canvas", exact: true })
    .click();
  await createProject(page, "Existing study");
  await library(page);
  const text = await folderText(page, "Existing study");
  const collision = await createDialog(page, "Existing study");
  await collision
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await collision
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(collision.getByRole("alert")).toContainText(/exist/i);
  expect(await folderText(page, "Existing study")).toBe(text);
  await collision.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(before + 1);
  await page
    .getByRole("button", {
      name: "Open Heated reactor with recycle",
      exact: true,
    })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await library(page);
  await replaceFolderText(
    page,
    "Existing study",
    '{"format":"project-cad","formatVersion":999}',
  );
  await page
    .getByRole("button", { name: "Open Existing study", exact: true })
    .dblclick();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project library" }).getByRole("status"),
  ).toContainText(/invalid|version|valid/i);
  expect(await folderText(page, "Existing study")).toBe(
    '{"format":"project-cad","formatVersion":999}',
  );
});

test("external edits cannot be overwritten and unsaved work survives reload", async ({
  page,
}) => {
  await start(page);
  await createProject(page, "Conflict study");
  const original = JSON.parse(await folderText(page, "Conflict study"));
  original.workspace.project.name = "External edit";
  const external = JSON.stringify(original, null, 2);
  await replaceFolderText(page, "Conflict study", external);
  await addEquipment(page, "Feed");
  await expect(
    page.getByRole("alert").filter({ hasText: "project.json" }),
  ).toContainText(/changed|conflict|could not|couldn.t/i);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Conflict study")).toBe(external);
  await expect
    .poll(async () => (await recoveryWorkspace(page)).project.units.length)
    .toBe(1);
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Conflict study",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  expect(await folderText(page, "Conflict study")).toBe(external);
  await expect(
    page.getByRole("alert").filter({ hasText: "project.json" }),
  ).toContainText(/changed|conflict|could not|couldn.t/i);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  const pendingCopy = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export local copy", exact: true })
    .click();
  const localCopy = await pendingCopy;
  const exported = JSON.parse(
    await readFile((await localCopy.path())!, "utf8"),
  );
  expect(exported.project.name).toBe("Conflict study");
  expect(exported.project.units).toHaveLength(1);
  expect(exported.revisions).toEqual((await recoveryWorkspace(page)).revisions);
  await page
    .getByRole("button", { name: "Reload from folder", exact: true })
    .click();
  const reload = page.getByRole("dialog", {
    name: "Reload from folder?",
    exact: true,
  });
  await expect(reload).toBeVisible();
  await reload.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  expect(await folderText(page, "Conflict study")).toBe(external);
  await page
    .getByRole("button", { name: "Reload from folder", exact: true })
    .click();
  await reload
    .getByRole("button", { name: "Reload file", exact: true })
    .click();
  await expect(reload).not.toBeVisible();
  await expect(page.locator(".project-heading h1")).toHaveText("External edit");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect(page.locator(".save-status")).toContainText(/^Saved/i);
  expect(await folderText(page, "Conflict study")).toBe(external);
});

test("denied access and failed writes preserve recovery until an explicit retry succeeds", async ({
  page,
}) => {
  await start(page);
  await createProject(page, "Recovery study");
  const original = await folderText(page, "Recovery study");
  await folderControls(page, { permission: "denied", grant: "denied" });
  await addEquipment(page, "Feed");
  await expect
    .poll(async () => (await recoveryWorkspace(page)).project.units.length)
    .toBe(1);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Recovery study")).toBe(original);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Recovery study")).toBe(original);
  await library(page);
  await page
    .getByRole("button", {
      name: "Open Heated reactor with recycle",
      exact: true,
    })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await library(page);
  await page
    .getByRole("button", { name: "Open Recovery study", exact: true })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Recovery study")).toBe(original);
  const reconnect = page.getByRole("button", {
    name: /Reconnect folder|Grant folder access/i,
  });
  await reconnect.click();
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Recovery study")).toBe(original);
  await folderControls(page, { grant: "granted" });
  await reconnect.click();
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Recovery study")).workspace.project
          .units.length,
    )
    .toBe(1);
  await expect(page.locator(".save-status")).toContainText(/^Saved/i);
  const beforeFailure = await folderText(page, "Recovery study");
  await folderControls(page, { "write-failure": "yes" });
  await addEquipment(page, "Product");
  await expect
    .poll(async () => (await recoveryWorkspace(page)).project.units.length)
    .toBe(2);
  await expect(page.locator(".save-status")).not.toContainText(/^Saved/i);
  expect(await folderText(page, "Recovery study")).toBe(beforeFailure);
  await folderControls(page, { "write-failure": null });
  await page
    .getByRole("button", { name: /Retry save|Retry saving|Reconnect folder/i })
    .click();
  // A native atomic replacement can briefly invalidate the prior file entry.
  await expect(async () => {
    expect(
      JSON.parse(await folderText(page, "Recovery study")).workspace.project
        .units,
    ).toHaveLength(2);
  }).toPass({ timeout: 5000 });
  await expect(page.locator(".save-status")).toContainText(/^Saved/i);
});

test("unsupported browsers explain folder access and preserve existing projects", async ({
  page,
}) => {
  await installFolderPicker(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await library(page);
  const dialog = await createDialog(page, "Unsupported study");
  await expect(dialog).toContainText(/Chrome|Edge/);
  await expect(
    dialog.getByRole("button", { name: "Choose folder", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .locator(".project-card")
    .first()
    .getByRole("button", { name: /^Open / })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("a direct 3D example stays independent from the saved folder project", async ({
  page,
}) => {
  await start(page);
  await createProject(page, "Alongside example");
  await addEquipment(page, "Feed");
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Alongside example")).workspace
          .project.units.length,
    )
    .toBe(1);
  await expect(page.locator(".save-status")).toContainText(/^Saved/i);
  const before = await folderText(page, "Alongside example");
  await page.goto("/?example=parallel&view=3D");
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Parallel reaction & finishing",
  );
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "3D schematic", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".plant-label")).toHaveCount(17);
  await library(page);
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Open Alongside example", exact: true })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".save-status")).toContainText(
    "Alongside example/project.json",
  );
  expect(await folderText(page, "Alongside example")).toBe(before);
});

test("duplicating reads newer source JSON and cancel preserves that source for subsequent edits", async ({
  page,
}) => {
  await start(page);
  await createProject(page, "Source study");
  await library(page);
  const external = JSON.parse(await folderText(page, "Source study"));
  const feed = newUnit("Feed", "F-EXTERNAL", 80, 150);
  feed.params.temperature = 365;
  external.workspace.project.name = "Updated source";
  external.workspace.project.units = [feed];
  external.workspace.revisions.push(
    checkpoint(external.workspace.project, "External file edit"),
  );
  const externalText = JSON.stringify(external, null, 2);
  await replaceFolderText(page, "Source study", externalText);
  await page
    .getByRole("button", { name: "Actions for Source study", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  const copyDialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await expect(
    copyDialog.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Updated source copy");
  await copyDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Back to canvas", exact: true })
    .click();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Updated source",
  );
  await expect(
    page.locator('.react-flow__node[data-id="F-EXTERNAL"]'),
  ).toBeVisible();
  expect(await folderText(page, "Source study")).toBe(externalText);
  await addEquipment(page, "Product");
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Source study")).workspace.project
          .units.length,
    )
    .toBe(2);
  await expect(page.locator(".save-status")).toContainText(/^Saved/i);
  const updated = JSON.parse(await folderText(page, "Source study"));
  expect(updated.workspace.project.name).toBe("Updated source");
  expect(updated.workspace.project.units).toEqual(
    expect.arrayContaining([feed]),
  );
  expect(updated.workspace.revisions).toEqual(
    expect.arrayContaining(external.workspace.revisions),
  );
  await library(page);
  await page
    .getByRole("button", { name: "Actions for Updated source", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(
    copyDialog.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Updated source copy");
  await copyDialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await copyDialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(copyDialog).not.toBeVisible();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Updated source copy",
  );
  const copied = JSON.parse(await folderText(page, "Updated source copy"));
  expect(copied.projectId).not.toBe(updated.projectId);
  expect(copied.workspace.project.units).toEqual(
    updated.workspace.project.units,
  );
  expect(copied.workspace.revisions).toEqual(
    expect.arrayContaining(updated.workspace.revisions),
  );
  expect(JSON.parse(await folderText(page, "Source study"))).toEqual(updated);
});
