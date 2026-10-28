import { test, expect } from "@playwright/test";
import { solutionExample } from "../../src/domain/examples";
import { newUnit, type Project } from "../../src/domain/schema";

test("three model choices, real flash, model change and saved settings", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page.getByLabel("Import project file").setInputFiles({
    name: "sample.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(solutionExample())),
  });
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".stream-table")).toContainText("two-phase");
  await expect(page.locator(".diagnostics")).toContainText("Raoult");
  await page.keyboard.press("Escape");
  await page.locator(".model-button").click();
  await expect(page.getByLabel("Property model").locator("option")).toHaveCount(
    3,
  );
  await page.getByLabel("Property model").selectOption("modified-unifac-2.0");
  await page.getByRole("button", { name: "Apply physical model" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".diagnostics")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page.screenshot({
    path: "test-results/thermodynamics.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.locator(".model-button")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page.locator(".model-button").click();
  await expect(page.getByLabel("Sample mixture (A / B)")).toHaveValue(
    "aromatics",
  );
  await page.screenshot({
    path: "test-results/thermodynamic-settings.png",
    fullPage: true,
  });
});

test("server simulation uses the same selected model and rejects bad data", async ({
  request,
}) => {
  const project = solutionExample();
  const response = await request.post("/api/simulate", { data: project });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.provenance.modelId).toBe("ideal-solution");
  expect(result.properties.s1.phase).toBe("two-phase");
  expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
  project.units[0].params.temperature = 800;
  expect(
    (await request.post("/api/simulate", { data: project })).status(),
  ).toBe(422);
});

test("nonideal mixer energy balance agrees in the browser and simulation API", async ({
  page,
  request,
}) => {
  const ethanol = newUnit("Feed", "ethanol", 0, 0);
  const water = newUnit("Feed", "water", 0, 200);
  for (const feed of [ethanol, water]) {
    feed.params.flow = 1;
    feed.params.temperature = 350;
    feed.params.pressure = 200000;
  }
  water.params.fractionA = 0;
  const project: Project = {
    version: 1,
    name: "Nonideal mixing regression",
    thermo: {
      modelId: "modified-unifac-2.0",
      mixture: "aqueous",
      extrapolate: false,
    },
    units: [
      ethanol,
      water,
      newUnit("Mixer", "mixer", 300, 100),
      newUnit("Product", "product", 600, 100),
    ],
    edges: [
      {
        id: "feed1",
        source: "ethanol",
        target: "mixer",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "feed2",
        source: "water",
        target: "mixer",
        sourcePort: "out",
        targetPort: "in2",
        color: "blue",
      },
      {
        id: "mixed",
        source: "mixer",
        target: "product",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
  const response = await request.post("/api/simulate", { data: project });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(Math.abs(result.energyResidual)).toBeLessThan(2e-6);
  expect(Math.abs(result.massResidual)).toBeLessThan(1e-10);
  expect(result.streams.mixed.temperature).toBeLessThan(350);
  expect(result.streams.mixed.temperature).toBeGreaterThan(340);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page.getByLabel("Import project file").setInputFiles({
    name: "mixing.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  const row = page
    .locator(".stream-table tbody tr")
    .filter({ has: page.getByRole("button", { name: "mixed", exact: true }) });
  await expect(row).toContainText(result.streams.mixed.temperature.toFixed(2));
  await expect(row).toContainText("liquid");
});
