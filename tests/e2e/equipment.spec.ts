import { test, expect, type Page } from "./test";
import {
  loadProject,
  loadTemplateProject as loadTemplate,
} from "./project-fixture";
import {
  catalystExample,
  thermalCycleExample,
} from "../../src/domain/examples";

async function inspect(page: Page, id: string) {
  await page.locator(".react-flow__node").filter({ hasText: id }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
}

test("duty setup calculates temperature and persists the active specification", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await loadTemplate(page, "Heating and cooling");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await inspect(page, "H-401");
  await expect(page.getByLabel("Thermal specification")).toHaveValue("duty");
  await expect(
    page.getByLabel("Temperature (°C)", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Heat duty (kW)", { exact: true }).fill("45");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.locator(".equipment-result")).toContainText("45 kW");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(
    page.locator(".stream-table tr").filter({ hasText: "Stream 2" }),
  ).toContainText("175.24");
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await inspect(page, "H-401");
  await expect(page.getByLabel("Thermal specification")).toHaveValue("duty");
  await expect(page.getByLabel("Heat duty (kW)", { exact: true })).toHaveValue(
    "45",
  );
});

test("catalyst reactor with upstream mixing exposes its single inlet, calculated profile and editable limited model", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await loadProject(page, catalystExample());
  const reactor = page
    .locator(".react-flow__node")
    .filter({ hasText: "R-601" });
  await expect(reactor.locator(".react-flow__handle.target")).toHaveCount(1);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await inspect(page, "R-601");
  await expect(page.getByText("Define your first reaction")).toBeVisible();
  await expect(page.getByLabel("Reaction basis")).toHaveCount(0);
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.getByRole("img", { name: /kg of catalyst/ })).toBeVisible();
  await expect(page.locator(".equipment-result")).toContainText("16.52%");
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Add reaction", exact: true }).click();
  await page.getByRole("button", { name: "Add reactant", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Rate constant", { exact: true }).fill("0.01");
  await page
    .getByLabel("Activation energy (kJ/mol)", { exact: true })
    .fill("40");
  await page.getByLabel("Catalyst mass (kg)", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.locator(".equipment-result")).toContainText("30.31%");
  await page.screenshot({
    path: "test-results/equipment-catalyst.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page
    .getByText("Model equations and assumptions", { exact: true })
    .click();
  await expect(
    page
      .locator('.model-notes annotation[encoding="application/x-tex"]')
      .filter({
        hasText: String.raw`\frac{dF_i}{dW}`,
      }),
  ).toHaveCount(1);
  await expect(
    page.locator(".model-notes .katex-display").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".plant-label")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/equipment-3d.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("server calculates the equipment equations and rejects a contradictory duty", async ({
  request,
}) => {
  const project = thermalCycleExample();
  const response = await request.post("/api/simulate", { data: project });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.streams.heated.temperature).toBeCloseTo(400, 8);
  expect(result.energyResidual).toBeCloseTo(0, 8);
  project.units[1].params.heatDuty = -30000;
  const invalid = await request.post("/api/simulate", { data: project });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error).toMatch(/duty/);
  const reactorResponse = await request.post("/api/simulate", {
    data: catalystExample(),
  });
  expect(reactorResponse.status()).toBe(200);
  const reactor = await reactorResponse.json();
  expect(reactor.equipment["R-601"].profile).toHaveLength(41);
  expect(Math.abs(reactor.energyResidual)).toBeLessThan(1e-6);
});
