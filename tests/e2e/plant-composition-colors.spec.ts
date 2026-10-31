import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { distillationExample } from "../../src/domain/examples";

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
  await expect(legend).toContainText("Colors blend by mole fraction", {
    timeout: 30000,
  });
  await expect(legend.locator(".plant-component-swatches span")).toHaveText([
    "A",
    "B",
  ]);
  await expect(
    page.getByRole("button", { name: "Play flow", exact: true }),
  ).toBeVisible();
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
  const before = await canvas.screenshot();
  const beforePositions = await positions();
  await testInfo.attach("50-50-feed", {
    body: before,
    contentType: "image/png",
  });
  await labels.filter({ hasText: "F-201" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByLabel("Mole fraction A", { exact: true }).fill("0.9");
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
  expect(errors).toEqual([]);
});
