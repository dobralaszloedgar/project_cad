import { expect, test, type Page } from "@playwright/test";
import {
  folderControls,
  folderText,
  installFolderPicker,
} from "./folder-fixture";
import { startNewProject, submitNewProject } from "./project-create-fixture";

async function home(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function connectFirstProject(page: Page) {
  await installFolderPicker(page);
  await page.goto("/workspace?home=1");
  await startNewProject(page, "First study");
  await submitNewProject(page);
  await expect(page.locator(".save-status")).toContainText("First study.pcad");
  await home(page);
}

async function pickerCount(page: Page) {
  return page.evaluate(() => localStorage.getItem("folder-qa-picker-count"));
}

test("inline subfolders show the complete destination, nest repeatedly, and become the next default", async ({
  page,
}, info) => {
  await connectFirstProject(page);
  const dialog = await startNewProject(page, "Nested study");
  const newFolder = dialog.getByRole("button", {
    name: "New subfolder",
    exact: true,
  });
  await expect(newFolder).toBeVisible();
  await expect(dialog).toContainText("Laptop projects/Nested study.pcad");
  await page.screenshot({
    path: info.outputPath("subfolder-prominent.png"),
    animations: "disabled",
  });
  await newFolder.click();
  const input = dialog.getByLabel("Subfolder name", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("Client A");
  await expect(dialog).toContainText(
    "Laptop projects/Client A/Nested study.pcad",
  );
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("subfolder-inline.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("subfolder-inline-mobile.png"),
    animations: "disabled",
  });
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await input.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("Created Client A");
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Nested study",
  );
  await expect(newFolder).toBeFocused();
  await newFolder.click();
  await input.fill("Utilities");
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Laptop projects/Client A/Utilities/Nested study.pcad",
  );
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText("Nested study");
  const nested = JSON.parse(
    await folderText(page, "Client A/Utilities/Nested study"),
  );
  expect(nested.workspace.project.name).toBe("Nested study");
  await home(page);
  await page.reload();
  const next = await startNewProject(page, "Next study");
  await expect(next).toContainText(
    "Laptop projects/Client A/Utilities/Next study.pcad",
  );
  await submitNewProject(page);
  await expect(page.locator(".save-status")).toContainText("Next study.pcad");
  expect(
    JSON.parse(await folderText(page, "Client A/Utilities/Next study"))
      .projectId,
  ).not.toBe(nested.projectId);
  expect(await pickerCount(page)).toBe("1");
});

test("cancel, invalid and duplicate subfolders preserve the project draft and destination", async ({
  page,
}) => {
  await connectFirstProject(page);
  await page.evaluate(async () => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("Laptop projects");
    await root.getDirectoryHandle("Existing", { create: true });
  });
  const dialog = await startNewProject(page, "Keep this name");
  await dialog
    .getByRole("button", { name: "New subfolder", exact: true })
    .click();
  const input = dialog.getByLabel("Subfolder name", { exact: true });
  await input.fill("Bad/name");
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("folder-safe");
  await input.fill("Existing");
  await input.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await input.fill("Discard this");
  await dialog
    .getByRole("button", { name: "Cancel subfolder", exact: true })
    .click();
  await expect(input).toHaveCount(0);
  await expect(dialog).toContainText("Laptop projects/Keep this name.pcad");
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Keep this name",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("Laptop projects");
      const names = [];
      for await (const entry of root.values()) names.push(entry.name);
      return names.sort();
    }),
  ).toEqual(["Existing", "First study.pcad"]);
});

test("expired permission is requested during creation and denied access can be retried", async ({
  page,
}) => {
  await connectFirstProject(page);
  await folderControls(page, { permission: "prompt", grant: "denied" });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Save options" })).toHaveCount(
    0,
  );
  const draft = await startNewProject(page, "Reconnected study");
  await draft.getByRole("button", { name: "Continue", exact: true }).click();
  const reconnect = page.getByRole("dialog", {
    name: "Reconnect your project folder",
    exact: true,
  });
  await expect(reconnect).toContainText("Reconnected study.pcad");
  await reconnect
    .getByRole("button", { name: "Reconnect & create", exact: true })
    .click();
  await expect(reconnect.getByRole("alert")).toContainText(
    "Folder access was not granted",
  );
  await folderControls(page, { grant: "granted" });
  await reconnect
    .getByRole("button", { name: "Reconnect & create", exact: true })
    .click();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Reconnected study",
  );
  expect(
    JSON.parse(await folderText(page, "Reconnected study")).workspace.project
      .name,
  ).toBe("Reconnected study");
  expect(await pickerCount(page)).toBe("1");
});

test("cancelled picks and invalid names keep the draft without creating files", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/workspace?home=1");
  const dialog = await startNewProject(page, "Invalid/name");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText("folder-safe");
  await dialog.getByLabel("Project name", { exact: true }).fill("Keep draft");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  const folder = page.getByRole("dialog", {
    name: "Choose a project folder",
    exact: true,
  });
  await folderControls(page, { cancel: "yes" });
  await folder
    .getByRole("button", { name: "Choose folder & create", exact: true })
    .click();
  await expect(folder.getByRole("alert")).toHaveCount(0);
  await folder.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Keep draft",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
});

test("saving succeeds even when the browser cannot remember the default folder", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/workspace?home=1");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "preferences")
        throw new DOMException(
          "Could not remember folder",
          "QuotaExceededError",
        );
      return put.call(this, value, key);
    };
  });
  await startNewProject(page, "Saved despite preferences");
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Saved despite preferences",
  );
  await expect(
    page.getByText(
      "Project saved. This browser could not remember the folder for your next project.",
    ),
  ).toBeVisible();
  expect(
    JSON.parse(await folderText(page, "Saved despite preferences")).workspace
      .project.name,
  ).toBe("Saved despite preferences");
});

test("changing the destination keeps existing files and remembers the new folder", async ({
  page,
}) => {
  await connectFirstProject(page);
  const original = await folderText(page, "First study");
  const dialog = await startNewProject(page, "Other study");
  await folderControls(page, { parent: "Other projects" });
  await dialog
    .getByRole("button", { name: "Change folder", exact: true })
    .click();
  await expect(dialog).toContainText("Other projects/Other study.pcad");
  await submitNewProject(page);
  await expect(page.locator(".save-status")).toContainText("Other study.pcad");
  expect(await folderText(page, "First study")).toBe(original);
  await home(page);
  const next = await startNewProject(page, "Next study");
  await expect(next).toContainText("Other projects/Next study.pcad");
  expect(await pickerCount(page)).toBe("2");
});
