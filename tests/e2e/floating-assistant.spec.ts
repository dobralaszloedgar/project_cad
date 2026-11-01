import { test, expect, type Page, type Locator } from "./test";
async function move(page: Page, element: Locator, dx: number, dy: number) {
  await element.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  );
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
test("assistant opens from each dock, remembers its corner and stays inside the canvas", async ({
  page,
}) => {
  await page.goto("/workspace");
  const bubble = page.getByRole("button", {
    name: "Open assistant",
    exact: true,
  });
  await expect(bubble).toBeVisible();
  // Allow the shared setup handler to dismiss a modal before keyboard-only work.
  await bubble.click({ trial: true });
  const canvas = (await page.locator(".canvas-panel").boundingBox())!;
  for (const keys of [
    ["ArrowLeft", "ArrowUp"],
    ["ArrowRight"],
    ["ArrowDown"],
    ["ArrowLeft"],
  ]) {
    await bubble.focus();
    for (const key of keys) await page.keyboard.press(key);
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("project-cad.assistant-corner.v1"),
        ),
      )
      .not.toBeNull();
    await expect
      .poll(async () => (await bubble.boundingBox())!.x)
      .toBeGreaterThanOrEqual(canvas.x + 40);
    await bubble.click();
    const panel = page.locator(".assistant-drawer");
    await expect(panel).toBeVisible();
    const corner = await page.evaluate(() =>
      localStorage.getItem("project-cad.assistant-corner.v1"),
    );
    const box = (await panel.boundingBox())!;
    if (corner!.endsWith("left")) expect(box.x).toBeCloseTo(canvas.x + 60, 0);
    else expect(box.x + box.width).toBeCloseTo(canvas.x + canvas.width - 20, 0);
    if (corner!.startsWith("top")) expect(box.y).toBeCloseTo(canvas.y + 72, 0);
    else
      expect(box.y + box.height).toBeCloseTo(canvas.y + canvas.height - 20, 0);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  }
  await page.reload();
  await expect(bubble).toBeVisible();
  await bubble.click({ trial: true });
  await expect
    .poll(async () => (await bubble.boundingBox())!.x)
    .toBeCloseTo(canvas.x + 60, 0);
  await move(page, bubble, 2000, -2000);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("project-cad.assistant-corner.v1"),
      ),
    )
    .toBe("top-right");
  await page.setViewportSize({ width: 1100, height: 800 });
  await bubble.click();
  const panelBox = (await page.locator(".assistant-drawer").boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.y).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(1100);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(800);
  await page.mouse.click(panelBox.x - 20, panelBox.y + panelBox.height / 2);
  await expect(page.locator(".assistant-drawer")).not.toBeVisible();
});

test("drag-to-hide can be restored from workspace settings", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:43118/health", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/workspace");
  const bubble = page.getByRole("button", {
    name: "Open assistant",
    exact: true,
  });
  await expect(bubble).toBeVisible();
  const canvas = (await page.locator(".canvas-panel").boundingBox())!;
  const before = (await bubble.boundingBox())!;
  await move(
    page,
    bubble,
    canvas.x + canvas.width / 2 - (before.x + 22),
    canvas.y + canvas.height - 48 - (before.y + 22),
  );
  await expect(bubble).not.toBeVisible();
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your agents" }),
  ).toBeVisible();
});
test("composition colors default on and persist through Workspace settings", async ({
  page,
}, info) => {
  async function openSettings() {
    await page
      .getByRole("button", { name: "Workspace menu", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Workspace", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Color streams by composition" }),
  ).toHaveCount(0);
  await expect(page.locator(".stream-flow-motion")).toHaveCount(6);
  await expect(page.locator(".stream-flow-motion").first()).toHaveCSS(
    "animation-name",
    "stream-flow",
  );
  await openSettings();
  const compositionColors = page
    .getByRole("tabpanel", { name: "Workspace", exact: true })
    .getByRole("switch", { name: "Color streams by composition" });
  await expect(compositionColors).toBeChecked();
  await page.screenshot({ path: info.outputPath("workspace-settings.png") });
  await compositionColors.uncheck();
  await expect(page.locator(".stream-flow-motion")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".stream-flow-motion")).toHaveCount(0);
  await openSettings();
  await expect(compositionColors).not.toBeChecked();
  await compositionColors.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".stream-flow-motion")).toHaveCount(6);
  await page.getByRole("button", { name: "Close Settings" }).click();
  await page.reload();
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
