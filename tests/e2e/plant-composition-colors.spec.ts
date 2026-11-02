import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { distillationExample } from "../../src/domain/examples";
import { tenComponentPlant } from "../helpers/ten-component-plant";

test("3D composition colors update after feed edits while preserving the view", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = distillationExample();
  project.units[1].params.relativeVolatility = 20;
  await loadProject(page, project);
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 45000 });
  const legend = page.getByRole("complementary", {
    name: "3D component colors",
  });
  await expect(legend).toBeVisible({ timeout: 30000 });
  await expect(legend.locator(".plant-component-swatches span")).toHaveText([
    "A",
    "B",
  ]);
  await expect(
    page.getByRole("button", { name: "Pause flow", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause flow", exact: true }).click();
  const labels = page.locator(".plant-label");
  await expect(labels).toHaveCount(4);
  const positions = () =>
    labels.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y } = element.getBoundingClientRect();
        return { x, y };
      }),
    );
  // Wait for the initial camera fit before saving the view and material pixels.
  await expect
    .poll(async () => (await positions()).every(({ x, y }) => x > 0 && y > 0))
    .toBe(true);
  const before = await canvas.screenshot({
    path: testInfo.outputPath("binary-jade-amber.png"),
  });
  const beforePositions = await positions();
  await testInfo.attach("50-50-feed", {
    body: before,
    contentType: "image/png",
  });
  const palette = legend.getByRole("combobox", { name: "Fluid palette" });
  await expect(palette).toHaveValue("jade-amber");
  await expect(palette.locator("option")).toHaveCount(9);
  const originalSwatches = await legend
    .locator(".plant-component-swatches i")
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.backgroundColor),
    );
  await palette.selectOption("red-blue");
  await expect
    .poll(
      () =>
        legend
          .locator(".plant-component-swatches i")
          .evaluateAll((elements) =>
            elements.map(
              (element) => (element as HTMLElement).style.backgroundColor,
            ),
          ),
      { timeout: 30000 },
    )
    .not.toEqual(originalSwatches);
  const recolored = await canvas.screenshot();
  expect(recolored.equals(before)).toBe(false);
  (await positions()).forEach(({ x, y }, i) => {
    expect(Math.abs(x - beforePositions[i].x)).toBeLessThan(1);
    expect(Math.abs(y - beforePositions[i].y)).toBeLessThan(1);
  });
  await palette.selectOption("jade-amber");
  await labels.filter({ hasText: "F-201" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByLabel("Mole fraction A", { exact: true }).fill("0.9");
  await page.getByLabel("Mole fraction B", { exact: true }).fill("0.1");
  await page
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas).toBeVisible();
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  const afterPositions = await positions();
  afterPositions.forEach(({ x, y }, i) => {
    expect(Math.abs(x - beforePositions[i].x)).toBeLessThan(1);
    expect(Math.abs(y - beforePositions[i].y)).toBeLessThan(1);
  });
  await testInfo.attach("90-10-feed", {
    body: after,
    contentType: "image/png",
  });
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await palette.selectOption("red-blue");
  await page.reload();
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(palette).toHaveValue("red-blue");
  expect(errors).toEqual([]);
});

test("ten chemical colors stay readable and selectable on desktop and narrow screens", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, tenComponentPlant());
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 45000 });
  const legend = page.getByRole("complementary", {
    name: "3D component colors",
  });
  await expect(legend).toBeVisible();
  const swatches = legend.locator(".plant-component-swatches i");
  await expect(swatches).toHaveCount(10);
  const colors = () =>
    swatches.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.backgroundColor),
    );
  expect(new Set(await colors()).size).toBe(10);
  await expect(page.locator(".plant-label")).toHaveCount(22);
  await testInfo.attach("ten-chemicals-jade-amber", {
    body: await page.screenshot({
      path: testInfo.outputPath("ten-chemicals-jade-amber.png"),
    }),
    contentType: "image/png",
  });
  const initial = await colors();
  await legend
    .getByRole("combobox", { name: "Fluid palette" })
    .selectOption("plum-lime");
  // Software rendering may need time to rebuild the full plant's materials.
  await expect.poll(colors, { timeout: 30000 }).not.toEqual(initial);
  expect(new Set(await colors()).size).toBe(10);
  await testInfo.attach("ten-chemicals-plum-lime", {
    body: await page.screenshot({
      path: testInfo.outputPath("ten-chemicals-plum-lime.png"),
    }),
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(legend).toBeVisible();
  const bounds = await legend.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(
    await legend.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(
    legend.getByRole("combobox", { name: "Fluid palette" }),
  ).toHaveValue("plum-lime");
  await testInfo.attach("ten-chemicals-mobile", {
    body: await page.screenshot({
      path: testInfo.outputPath("ten-chemicals-mobile.png"),
    }),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});
