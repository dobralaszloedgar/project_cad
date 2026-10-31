import { expect, test, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { catalogFixture } from "./catalog-fixture";
import { reactionProject } from "../helpers/reactions";
import { settingsFor } from "../helpers/catalog";

async function inspect(page: Page, id: string) {
  await page.locator(".react-flow__node").filter({ hasText: id }).dblclick();
  await expect(
    page.getByRole("dialog").getByRole("tab", { name: "Setup", exact: true }),
  ).toBeVisible();
}

test("configure a multicomponent PBR, calculate, size, export and reopen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = reactionProject();
  project.units[1].params.packedBed = undefined;
  await page.goto("/workspace");
  await loadProject(page, project);
  await inspect(page, "R-101");
  await page.getByLabel("Reaction setup").selectOption("reaction-set");
  await page.getByRole("button", { name: "Add reaction", exact: true }).click();
  await page
    .getByLabel("Reaction name", { exact: true })
    .fill("Coupling reaction");
  await page.getByRole("button", { name: "Add reactant", exact: true }).click();
  await page.getByLabel("reactants coefficient 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(
    page.getByLabel("Reaction equation", { exact: true }),
  ).toContainText("2 CH4O → C2H6O + H2O");
  await page.getByLabel("Reactor flow model").selectOption("constant-flow");
  await page.getByLabel("Rate constant", { exact: true }).fill("0.1");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Results", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Reactor species balance" }),
  ).toContainText("2.207277");
  await expect(
    page
      .getByRole("table", { name: "Reactor species balance" })
      .getByRole("row"),
  ).toHaveCount(5);
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page
    .getByLabel("Packed-bed calculation")
    .selectOption("target-conversion");
  await page.getByLabel("Target conversion (%)", { exact: true }).fill("50");
  await page.getByLabel("Pressure drop (Pa)", { exact: true }).fill("20000");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.locator(".reactor-results")).toContainText("6.931472 kg");
  await expect(page.locator(".reactor-results")).toContainText("81.325 kPa");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export bed profile (CSV)" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("reactor-profile.csv");
  const fs = await import("node:fs/promises");
  expect(await fs.readFile((await file.path())!, "utf8")).toContain(
    "nitrogen (mol/s)",
  );
  await page.screenshot({ path: "test-results/pbr-results-desktop.png" });
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page.screenshot({ path: "test-results/pbr-setup-desktop.png" });
  expect(
    await page
      .locator(".equipment-editor-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await inspect(page, "R-101");
  await expect(page.getByLabel("Reaction name", { exact: true })).toHaveValue(
    "Coupling reaction",
  );
  await expect(
    page.getByLabel("Target conversion (%)", { exact: true }),
  ).toHaveValue("50");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.locator(".reactor-results")).toContainText("6.931472 kg");
  expect(errors).toEqual([]);
});

test("add catalog components and edit all feed fractions", async ({ page }) => {
  await catalogFixture(page);
  const project = reactionProject();
  project.thermo = settingsFor(["67-56-1", "64-17-5"]);
  project.units[0].params.composition = undefined;
  await page.goto("/workspace");
  await loadProject(page, project);
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  for (const name of ["water", "nitrogen"]) {
    await page
      .getByRole("searchbox", { name: "Search chemical database" })
      .fill(name);
    await page
      .getByRole("button", { name: `Add ${name} to project`, exact: true })
      .click();
  }
  await expect(
    page.locator(".selected-components .component-badge"),
  ).toHaveText("4 / 40");
  await page
    .getByRole("button", { name: "Apply components", exact: true })
    .click();
  await inspect(page, "F-101");
  await page.getByLabel("Mole fraction methanol", { exact: true }).fill("0.6");
  await page.getByLabel("Mole fraction nitrogen", { exact: true }).fill("0.4");
  await expect(
    page.getByLabel("Total mole fraction", { exact: true }),
  ).toHaveText("Total: 1");
  await page
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".stream-table")).toContainText(
    "nitrogen fraction",
  );
});

test("general rate expressions, reaction duplication and disabled states persist", async ({
  page,
}) => {
  await page.goto("/workspace");
  await loadProject(page, reactionProject());
  await inspect(page, "R-101");
  await page
    .getByLabel("Rate law model", { exact: true })
    .selectOption("general");
  await page.getByLabel("Rate editing method").selectOption("custom");
  await page.getByLabel("Custom rate expression").fill("kf*a");
  await page.getByRole("button", { name: "Expand rate editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Reaction rate editor", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/pbr-rate-editor-desktop.png" });
  await page.getByRole("button", { name: "Done editing" }).click();
  await page
    .getByRole("button", { name: "Duplicate reaction", exact: true })
    .click();
  await page.getByLabel("Enable reaction 2", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Reaction extents" }),
  ).toContainText("disabled");
  await expect(
    page.getByRole("table", { name: "Reactor species balance" }),
  ).toContainText("2.207277");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await inspect(page, "R-101");
  await expect(
    page.getByLabel("Enable reaction 2", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Custom rate expression")).toHaveValue("kf*a");
});
