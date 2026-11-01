import { loadProject } from "./project-fixture";
import { expect, test, type Page } from "./test";
import { kinds, newUnit } from "../../src/domain/schema";
import { catalystExample, solutionExample } from "../../src/domain/examples";
import { reactionProject } from "../helpers/reactions";

async function inspect(page: Page, id: string) {
  await page.locator(".react-flow__node").filter({ hasText: id }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
}

test("all supported equipment uses Setup and Results, preserves drafts and applies names", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  for (const kind of kinds) {
    const unit = newUnit(kind, `unit-${kind}`, 100, 100);
    const configured = reactionProject();
    if (kind === "PBR")
      unit.params.packedBed = configured.units[1].params.packedBed;
    await loadProject(page, {
      version: 1,
      name: `${kind} editor`,
      thermo: kind === "PBR" ? configured.thermo : undefined,
      units: [unit],
      edges: [],
    });
    await inspect(page, `unit-${kind}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab")).toHaveText(["Setup", "Results"]);
    await expect(dialog.getByRole("tab", { name: "Design" })).toHaveCount(0);
    await expect(dialog.getByLabel("Tag", { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      dialog.getByRole("heading", { name: "Connections", exact: true }),
    ).toBeVisible();
    await dialog.getByLabel("Equipment name").fill(`Edited ${kind}`);
    await expect(
      dialog.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("tab", { name: "Setup", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      dialog.getByRole("tab", { name: "Results", exact: true }),
    ).toBeFocused();
    await expect(
      dialog.getByRole("tabpanel", { name: "Results", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Run the simulation to calculate this equipment."),
    ).toBeVisible();
    await page.keyboard.press("Home");
    await expect(dialog.getByLabel("Equipment name")).toHaveValue(
      `Edited ${kind}`,
    );
    await dialog.getByRole("button", { name: "Apply conditions" }).click();
    await expect(
      dialog.getByText("No pending changes", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/equipment-editor-${kind.toLowerCase()}.png`,
    });
    await page.keyboard.press("Escape");
    await inspect(page, `unit-${kind}`);
    await expect(page.getByLabel("Equipment name")).toHaveValue(
      `Edited ${kind}`,
    );
    await page.keyboard.press("Escape");
  }
});

test("feed composition and reactor sizing retain drafts and compact layouts fit mobile in the fixed workspace appearance", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await loadProject(page, catalystExample());
  await inspect(page, "F-601");
  await page.getByLabel("Mole fraction A", { exact: true }).fill("0.35");
  await expect(page.getByLabel("Mole fraction B", { exact: true })).toHaveText(
    "0.65",
  );
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await expect(page.getByLabel("Mole fraction A", { exact: true })).toHaveValue(
    "0.35",
  );
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.keyboard.press("Escape");
  await inspect(page, "R-601");
  await expect(
    page
      .getByRole("complementary", { name: "Equipment connections" })
      .locator(".equipment-port"),
  ).toHaveCount(2);
  await expect(page.getByText("Define your first reaction")).toBeVisible();
  await page.getByRole("button", { name: "Add reaction", exact: true }).click();
  await page.getByRole("button", { name: "Add reactant", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Rate constant", { exact: true }).fill("0.01");
  await page
    .getByLabel("Packed-bed calculation")
    .selectOption("target-conversion");
  await expect(page.getByLabel("Catalyst mass (kg)")).toHaveCount(0);
  await page.getByLabel("Target conversion (%)").fill("50");
  await page.getByLabel("Packed-bed calculation").selectOption("catalyst-mass");
  await expect(page.getByLabel("Catalyst mass (kg)")).toHaveValue("10");
  await page
    .getByLabel("Packed-bed calculation")
    .selectOption("target-conversion");
  await expect(page.getByLabel("Target conversion (%)")).toHaveValue("50");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Results", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".equipment-result")).toContainText(
    "Single-pass conversion",
  );
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page.getByLabel("Temperature (°C)", { exact: true }).fill("900");
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(
    page.getByRole("tabpanel", { name: "Setup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Temperature (°C)", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(
    0,
  );
  await inspect(page, "R-601");
  await page.screenshot({ path: "test-results/equipment-editor-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Target conversion (%)")).toHaveValue("50");
  await page
    .getByText("Model equations and assumptions", { exact: true })
    .click();
  await expect(page.locator(".model-notes")).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".equipment-editor-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const footer = await page.locator(".equipment-editor-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThan(844);
  await page.screenshot({ path: "test-results/equipment-editor-mobile.png" });
});

test("liquid separation only offers supported flash controls and reports both outlets", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const project = solutionExample();
  await loadProject(page, project);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await inspect(
    page,
    project.units.find((unit) => unit.kind === "Distillation")!.id,
  );
  await expect(
    page.getByText("Simplified separation · single TP flash"),
  ).toBeVisible();
  await expect(page.getByLabel("Relative volatility A/B")).toHaveCount(0);
  await expect(
    page.getByLabel("Distillate fraction", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.locator(".equipment-stream-results thead th")).toHaveCount(
    3,
  );
  await expect(page.locator(".equipment-stream-results")).toContainText(
    "liquid",
  );
  await expect(page.locator(".equipment-stream-results")).toContainText(
    "vapor",
  );
  await page.screenshot({
    path: "test-results/equipment-editor-flash-results.png",
  });
});
