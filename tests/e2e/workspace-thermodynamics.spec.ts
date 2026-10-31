import { loadProject } from "./project-fixture";
import { expect, test } from "@playwright/test";
import { solutionExample } from "../../src/domain/examples";
import { catalogFixture } from "./catalog-fixture";

test("thermodynamics has a descriptive radio dialog and components has a separate Supabase search", async ({
  page,
}, info) => {
  await catalogFixture(page);
  await page.addInitScript(() =>
    localStorage.setItem("project-cad.theme", "nord"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const header = page.locator(".app-header");
  const trigger = header.getByRole("button", {
    name: "Project thermodynamics",
  });
  await expect(
    header.getByRole("button", { name: "Project menu" }),
  ).toHaveCount(0);
  await expect(
    header.getByRole("button", { name: "Toggle theme" }),
  ).toHaveCount(0);
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-palette",
    "light",
  );
  await trigger.click();
  const modelDialog = page.getByRole("dialog", {
    name: "Thermodynamics",
    exact: true,
  });
  const idealGas = modelDialog.getByRole("radio", {
    name: "Ideal gas",
    exact: true,
  });
  const raoult = modelDialog.getByRole("radio", {
    name: "Ideal solution · Raoult’s law",
    exact: true,
  });
  const unifac = modelDialog.getByRole("radio", {
    name: "Modified UNIFAC 2.0",
    exact: true,
  });
  await expect(modelDialog).toBeVisible();
  await expect(modelDialog.getByRole("radio")).toHaveCount(3);
  await expect(idealGas).toBeChecked();
  await expect(idealGas).toHaveAccessibleDescription(
    /Low-pressure gases.*condensation.*Vapor only/,
  );
  await expect(raoult).toHaveAccessibleDescription(
    /Ideal mixtures.*similar molecules.*1–200 kPa/,
  );
  await expect(unifac).toHaveAccessibleDescription(
    /Nonideal liquids.*supported molecular groups.*1–200 kPa/,
  );
  await expect(modelDialog.getByRole("searchbox")).toHaveCount(0);
  await expect(idealGas).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(raoult).toBeFocused();
  await expect(raoult).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(modelDialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Ideal gas");
  await trigger.click();
  await expect(idealGas).toBeChecked();
  await page.screenshot({
    path: info.outputPath("thermodynamics-dialog.png"),
  });
  await raoult.check();
  await expect(modelDialog).toBeVisible();
  await expect(trigger).toContainText("Ideal gas");
  await modelDialog.getByRole("button", { name: "Apply model" }).click();
  await expect(trigger).toContainText("Raoult’s law");
  await expect(modelDialog).toHaveCount(0);
  await trigger.click();
  await expect(raoult).toBeChecked();
  await unifac.check();
  await modelDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(modelDialog).toHaveCount(0);
  await expect(trigger).toContainText("Raoult’s law");
  await header.getByRole("button", { name: "Project components" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await expect(
    dialog.getByRole("searchbox", { name: "Search chemical database" }),
  ).toBeVisible();
  await expect(
    dialog.locator(".component-panel-heading .component-badge").first(),
  ).toContainText("chemicals");
  await expect(dialog.getByLabel("Chemical source")).toHaveCount(0);
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Apply components" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await loadProject(page, solutionExample());
  await header.getByRole("button", { name: "Project components" }).click();
  await expect(dialog.getByLabel("Component A", { exact: true })).toContainText(
    "71-43-2",
  );
  await dialog
    .getByRole("searchbox", { name: "Search chemical database" })
    .fill("ethanol");
  await expect(
    dialog.getByRole("table", { name: "Chemical search results" }),
  ).toContainText("64-17-5");
  await page.screenshot({ path: info.outputPath("components-desktop.png") });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(modelDialog).toBeVisible();
  await expect(raoult).toBeChecked();
  const bounds = (await modelDialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(
    await modelDialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await modelDialog
    .getByRole("button", { name: "Apply model" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("thermodynamics-mobile.png") });
  await page.keyboard.press("Escape");
  await header.getByRole("button", { name: "Project components" }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(
    dialog.getByRole("table", { name: "Chemical search results" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("components-mobile.png") });
});

test("database model registry agrees with the three supported methods", async ({
  request,
}) => {
  test.skip(
    process.env.CATALOG_LIVE_TESTS !== "1",
    "Requires the configured Supabase catalog.",
  );
  const response = await request.get("/api/chemicals/models");
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.models.map((m: { id: string }) => m.id)).toEqual([
    "ideal-gas",
    "ideal-solution",
    "modified-unifac-2.0",
  ]);
  for (const model of data.models) expect(model.count).toBeGreaterThan(0);
});
