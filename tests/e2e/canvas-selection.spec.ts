import { expect, test, type Page } from "./test";

const node = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const camera = (page: Page) =>
  page.locator(".react-flow__viewport").getAttribute("style");

async function selected(page: Page, ids: string[]) {
  await expect
    .poll(() =>
      page
        .locator(".react-flow__node.selected")
        .evaluateAll((nodes) =>
          nodes.map((item) => item.getAttribute("data-id")).sort(),
        ),
    )
    .toEqual([...ids].sort());
}

async function marquee(page: Page, ids: string[]) {
  const frames = await Promise.all(
    ids.map((id) =>
      node(page, id).locator(".equipment-selection-frame").boundingBox(),
    ),
  );
  const left = Math.min(...frames.map((frame) => frame!.x)) - 3;
  const top = Math.min(...frames.map((frame) => frame!.y)) - 3;
  const right = Math.max(...frames.map((frame) => frame!.x + frame!.width)) + 3;
  const bottom =
    Math.max(...frames.map((frame) => frame!.y + frame!.height)) + 3;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 12 });
  await expect(page.locator(".react-flow__selection")).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(node(page, "R-101")).toBeVisible();
  await expect(page.locator(".react-flow__viewport")).not.toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
});

test("marquee selects visible frames, replaces selection, and moves a group in one undo step", async ({
  page,
}) => {
  for (const id of ["F-101", "R-101", "P-101"]) {
    await marquee(page, [id]);
    await selected(page, [id]);
    await expect(page.locator(".react-flow__edge.selected")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await marquee(page, ["H-101", "R-101"]);
  await selected(page, ["H-101", "R-101"]);
  const overlay = page.locator(".react-flow__nodesselection-rect");
  await expect(overlay).toHaveCSS("pointer-events", "none");
  await expect(overlay).toHaveCSS("border-top-width", "0px");
  const heater = node(page, "H-101");
  const reactor = node(page, "R-101");
  const before = await Promise.all(
    [heater, reactor].map((item) => item.getAttribute("style")),
  );
  const frame = (await heater
    .locator(".equipment-selection-frame")
    .boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    frame.x + frame.width / 2 + 65,
    frame.y + frame.height / 2 + 45,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(heater).not.toHaveAttribute("style", before[0]!);
  await expect(reactor).not.toHaveAttribute("style", before[1]!);
  await selected(page, ["H-101", "R-101"]);
  await page.keyboard.press("Control+z");
  await expect(heater).toHaveAttribute("style", before[0]!);
  await expect(reactor).toHaveAttribute("style", before[1]!);
  await marquee(page, ["F-101"]);
  await selected(page, ["F-101"]);
  const tag = (await node(page, "F-101").locator(".unit-tag").boundingBox())!;
  await page.mouse.move(tag.x - 3, tag.y - 3);
  await page.mouse.down();
  await page.mouse.move(tag.x + tag.width + 3, tag.y + tag.height + 3, {
    steps: 8,
  });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up();
  await selected(page, []);
});

test("modifier selection toggles and stream selection opens its editor only on double click", async ({
  page,
}) => {
  await node(page, "F-101").click();
  await node(page, "R-101").click({ modifiers: ["Control"] });
  await selected(page, ["F-101", "R-101"]);
  await node(page, "F-101").click({ modifiers: ["Control"] });
  await selected(page, ["R-101"]);
  await node(page, "P-101").click({ modifiers: ["Shift"] });
  await selected(page, ["R-101", "P-101"]);
  await node(page, "R-101").click();
  await selected(page, ["R-101"]);
  const edge = page.locator('.react-flow__edge[data-id="s1"]');
  const point = await edge
    .locator(".react-flow__edge-path")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() * 0.5);
      const screen = new DOMPoint(p.x, p.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: screen.x, y: screen.y };
    });
  await page.mouse.click(point.x, point.y);
  await expect(edge).toHaveClass(/selected/);
  await expect(page.locator(".properties-dialog[open]")).toHaveCount(0);
  await selected(page, []);
  await page.mouse.dblclick(point.x, point.y);
  await expect(
    page.getByRole("textbox", { name: "Stream name" }),
  ).toBeVisible();
});

