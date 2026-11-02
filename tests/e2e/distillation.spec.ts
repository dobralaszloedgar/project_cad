import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { aromaticColumnTemplate } from "../../src/domain/real-chemical-templates";

test("FUG and MESH controls, calculation, stage results and persistence", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, aromaticColumnTemplate("fug"));
  const openColumn = async () => {
    await page.locator('.react-flow__node[data-id="D-201"] .unit-tag').click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  };
  await openColumn();
  await expect(page.getByLabel("Column calculation method")).toHaveValue("fug");
  await expect(page.getByLabel("Light key", { exact: true })).toHaveValue(
    "benzene",
  );
  await page.screenshot({ path: info.outputPath("fug-setup.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await openColumn();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "FUG shortcut design" }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated equilibrium stages", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("fug-results.png") });
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page.getByLabel("Column calculation method").selectOption("mesh");
  await expect(
    page.getByLabel("Equilibrium trays (2D & 3D)", { exact: true }),
  ).toHaveValue("8");
  await page.getByLabel("Feed tray (from top)", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.screenshot({ path: info.outputPath("mesh-setup.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await openColumn();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "MESH equilibrium stages" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "MESH stage profile" }).locator("tbody tr"),
  ).toHaveCount(10);
  await expect(page.getByText("Condenser duty", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("mesh-results.png") });
  await page
    .getByText("Stage compositions and enthalpies", { exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "x · Benzene", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await openColumn();
  await expect(page.getByLabel("Column calculation method")).toHaveValue(
    "mesh",
  );
  await expect(
    page.getByLabel("Feed tray (from top)", { exact: true }),
  ).toHaveValue("3");
  await page.getByLabel("Column calculation method").selectOption("fug");
  await expect(
    page.getByLabel("Light-key recovery to distillate", { exact: true }),
  ).toHaveValue("0.95");
  expect(errors).toEqual([]);
});

test("both column templates are discoverable and run", async ({ page }) => {
  for (const [id, heading] of [
    ["distillation-fug", "Benzene–toluene FUG design"],
    ["distillation-mesh", "Benzene–toluene MESH column"],
  ]) {
    await page.goto(`/?example=${id}`);
    await expect(page.locator(".project-heading h1")).toHaveText(heading);
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  }
});

test("condenser selection updates SVG, simulation, 3D and saved settings", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, aromaticColumnTemplate("mesh"));
  const tower = page.locator('.react-flow__node[data-id="D-201"]');
  const open = async () => {
    await tower.locator(".unit-tag").click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  };
  await open();
  await expect(page.getByLabel("Condenser type", { exact: true })).toHaveValue(
    "total",
  );
  await page
    .getByLabel("Condenser type", { exact: true })
    .selectOption("partial");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.screenshot({
    path: info.outputPath("partial-condenser-setup.png"),
  });
  await page.keyboard.press("Escape");
  await expect(tower.locator('[data-condenser-type="partial"]')).toHaveCount(1);
  await expect(
    tower.locator('[data-column-equipment="reflux-splitter"]'),
  ).toHaveCount(0);
  await expect(tower.locator('[data-port-id="out"]')).toHaveAttribute(
    "data-flow-phase",
    "vapor",
  );
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await open();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Results", exact: true })
      .getByText("Equilibrium condenser (partial)", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("partial-condenser-results.png"),
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Close Results", exact: true })
    .click();
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Focus selected equipment", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("partial-condenser-3d.png") });
  await page.getByRole("button", { name: "2D flowsheet", exact: true }).click();
  await page.reload();
  await open();
  await expect(page.getByLabel("Condenser type", { exact: true })).toHaveValue(
    "partial",
  );
  await page.getByLabel("Column calculation method").selectOption("fug");
  await expect(page.getByLabel("Condenser type", { exact: true })).toHaveValue(
    "partial",
  );
  await page.getByLabel("Column calculation method").selectOption("mesh");
  await page
    .getByLabel("Condenser type", { exact: true })
    .selectOption("total");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.keyboard.press("Escape");
  await expect(tower.locator('[data-condenser-type="total"]')).toHaveCount(1);
  await expect(tower.locator('[data-port-id="out"]')).toHaveAttribute(
    "data-flow-phase",
    "liquid",
  );
  await page.screenshot({ path: info.outputPath("total-condenser-2d.png") });
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page
    .getByRole("button", { name: "Close Results", exact: true })
    .click();
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Focus selected equipment", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("total-condenser-3d.png") });
  expect(errors).toEqual([]);
});
