// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { test, expect, type Page } from "./test";
import { installFolderPicker } from "./folder-fixture";
import { aromaticColumnTemplate } from "../../src/domain/real-chemical-templates";
import { defaultTrayHydraulics } from "../../src/domain/equipment/tray-hydraulics-schema";
import { serializeProjectFile } from "../../src/lib/project-file";

test.use({ actionTimeout: 15000 });

async function connectStorage(page: Page) {
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Storage", exact: true });
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Close Storage" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh projects" }),
  ).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await installFolderPicker(page);
  await page.goto("/workspace?home=1");
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await connectStorage(page);
});

test("Home shows created folders, supports searching, and keeps folder navigation", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New folder", exact: true });
  await dialog.getByLabel("Folder name", { exact: true }).fill("demo column");
  await dialog
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const folder = page.getByRole("button", {
    name: "Open folder demo column",
    exact: true,
  });
  await expect(folder).toBeVisible();
  await expect(page.locator(".projects-empty")).toHaveCount(0);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(folder).toBeVisible();
  await page.getByLabel("Search projects", { exact: true }).fill("DEMO");
  await expect(folder).toBeVisible();
  await page.getByLabel("Search projects", { exact: true }).fill("not present");
  await expect(folder).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No matching projects or folders" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Starred", exact: true }).click();
  await expect(folder).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(folder).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.reload();
  await expect(folder).toBeVisible();
  await page.screenshot({ path: info.outputPath("home-folders-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(folder).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("home-folders-mobile.png") });
  await folder.click();
  await expect(
    page.getByRole("heading", { name: "demo column", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Folder path" }),
  ).toContainText("Laptop projects");
});

test("Refresh from disk discovers new demo files and opens their simulated tower states", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const documents = [
    { name: "Tower Weeping", diameter: 2, state: "Weeping predicted" },
    { name: "Tower Flooding", diameter: 0.7, state: "Flooding predicted" },
  ].map((demo) => {
    const project = aromaticColumnTemplate("mesh");
    project.name = demo.name;
    project.units[1].params.distillation!.hydraulics = {
      ...defaultTrayHydraulics(),
      diameter: demo.diameter,
      liquidDensity: 800,
      surfaceTension: 0.02,
    };
    const now = new Date().toISOString();
    return {
      ...demo,
      text: serializeProjectFile({
        format: "project-cad",
        formatVersion: 1,
        projectId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        workspace: { version: 1, project, revisions: [] },
      }),
    };
  });
  // Write outside the application, after its initial library scan has finished.
  await page.evaluate(async (documents) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("Laptop projects");
    const folder = await root.getDirectoryHandle("demo column", {
      create: true,
    });
    await root.getDirectoryHandle("Empty external folder", { create: true });
    for (const { name, text } of documents) {
      const writer = await (
        await folder.getFileHandle(`${name}.pcad`, { create: true })
      ).createWritable();
      await writer.write(text);
      await writer.close();
    }
  }, documents);
  await page.getByRole("button", { name: "Refresh projects" }).click();
  await expect(
    page.getByRole("button", { name: "Open folder demo column", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open folder Empty external folder",
      exact: true,
    }),
  ).toBeVisible();
  for (const { name } of documents)
    await expect(
      page.getByRole("button", { name: `Open ${name}`, exact: true }),
    ).toBeVisible();
  await page.screenshot({ path: info.outputPath("home-refreshed-towers.png") });
  for (const { name, state } of documents) {
    await page
      .getByRole("button", { name: "Open folder demo column", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Open ${name}`, exact: true })
      .dblclick();
    await expect(page.locator(".save-status")).toContainText(`${name}.pcad`);
    await page
      .getByRole("button", { name: "Run simulation", exact: true })
      .click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    await page
      .getByRole("button", { name: "Close Results", exact: true })
      .click();
    await page.locator('.react-flow__node[data-id="D-201"] .unit-tag').click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    const table = page.getByRole("table", {
      name: "Tray hydraulics profile",
      exact: true,
    });
    await expect(
      table.getByRole("cell", { name: state, exact: true }),
    ).toHaveCount(8);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Open projects", exact: true })
      .click();
  }
});
