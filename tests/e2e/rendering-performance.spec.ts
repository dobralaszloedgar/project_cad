import { expect, test, type Page } from "./test";

async function labelWrites(page: Page) {
  return page.evaluate(async () => {
    const styles = new Set(
      Array.from(
        document.querySelectorAll<HTMLElement>(".equipment-world-label"),
        (label) => label.style,
      ),
    );
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    let writes = 0;
    CSSStyleDeclaration.prototype.setProperty = function (...args) {
      if (styles.has(this)) writes++;
      return setProperty.apply(this, args);
    };
    try {
      for (let frame = 0; frame < 8; frame++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      return writes;
    } finally {
      CSSStyleDeclaration.prototype.setProperty = setProperty;
    }
  });
}

test("animated fluid leaves stationary labels alone and navigation still repositions them", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sandbox/equipment");
  await page
    .getByRole("combobox", { name: "System example" })
    .selectOption("heating");
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 60000 });
  const labels = page.locator(".equipment-world-label");
  await expect(labels).toHaveCount(3);
  await expect(labels.first()).toBeVisible();
  await page
    .getByRole("button", { name: "Play operation", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-render-scale", /\d/);
  await expect.poll(() => labelWrites(page), { timeout: 15000 }).toBe(0);
  const transform = () =>
    labels.first().evaluate((label) => label.style.transform);
  const before = await transform();
  await canvas.focus();
  await page.keyboard.press("+");
  await expect.poll(transform).not.toBe(before);
  await expect.poll(() => labelWrites(page), { timeout: 15000 }).toBe(0);
  const beforeResize = await transform();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(transform).not.toBe(beforeResize);
  await canvas.focus();
  await page.keyboard.press("l");
  await expect(labels.first()).toBeHidden();
  await page.keyboard.press("l");
  await expect(labels.first()).toBeVisible();
  await page
    .getByRole("button", { name: "Pause operation", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("optimized-equipment.png") });
  await labels.filter({ hasText: "Heater" }).click();
  await expect(page.locator("h1")).toHaveText("Heater");
  expect(errors).toEqual([]);
});
