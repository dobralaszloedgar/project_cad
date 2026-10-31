import { test, expect, type Locator, type Page } from "./test";

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
}

async function viewport(page: Page) {
  return page.locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const container = element.closest(".flow-wrapper") as HTMLElement;
    return {
      x: matrix.e,
      y: matrix.f,
      zoom: matrix.a,
      centerX: (container.clientWidth / 2 - matrix.e) / matrix.a,
      centerY: (container.clientHeight / 2 - matrix.f) / matrix.a,
    };
  });
}

async function labelPosition(label: Locator) {
  return label.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f };
  });
}

async function settled(label: Locator) {
  let previous = await labelPosition(label);
  let stable = 0;
  await expect
    .poll(
      async () => {
        const next = await labelPosition(label);
        stable =
          Math.hypot(next.x - previous.x, next.y - previous.y) < 0.1
            ? stable + 1
            : 0;
        previous = next;
        return stable;
      },
      { intervals: [100], timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(3);
}

test("2D scroll pans, pinch zooms at the cursor, and resizing preserves the view", async ({
  page,
}) => {
  await start(page);
  const bounds = (await page.locator(".flow-wrapper").boundingBox())!;
  const pointer = {
    x: bounds.x + bounds.width * 0.6,
    y: bounds.y + bounds.height * 0.35,
  };
  await page.mouse.move(pointer.x, pointer.y);
  const before = await viewport(page);
  await page.mouse.wheel(90, 70);
  await expect
    .poll(async () => (await viewport(page)).x)
    .toBeCloseTo(before.x - 45, 1);
  const panned = await viewport(page);
  expect(panned.zoom).toBeCloseTo(before.zoom, 5);
  expect(panned.y).toBeCloseTo(before.y - 35, 1);
  const world = {
    x: (pointer.x - bounds.x - panned.x) / panned.zoom,
    y: (pointer.y - bounds.y - panned.y) / panned.zoom,
  };
  // Browser trackpad pinches arrive as ctrl+wheel events.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await viewport(page)).zoom)
    .toBeGreaterThan(panned.zoom);
  const zoomed = await viewport(page);
  expect((pointer.x - bounds.x - zoomed.x) / zoomed.zoom).toBeCloseTo(
    world.x,
    0,
  );
  expect((pointer.y - bounds.y - zoomed.y) / zoomed.zoom).toBeCloseTo(
    world.y,
    0,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect
    .poll(async () => (await viewport(page)).centerX)
    .toBeCloseTo(zoomed.centerX, 1);
  await expect
    .poll(async () => (await viewport(page)).centerY)
    .toBeCloseTo(zoomed.centerY, 1);
  expect((await viewport(page)).zoom).toBeCloseTo(zoomed.zoom, 5);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect
    .poll(async () => (await viewport(page)).centerX)
    .toBeCloseTo(zoomed.centerX, 1);
  expect((await viewport(page)).zoom).toBeCloseTo(zoomed.zoom, 5);
});

test("2D equipment follows small movements before snapping on release", async ({
  page,
}) => {
  await start(page);
  const node = page.locator('.react-flow__node[data-id="R-101"]');
  const before = (await node.boundingBox())!;
  const dragStart = {
    x: before.x + before.width / 2,
    y: before.y + before.height / 2,
  };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 13, dragStart.y + 7, { steps: 4 });
  await expect
    .poll(async () => (await node.boundingBox())!.x - before.x)
    .toBeGreaterThan(8);
  const duringDrag = (await node.boundingBox())!;
  await page.mouse.move(dragStart.x + 15, dragStart.y + 9);
  await expect
    .poll(async () => (await node.boundingBox())!.x - duringDrag.x)
    .toBeCloseTo(2, 0);
  await page.mouse.up();
  const position = await node.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(
      (element as HTMLElement).style.transform,
    );
    return { x: matrix.e, y: matrix.f };
  });
  expect(position.x % 10).toBe(0);
  expect(position.y % 10).toBe(0);
});

test("3D orbit, pan, keyboard movement, focus, and camera presets work without losing the view", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1100, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await page.locator('.react-flow__node[data-id="R-101"]').click();
  await page.getByRole("button", { name: "3D schematic" }).click();
  const canvas = page.getByLabel("Interactive 3D equipment model");
  const label = page.locator(".plant-label").filter({ hasText: "R-101" });
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect(label).toBeVisible();
  await settled(label);
  const bounds = (await canvas.boundingBox())!;
  const pointer = {
    x: bounds.x + bounds.width * 0.7,
    y: bounds.y + bounds.height * 0.3,
  };
  for (const button of ["left", "right", "middle"] as const) {
    const before = await labelPosition(label);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button });
    await page.mouse.move(pointer.x + 45, pointer.y + 20, { steps: 3 });
    await page.mouse.up({ button });
    await expect
      .poll(
        async () => {
          const after = await labelPosition(label);
          return Math.hypot(after.x - before.x, after.y - before.y);
        },
        { timeout: 15000, message: `${button} drag moves the camera` },
      )
      .toBeGreaterThan(5);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await settled(label);
  }
  const beforeKey = await labelPosition(label);
  await canvas.focus();
  await page.keyboard.down("d");
  try {
    await expect
      .poll(
        async () => Math.abs((await labelPosition(label)).x - beforeKey.x),
        { timeout: 15000 },
      )
      .toBeGreaterThan(10);
  } finally {
    await page.keyboard.up("d");
  }
  await settled(label);
  const beforeResize = await labelPosition(label);
  await page.setViewportSize({ width: 1000, height: 800 });
  const newBounds = (await canvas.boundingBox())!;
  await expect
    .poll(async () => (await labelPosition(label)).x - beforeResize.x)
    .toBeCloseTo((newBounds.width - bounds.width) / 2, 0);
  await expect
    .poll(async () => (await labelPosition(label)).y)
    .toBeCloseTo(beforeResize.y, 0);
  await page.getByRole("button", { name: "Focus selected equipment" }).click();
  await settled(label);
  const focused = await labelPosition(label);
  expect(Math.abs(focused.x - newBounds.width / 2)).toBeLessThan(
    newBounds.width * 0.2,
  );
  await page.getByRole("combobox", { name: "Camera view" }).selectOption("top");
  await settled(label);
  const top = await labelPosition(label);
  expect(Math.hypot(top.x - focused.x, top.y - focused.y)).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Reset camera" }).click();
  await settled(label);
  await page.screenshot({ path: "test-results/navigation-3d.png" });
  expect(errors).toEqual([]);
});
