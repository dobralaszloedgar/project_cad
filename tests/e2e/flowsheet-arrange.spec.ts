import { loadProject } from "./project-fixture";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { plantTemplate } from "../../src/domain/plant-templates";
import type { Workspace } from "../../src/lib/revisions";

async function exported(page: Page): Promise<Workspace> {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
async function allVisible(page: Page) {
  return page.locator(".flow-wrapper").evaluate((container) => {
    const bounds = container.getBoundingClientRect();
    return [
      ...container.querySelectorAll(".equipment-node, .unit-tag, .unit-name"),
    ].every((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= bounds.left + 10 &&
        rect.right <= bounds.right - 10 &&
        rect.top >= bounds.top + 55 &&
        rect.bottom <= bounds.bottom - 25
      );
    });
  });
}
test("Arrange turns the long 39-item flowsheet into a saved layout that fits the window", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?example=parallel-complex&view=2D");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const original = plantTemplate("parallel-complex")!;
  original.units.forEach((unit, i) => {
    unit.position = { x: i * 185, y: 150 };
  });
  await loadProject(page, original);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(39);
  const initial = await exported(page);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect.poll(() => allVisible(page)).toBe(true);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  const arranged = await exported(page);
  expect(arranged.project.edges).toEqual(initial.project.edges);
  expect(
    arranged.project.units.map((unit) => ({ ...unit, position: undefined })),
  ).toEqual(
    initial.project.units.map((unit) => ({ ...unit, position: undefined })),
  );
  expect(arranged.revisions).toHaveLength(initial.revisions.length + 1);
  expect(
    new Set(arranged.project.units.map((unit) => unit.position.y)).size,
  ).toBeGreaterThan(1);
  await page.screenshot({
    path: "/tmp/project-cad-arranged-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect.poll(() => allVisible(page)).toBe(true);
  expect((await exported(page)).project).toEqual(arranged.project);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect.poll(() => allVisible(page)).toBe(true);
  await page.screenshot({
    path: "/tmp/project-cad-arranged-laptop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("the compact-view link arranges once and preserves the saved layout on reload", async ({
  page,
}) => {
  await page.goto("/?example=parallel-complex&view=2D&arrange=1");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect.poll(() => allVisible(page)).toBe(true);
  await expect(page).not.toHaveURL(/arrange=/);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  const saved = await exported(page);
  expect(
    saved.revisions.filter(
      (revision) => revision.label === "Arrange equipment",
    ),
  ).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  expect((await exported(page)).revisions).toHaveLength(saved.revisions.length);
});
