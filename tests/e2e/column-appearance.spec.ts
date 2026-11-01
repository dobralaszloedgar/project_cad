import { test, expect } from "./test";
import { loadProject } from "./project-fixture";
import { distillationExample } from "../../src/domain/examples";

test("2D column grows with tray edits and keeps live stream handles attached", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, distillationExample());
  const node = page.locator('.react-flow__node[data-id="D-201"]');
  const trays = node.locator("[data-column-tray]");
  await expect(trays).toHaveCount(8);
  for (const name of [
    "condenser",
    "reflux-receiver",
    "reflux-splitter",
    "reboiler",
  ])
    await expect(node.locator(`[data-column-equipment="${name}"]`)).toHaveCount(
      1,
    );
  const heights: number[] = [];
  for (const count of [24, 80, 2]) {
    await node.locator(".unit-tag").click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await page
      .getByLabel("Visible trays (2D & 3D)", { exact: true })
      .fill(String(count));
    await page.getByRole("button", { name: "Apply conditions" }).click();
    await page.keyboard.press("Escape");
    await expect(trays).toHaveCount(count);
    await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
    await page.keyboard.press("f");
    const drawing = await node.evaluate((element) => {
      const svg = element.querySelector("svg")!;
      const body = element.querySelector<HTMLElement>(".equipment-node")!;
      const bbox = svg.getBBox();
      return {
        height: body.offsetHeight,
        viewHeight: svg.viewBox.baseVal.height,
        width: body.offsetWidth,
        bottom: bbox.y + bbox.height,
      };
    });
    expect(drawing.width).toBe(128);
    expect(drawing.height).toBeCloseTo(drawing.viewHeight, 0);
    expect(drawing.bottom).toBeLessThan(drawing.height);
    heights.push(drawing.height);
    // Check rendered edges against DOM handles after ResizeObserver / React Flow updates.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const host = document.querySelector(
            '.react-flow__node[data-id="D-201"]',
          )!;
          const distances = ["out", "out2"].map((id, index) => {
            const handle = host
              .querySelector(`[data-handleid="${id}"]`)!
              .getBoundingClientRect();
            const edge = document.querySelector<SVGPathElement>(
              `.react-flow__edge[data-id="${index ? "bottoms" : "distillate"}"] .react-flow__edge-path`,
            )!;
            const start = edge.getPointAtLength(0);
            const point = new DOMPoint(start.x, start.y).matrixTransform(
              edge.getScreenCTM()!,
            );
            return Math.hypot(
              point.x - handle.right,
              point.y - (handle.top + handle.height / 2),
            );
          });
          return Math.max(...distances);
        }),
      )
      .toBeLessThan(0.5);
    await page.screenshot({
      path: `test-results/column-2d-${count}-trays.png`,
    });
  }
  expect(heights[1]).toBeGreaterThan(heights[0]);
  expect(heights[2]).toBeLessThan(heights[0]);
  await page.reload();
  await expect(trays).toHaveCount(2);
  expect(errors).toEqual([]);
});
