import { test, expect, type Page, type Locator } from "@playwright/test";
async function move(page: Page, element: Locator, dx: number, dy: number) {
  const rect = (await element.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + dx,
    rect.y + rect.height / 2 + dy,
    { steps: 12 },
  );
  await page.mouse.up();
}
test("chat bubble snaps to canvas corners while the chat window remains draggable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const bubble = page.getByRole("button", { name: "Open assistant" }),
    before = (await bubble.boundingBox())!;
  const initialCanvas = (await page.locator(".canvas-panel").boundingBox())!;
  await move(
    page,
    bubble,
    initialCanvas.x + 100 - before.x,
    initialCanvas.y + 150 - before.y,
  );
  await expect(page.locator(".assistant-drawer")).toHaveCount(0);
  const moved = (await bubble.boundingBox())!;
  expect(moved.x).toBeCloseTo(initialCanvas.x + 20, 0);
  const toolbar = (await page.locator(".canvas-toolbar").boundingBox())!;
  expect(moved.y).toBeCloseTo(toolbar.y + toolbar.height + 16, 0);
  await bubble.click();
  const panel = page.locator(".assistant-drawer"),
    panelBefore = (await panel.boundingBox())!;
  await move(page, page.locator(".chat-header"), -130, -50);
  const after = (await panel.boundingBox())!;
  expect(after.x).toBeLessThan(panelBefore.x - 100);
  expect(after.y).toBeLessThan(panelBefore.y - 30);
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await expect(bubble).toBeVisible();
  expect((await bubble.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await move(page, bubble, 3000, 3000);
  await page.setViewportSize({ width: 1000, height: 700 });
  const bounded = (await bubble.boundingBox())!,
    canvas = (await page.locator(".canvas-panel").boundingBox())!;
  expect(bounded.x).toBeGreaterThanOrEqual(canvas.x);
  expect(bounded.y).toBeGreaterThanOrEqual(canvas.y);
  await expect
    .poll(async () => {
      const bubbleBox = (await bubble.boundingBox())!,
        canvasBox = (await page.locator(".canvas-panel").boundingBox())!;
      return Math.abs(
        canvasBox.x + canvasBox.width - bubbleBox.x - bubbleBox.width - 20,
      );
    })
    .toBeLessThan(1);
});
test("composition colors animate, can be disabled, and the 3D switch remains visible", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const rainbow = page.getByRole("button", {
    name: "Color streams by composition",
  });
  await expect(rainbow).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stream-flow-motion")).toHaveCount(6);
  await expect(page.locator(".stream-flow-motion").first()).toHaveCSS(
    "animation-name",
    "stream-flow",
  );
  await rainbow.click();
  await expect(page.locator(".stream-flow-motion")).toHaveCount(0);
  await rainbow.click();
  await expect(page.locator(".stream-flow-motion")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "3D schematic", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".stream-flow-motion").first()).toHaveCSS(
    "animation-name",
    "none",
  );
});
