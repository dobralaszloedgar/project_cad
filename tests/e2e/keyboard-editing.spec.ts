import { expect, test } from "./test";

test.beforeEach(async ({ page }) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(
    page.locator('.react-flow__node[data-id="R-101"]'),
  ).toBeVisible();
});

test("selection, clipboard, undo, redo, delete and editor shortcuts work", async ({
  page,
}) => {
  const nodes = page.locator(".react-flow__node");
  const count = await nodes.count();
  await page.locator('.react-flow__node[data-id="F-101"]').click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+a");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(count);
  await page.keyboard.press("Control+d");
  await expect(nodes).toHaveCount(count * 2);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(count);
  await page.keyboard.press("Control+v");
  await expect(nodes).toHaveCount(count * 2 + 1);
  await page.keyboard.press("Control+z");
  await expect(nodes).toHaveCount(count * 2);
  await page.keyboard.press("Control+Shift+z");
  await expect(nodes).toHaveCount(count * 2 + 1);
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await expect(nodes).toHaveCount(0);
  await page.keyboard.press("Meta+z");
  await expect(nodes).toHaveCount(count * 2 + 1);
  await page.keyboard.press("Control+z");
  await expect(nodes).toHaveCount(count * 2);
  await page.keyboard.press("Control+z");
  await expect(nodes).toHaveCount(count);
  await page.keyboard.press("f");
  await page.locator('.react-flow__node[data-id="F-101"]').click();
  await page.keyboard.press("e");
  const editor = page.locator(".properties-dialog[open]");
  await expect(editor).toBeVisible();
  const name = editor.getByLabel("Equipment name");
  await name.fill("");
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-id="F-101"] .unit-name')).toHaveText("Feed");
  await name.fill("Renamed feed");
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+q");
  await expect(editor).not.toBeVisible();
  await expect(page.locator('[data-id="F-101"] .unit-name')).toHaveText(
    "Renamed feed",
  );
  await page.keyboard.press("F2");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Molar flow (kmol/h)", { exact: true }).fill("45");
  await page.keyboard.press("Control+Shift+Enter");
  await expect(editor.locator(".equipment-result")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("navigation shortcuts do not interfere with text fields or dialogs", async ({
  page,
}) => {
  const canvas = page.getByLabel("2D process canvas", { exact: true });
  const viewport = page.locator(".react-flow__viewport");
  const camera = () =>
    viewport.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    });
  await canvas.focus();
  const before = await camera();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await camera()).x).toBeCloseTo(before.x - 64);
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await camera()).y).toBeCloseTo(before.y - 256);
  await page.keyboard.press("Equal");
  await expect
    .poll(async () => (await camera()).zoom)
    .toBeGreaterThan(before.zoom);
  await page.keyboard.press("g");
  await expect(page.locator(".react-flow__background")).toHaveCount(0);
  await page.keyboard.press("l");
  await expect(page.locator('[data-id="F-101"] .unit-name')).toBeHidden();
  await page.keyboard.press("p");
  await expect(
    page.getByRole("button", { name: "Pan canvas", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await page.keyboard.press("a");
  const search = page.getByRole("searchbox", { name: "Search equipment" });
  await expect(search).toBeFocused();
  const stable = await camera();
  await search.fill("reactor");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Minus");
  expect(await camera()).toEqual(stable);
  await page.keyboard.press("Control+q");
  await page.keyboard.press("?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  expect(await camera()).toEqual(stable);
  await page.keyboard.press("Escape");
  await canvas.focus();
  await page.keyboard.press("Control+Enter");
  await expect(
    page.getByRole("complementary", { name: "Results", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("r");
  await expect(
    page.getByRole("complementary", { name: "Results", exact: true }),
  ).not.toBeVisible();
});

test("reactor has no side inlet and view controls sit beside Edit and Arrange", async ({
  page,
}, info) => {
  const reactor = page.locator('.react-flow__node[data-id="R-101"]');
  await expect(
    reactor.locator('.react-flow__handle[data-handleid="in"]'),
  ).toHaveCount(1);
  await expect(
    reactor.locator('.react-flow__handle[data-handleid="in2"]'),
  ).toHaveCount(0);
  for (const width of [1536, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const view = (await page.locator(".canvas-view-controls").boundingBox())!;
    const edit = (await page.locator(".canvas-edit-tools").boundingBox())!;
    expect(Math.abs(view.y - edit.y)).toBeLessThan(2);
    expect(edit.x - view.x - view.width).toBeGreaterThanOrEqual(5);
    expect(edit.x - view.x - view.width).toBeLessThanOrEqual(10);
    expect(edit.x + edit.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`toolbar-${width}.png`) });
  }
});
