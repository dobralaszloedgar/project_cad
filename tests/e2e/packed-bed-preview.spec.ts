import { expect, test } from "./test";

test("packed-bed plugs and descending flow render and pause cleanly", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1200, height: 850 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket(/\/_next\/webpack-hmr/, () => {});
  await page.goto("/sandbox/equipment");
  await page
    .getByRole("button", { name: "Packed-bed reactor", exact: true })
    .click();
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.waitForTimeout(500);
  await canvas.focus();
  await page.keyboard.press("+");
  await page
    .getByRole("button", { name: "Play operation", exact: true })
    .click();
  // Allow the fitted view to settle before inspecting the flow itself.
  await page.waitForTimeout(1800);
  await canvas.screenshot({ path: "test-results/packed-bed-playing.png" });
  await page
    .getByRole("button", { name: "Pause operation", exact: true })
    .click();
  await page.waitForTimeout(300);
  const paused = await canvas.screenshot({
    path: "test-results/packed-bed-paused.png",
  });
  await page.waitForTimeout(350);
  expect((await canvas.screenshot()).equals(paused)).toBe(true);
  await page
    .getByRole("button", { name: "Play operation", exact: true })
    .click();
  await page.waitForTimeout(500);
  expect((await canvas.screenshot()).equals(paused)).toBe(false);
  expect(errors).toEqual([]);
});
