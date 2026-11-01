import { expect, test } from "@playwright/test";
import { folderText, installFolderPicker } from "./folder-fixture";
import { startNewProject, submitNewProject } from "./project-create-fixture";

test("landing opens the dashboard and asks for a folder only when creating a project", async ({
  page,
}, info) => {
  await installFolderPicker(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Design.", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\?home=1$/);
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".project-card")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("folder-qa-picker-count")),
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath("dashboard.png"),
    animations: "disabled",
  });
  const dialog = await startNewProject(page, "First process");
  await expect(dialog).toContainText("No folder connected");
  await submitNewProject(page);
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".project-heading h1")).toHaveText("First process");
  await expect(page.locator(".save-status")).toContainText(
    "First process.pcad",
  );
  const saved = JSON.parse(await folderText(page, "First process"));
  expect(saved.workspace.project.units).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText("First process");
  await page.getByRole("button", { name: "Landing page", exact: true }).click();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open First process", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  const second = await startNewProject(page, "Second process");
  await expect(
    second.getByRole("button", { name: "New subfolder", exact: true }),
  ).toBeVisible();
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Second process",
  );
  expect(JSON.parse(await folderText(page, "First process")).projectId).toBe(
    saved.projectId,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("folder-qa-picker-count")),
  ).toBe("1");
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Actions for Second process", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to Trash", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Second process", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/workspace\?home=1$/);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open First process", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("old onboarding links open the dashboard without creating an example", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/workspace\?home=1$/);
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back to canvas", exact: true }),
  ).toBeDisabled();
});

test("a mobile browser without folder access can browse the dashboard without a setup prompt", async ({
  page,
}) => {
  await installFolderPicker(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const dialog = await startNewProject(page, "Mobile study");
  await expect(dialog).toContainText("Use desktop Chrome or Edge");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Start from a template" }),
  ).toBeVisible();
});