test("hand and Space panning move the camera over equipment without moving or clearing selection", async ({
  page,
}) => {
  const reactor = node(page, "R-101");
  const pan = page.getByRole("button", { name: "Pan canvas", exact: true });
  const pane = page.locator(".react-flow__pane");
  await reactor.click();
  const position = await reactor.getAttribute("style");
  for (const mode of ["hand", "space"]) {
    if (mode === "hand") await pan.click();
    else {
      await page.getByLabel("2D process canvas", { exact: true }).focus();
      await page.keyboard.down("Space");
    }
    await expect(pan).toHaveAttribute("aria-pressed", "true");
    await expect(pane).toHaveCSS("cursor", /grab\.svg.*8 8, grab$/);
    await pane.click({ position: { x: 700, y: 150 } });
    await selected(page, ["R-101"]);
    const before = await camera(page);
    const box = (await reactor.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 40,
      { steps: 8 },
    );
    await expect(pane).toHaveCSS("cursor", /grabbing\.svg.*8 8, grabbing$/);
    await page.mouse.up();
    await expect.poll(() => camera(page)).not.toBe(before);
    await expect(reactor).toHaveAttribute("style", position!);
    await selected(page, ["R-101"]);
    if (mode === "hand") await pan.click();
    else await page.keyboard.up("Space");
    await expect(pane).toHaveCSS("cursor", "default");
  }
  await expect(page.locator(".react-flow__controls-button svg")).toHaveCount(4);
  for (const icon of await page
    .locator(".react-flow__controls-button svg")
    .all())
    await expect(icon).toHaveCSS("fill", "none");
  await page.screenshot({ path: "test-results/canvas-selection-controls.png" });
});

test("pull tab animates on hover, bridges pointer travel, pins on click and supports keyboard dismissal", async ({
  page,
}) => {
  const tab = page.getByRole("button", { name: "Workspace menu", exact: true });
  const menu = page.getByRole("navigation", { name: "Workspace", exact: true });
  const view = await camera(page);
  await tab.hover();
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  await expect(tab).toHaveCSS("width", "34px");
  await expect(tab.locator("svg").last()).toHaveCSS(
    "transform",
    "matrix(-1, 0, 0, -1, 0, 0)",
  );
  const bounds = (await tab.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width + 5,
    bounds.y + bounds.height / 2,
  );
  await expect(menu).toBeVisible();
  await menu
    .getByRole("button", { name: "Storage settings", exact: true })
    .hover();
  await expect(menu).toBeVisible();
  await page.mouse.move(700, 170);
  await expect(menu).toHaveCount(0);
  await tab.click();
  await page.mouse.move(700, 170);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(tab).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    menu.getByRole("button", { name: "Equipment", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Equipment", exact: true }),
  ).toBeVisible();
  await expect(menu).toHaveCount(0);
  expect(await camera(page)).toBe(view);
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tab.hover();
  await expect(tab).toHaveCSS("transition-duration", "0s");
  await expect(menu).toHaveCSS("animation-name", "none");
  await page.screenshot({ path: "test-results/canvas-pull-tab.png" });
});

test.describe("touch canvas", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("touch opens the pull tab and drags the canvas without a selection marquee", async ({
    page,
  }) => {
    const tab = page.getByRole("button", {
      name: "Workspace menu",
      exact: true,
    });
    const menu = page.getByRole("navigation", {
      name: "Workspace",
      exact: true,
    });
    await expect(
      page.getByRole("button", { name: "Pan canvas", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".navigation-hint")).toHaveText(
      "Drag to pan · Pinch to zoom",
    );
    await tab.tap();
    await expect(menu).toBeVisible();
    await menu
      .getByRole("button", { name: "Storage settings", exact: true })
      .tap();
    await expect(
      page.getByRole("complementary", {
        name: "Storage settings",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close Storage settings", exact: true })
      .tap();
    const before = await camera(page);
    const input = await page.context().newCDPSession(page);
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 200, y: 250 }],
    });
    await input.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 240, y: 280 }],
    });
    await input.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect.poll(() => camera(page)).not.toBe(before);
    await expect(page.locator(".react-flow__selection")).toHaveCount(0);
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await input.detach();
  });
});
