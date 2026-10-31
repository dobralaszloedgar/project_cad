import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}
async function view(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function ready(page: Page) {
  // Detailed assemblies can take several seconds to compile on software WebGL.
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
}
async function template(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}
async function exportProject(page: Page) {
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
  return JSON.parse(await fs.readFile((await download.path())!, "utf8"));
}

test("workspace defaults to transparent equipment and recovers 3D without losing the project", async ({
  page,
}) => {
  // This exercises several cold WebGL contexts, including deliberate recovery.
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await view(page, "3D schematic");
  await ready(page);
  const transparency = page.getByRole("switch", { name: "Transparent shell" });
  await expect(transparency).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".plant-label")).toHaveCount(6);
  await page.getByRole("button", { name: "Play flow", exact: true }).click();
  await page.getByRole("combobox", { name: "Flow speed" }).selectOption("4");
  await expect(page.getByRole("combobox", { name: "Flow speed" })).toHaveValue(
    "4",
  );
  await page.getByRole("button", { name: "Pause flow", exact: true }).click();
  await transparency.click();
  await expect(transparency).toHaveAttribute("aria-checked", "false");
  await view(page, "2D flowsheet");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await view(page, "3D schematic");
  await ready(page);
  await expect(transparency).toHaveAttribute("aria-checked", "true");
  await page
    .getByLabel("Interactive 3D equipment model")
    .dispatchEvent("webglcontextlost");
  await expect(
    page.getByRole("heading", { name: "The 3D connection was interrupted" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await ready(page);
  await expect(transparency).toHaveAttribute("aria-checked", "true");
  await page.locator(".plant-label").filter({ hasText: "S-101" }).click();
  await page.getByLabel("Secondary outlet fraction").fill("0.7");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await closeDialog(page);
  await view(page, "Split");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.locator(".plant-label")).toHaveCount(6);
  await expect(page.locator(".plant-label.active")).toContainText("S-101");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  expect(errors).toEqual([]);
});

test("column tray edits persist through 3D, Split, export and reload", async ({
  page,
}) => {
  await start(page);
  await template(page, "Raoult’s law separation");
  const before = (await exportProject(page)).project;
  await view(page, "3D schematic");
  await ready(page);
  await page.locator(".plant-label").filter({ hasText: "D-201" }).click();
  await expect(page.getByLabel("Visible trays (3D)")).toHaveValue("8");
  await expect(
    page.getByText(/The feed temperature and pressure determine/),
  ).toBeVisible();
  await page.getByLabel("Visible trays (3D)").fill("12");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await closeDialog(page);
  await view(page, "Split");
  await expect(page.locator(".plant-label")).toHaveCount(4);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const after = (await exportProject(page)).project;
  expect(after.edges).toEqual(before.edges);
  expect(
    after.units.map((unit: { position: unknown }) => unit.position),
  ).toEqual(before.units.map((unit: { position: unknown }) => unit.position));
  expect(
    after.units.find((unit: { id: string }) => unit.id === "D-201").params
      .trayCount,
  ).toBe(12);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await view(page, "3D schematic");
  await ready(page);
  await page.locator(".plant-label").filter({ hasText: "D-201" }).click();
  await expect(page.getByLabel("Visible trays (3D)")).toHaveValue("12");
  await closeDialog(page);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
});

test("large plant templates are editable application projects", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  for (const [name, count, trays] of [
    ["Three-stage benzene–toluene recovery", 21, 8],
    ["Four-stage benzene–toluene recovery", 35, 14],
  ] as const) {
    await template(page, name);
    await view(page, "3D schematic");
    await ready(page);
    await expect(page.locator(".plant-label")).toHaveCount(count);
    await expect(
      page.getByRole("switch", { name: "Transparent shell" }),
    ).toHaveAttribute("aria-checked", "true");
    const selector = page.getByRole("combobox", {
      name: "Inspect 3D equipment",
    });
    const column = await selector
      .locator("option")
      .evaluateAll(
        (options) =>
          (options as HTMLOptionElement[]).find((option) =>
            option.value.startsWith("D-"),
          )?.value,
      );
    expect(column).toBeTruthy();
    await selector.selectOption(column!);
    await expect(page.getByLabel("Visible trays (3D)")).toHaveValue(
      String(trays),
    );
    await closeDialog(page);
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    await closeDialog(page);
    await view(page, "2D flowsheet");
    await expect(page.locator(".react-flow__node")).toHaveCount(count);
  }
  expect(errors).toEqual([]);
});
