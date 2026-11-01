import { submitNewProject } from "./project-create-fixture";
import { test, expect, type Page } from "./test";
import {
  folderControls,
  folderText,
  installFolderPicker,
} from "./folder-fixture";

async function home(page: Page) {
  if (await page.getByRole("region", { name: "Project library" }).isVisible())
    return;
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function create(page: Page, name = "Study") {
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await dialog.getByLabel("Project name", { exact: true }).fill(name);
  await submitNewProject(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toContainText(`${name}.pcad`);
}

async function addFeed(page: Page) {
  const library = page.getByRole("button", { name: "Equipment", exact: true });
  if ((await library.getAttribute("aria-expanded")) !== "true")
    await library.click();
  await page.getByTitle("Add Feed", { exact: true }).click();
}

async function diskEntries(page: Page, path = "") {
  return page.evaluate(async (path) => {
    let directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("Laptop projects");
    for (const part of path.split("/").filter(Boolean))
      directory = await directory.getDirectoryHandle(part);
    const result = [];
    for await (const entry of directory.values()) result.push(entry.name);
    return result.sort();
  }, path);
}

async function externalMove(page: Page, source: string, destination: string) {
  await page.evaluate(
    async ({ source, destination }) => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("Laptop projects");
      async function parent(path: string) {
        const parts = path.split("/");
        const name = parts.pop()!;
        let directory = root;
        for (const part of parts)
          directory = await directory.getDirectoryHandle(part, {
            create: true,
          });
        return { directory, name };
      }
      const from = await parent(source),
        to = await parent(destination);
      const text = await (
        await (await from.directory.getFileHandle(from.name)).getFile()
      ).text();
      const writer = await (
        await to.directory.getFileHandle(to.name, { create: true })
      ).createWritable();
      await writer.write(text);
      await writer.close();
      await from.directory.removeEntry(from.name);
    },
    { source, destination },
  );
}

test.beforeEach(async ({ page }) => {
  await installFolderPicker(page);
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await home(page);
});

test("one named file autosaves, renames on disk, and reloads", async ({
  page,
}) => {
  await create(page);
  expect(await diskEntries(page)).toEqual(["Study.pcad"]);
  await addFeed(page);
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Study")).workspace.project.units
          .length,
    )
    .toBe(1);
  const before = JSON.parse(await folderText(page, "Study"));
  await home(page);
  await page
    .getByRole("button", { name: "Actions for Study", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rename project" });
  await dialog.getByRole("textbox").fill("Reactor design");
  await dialog.getByRole("button", { name: "Save name", exact: true }).click();
  await expect.poll(() => diskEntries(page)).toEqual(["Reactor design.pcad"]);
  await page
    .getByRole("button", { name: "Open Reactor design", exact: true })
    .dblclick();
  await expect(page.locator(".save-status")).toContainText(
    "Reactor design.pcad",
  );
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Reactor design",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  expect(JSON.parse(await folderText(page, "Reactor design")).projectId).toBe(
    before.projectId,
  );
});

test("folder browsing creates actual folders and moves the project file", async ({
  page,
}, testInfo) => {
  await create(page);
  const before = JSON.parse(await folderText(page, "Study"));
  await home(page);
  await page
    .locator(".project-connected-folders")
    .getByRole("button", { name: "Laptop projects", exact: true })
    .click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New folder", exact: true });
  await dialog.getByLabel("Folder name").fill("Client A");
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(await diskEntries(page)).toEqual(["Client A", "Study.pcad"]);
  await page
    .getByRole("button", { name: "Actions for Study", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to folder…", exact: true })
    .click();
  const move = page.getByRole("dialog", { name: "Move project", exact: true });
  await folderControls(page, { open: "Client A" });
  await move
    .getByRole("button", { name: /Choose folder|Change folder/ })
    .click();
  await move.getByRole("button", { name: "Move project", exact: true }).click();
  await expect(move).not.toBeVisible();
  expect(await diskEntries(page)).toEqual(["Client A"]);
  expect(await diskEntries(page, "Client A")).toEqual(["Study.pcad"]);
  await page
    .getByRole("button", { name: "Open folder Client A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Study", exact: true })
    .dblclick();
  await addFeed(page);
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Client A/Study")).workspace.project
          .units.length,
    )
    .toBe(1);
  expect(JSON.parse(await folderText(page, "Client A/Study")).projectId).toBe(
    before.projectId,
  );
  await home(page);
  await page
    .locator(".project-connected-folders")
    .getByRole("button", { name: "Laptop projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open folder Client A", exact: true })
    .click();
  await create(page, "Another");
  expect(await diskEntries(page, "Client A")).toEqual([
    "Another.pcad",
    "Study.pcad",
  ]);
  await home(page);
  await page
    .locator(".project-connected-folders")
    .getByRole("button", { name: "Laptop projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open folder Client A", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("folder-browser-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("folder-browser-mobile.png"),
    fullPage: true,
  });
});

test("external file moves are found on focus and autosave never recreates the original", async ({
  page,
}) => {
  await create(page);
  await externalMove(page, "Study.pcad", "Archived/Moved study.pcad");
  await addFeed(page);
  await expect(page.locator(".save-status")).toContainText(
    "Could not finish saving",
  );
  expect(await diskEntries(page)).toEqual(["Archived"]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".save-status")).toContainText("Moved study.pcad");
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Archived/Moved study")).workspace
          .project.units.length,
    )
    .toBe(1);
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText("Moved study");
  expect(await diskEntries(page)).toEqual(["Archived"]);
});

test("refresh discovers copies and opening one makes it independent", async ({
  page,
}) => {
  await create(page);
  const original = await folderText(page, "Study");
  await page.evaluate(async (text) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("Laptop projects");
    const writer = await (
      await root.getFileHandle("Copy.pcad", { create: true })
    ).createWritable();
    await writer.write(text);
    await writer.close();
  }, original);
  await home(page);
  await expect(
    page.getByRole("button", { name: "Open Copy", exact: true }),
  ).toBeVisible();
  expect(await folderText(page, "Study")).toBe(original);
  expect(await folderText(page, "Copy")).toBe(original);
  await page.getByRole("button", { name: "Open Copy", exact: true }).dblclick();
  await addFeed(page);
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Copy")).workspace.project.units
          .length,
    )
    .toBe(1);
  expect(JSON.parse(await folderText(page, "Copy")).projectId).not.toBe(
    JSON.parse(original).projectId,
  );
  expect(await folderText(page, "Study")).toBe(original);
});

test("files moved outside a connected folder can be located", async ({
  page,
}) => {
  await create(page);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const from = await root.getDirectoryHandle("Laptop projects");
    const to = await root.getDirectoryHandle("Elsewhere", { create: true });
    const text = await (
      await (await from.getFileHandle("Study.pcad")).getFile()
    ).text();
    const writer = await (
      await to.getFileHandle("Study.pcad", { create: true })
    ).createWritable();
    await writer.write(text);
    await writer.close();
    await from.removeEntry("Study.pcad");
  });
  await addFeed(page);
  await expect(page.locator(".save-status")).toContainText(
    "Could not finish saving",
  );
  await folderControls(page, { parent: "Elsewhere" });
  await page
    .getByRole("button", { name: "Locate project", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText(
    "Saved to Elsewhere/Study.pcad",
  );
  expect(await diskEntries(page)).toEqual([]);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
});
