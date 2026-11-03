// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "./test";
import { startNewProject, submitNewProject } from "./project-create-fixture";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function exportProject(page: Page) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Storage", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.pcad$/);
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

test("native folder capability is detected in the actual browser", async ({
  page,
  browserName,
}, info) => {
  await page.goto("/workspace?home=1");
  const capability = await page.evaluate(() => ({
    secure: isSecureContext,
    folderPicker:
      typeof Reflect.get(window, "showDirectoryPicker") === "function",
    userAgent: navigator.userAgent,
  }));
  expect(capability.secure).toBe(true);
  expect(capability.folderPicker).toBe(browserName === "chromium");
  await info.attach("browser-capabilities", {
    body: JSON.stringify(capability),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  const choose = page.getByRole("button", {
    name: "Choose folder",
    exact: true,
  });
  if (capability.folderPicker) await expect(choose).toBeEnabled();
  else await expect(choose).toBeDisabled();
});

test("browser projects create, autosave, reopen, duplicate and export", async ({
  page,
  browserName,
}) => {
  // Chromium also exercises the fallback used when folder access is unavailable.
  if (browserName === "chromium")
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: undefined,
      });
    });
  await page.goto("/");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  const dialog = await startNewProject(page, "Browser study");
  await expect(dialog).toContainText(
    "This browser. Your project saves automatically",
  );
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText("Browser study");
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Feed", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  const original = await exportProject(page);
  expect(original.workspace.project.name).toBe("Browser study");
  expect(original.workspace.project.units).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText("Browser study");
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Actions for Browser study", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Browser study copy",
  );
  const copy = await exportProject(page);
  expect(copy.projectId).not.toBe(original.projectId);
  expect(copy.workspace.project.units).toEqual(
    original.workspace.project.units,
  );
  expect(copy.workspace.revisions.length).toBeGreaterThan(
    original.workspace.revisions.length,
  );
  await page.goto("/workspace?home=1");
  await page
    .getByRole("button", { name: "Open Browser study", exact: true })
    .dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
});

test("simulation, equipment editing and saved results work across engines", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/workspace");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".kpi").first()).toContainText("77.46%");
  await page.keyboard.press("Escape");
  await page.locator('.react-flow__node[data-id="H-101"]').click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByLabel("Temperature (°C)", { exact: true }).fill("236.85");
  await page
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  const file = await exportProject(page);
  expect(
    file.workspace.project.units.find(
      (unit: { id: string }) => unit.id === "H-101",
    ).params.temperature,
  ).toBe(510);
  expect(file.workspace.revisions.length).toBeGreaterThan(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
});

test("narrow screens keep project creation and editing accessible", async ({
  page,
  browserName,
}, info) => {
  if (browserName === "chromium")
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: undefined,
      });
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace?home=1");
  const dialog = await startNewProject(page, "Small screen study");
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await submitNewProject(page);
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Small screen study",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("narrow-workspace.png") });
});

test("3D view renders and returns to the editable 2D canvas", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto("/workspace");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute(
    "data-graphics-backend",
    /^(webgpu|webgl)$/,
  );
  await expect(page.locator(".plant-label")).toHaveCount(6);
  await info.attach("graphics-backend", {
    body: JSON.stringify(
      await canvas.evaluate((element) => ({ ...element.dataset })),
    ),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("3d-workspace.png") });
  await page.getByRole("button", { name: "2D flowsheet", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
});
