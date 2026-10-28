import { test, expect, type Locator, type Page } from "@playwright/test";
async function drag(page: Page, node: Locator) {
  const before = await node.boundingBox();
  expect(before).toBeTruthy();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 70,
    before!.y + before!.height / 2 + 50,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await node.boundingBox())!.x)
    .toBeGreaterThan(before!.x + 25);
}
test("loaded and added equipment keeps initialized dimensions while dragging and persists positions", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[React Flow]")) warnings.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const reactor = page.locator('[data-id="R-101"]');
  await expect(reactor).toBeVisible();
  await drag(page, reactor);
  await page.locator('[data-id="F-101"]').click();
  await drag(page, reactor);
  await page.getByTitle("Add Cooler", { exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const cooler = page
    .locator(".react-flow__node")
    .filter({ hasText: "Cooler" });
  await expect(cooler).toBeVisible();
  await drag(page, cooler);
  const id = await cooler.getAttribute("data-id");
  const transform = await cooler.evaluate(
    (node) => (node as HTMLElement).style.transform,
  );
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const restored = page.locator(`[data-id="${id}"]`);
  await expect(restored).toBeVisible();
  expect(
    await restored.evaluate((node) => (node as HTMLElement).style.transform),
  ).toBe(transform);
  expect(warnings).toEqual([]);
});
