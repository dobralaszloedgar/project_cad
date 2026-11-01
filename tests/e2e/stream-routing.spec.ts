import { newUnit, type Project } from "../../src/domain/schema";
import { loadProject } from "./project-fixture";
import { settleCanvas } from "./canvas-fixture";
import { expect, test } from "./test";

test("a stream clears a tall column and straightens when the column is moved", async ({
  page,
}) => {
  const column = newUnit("Distillation", "D-101", 360, -100);
  column.params.trayCount = 80;
  const project: Project = {
    version: 1,
    name: "Routing around a column",
    units: [
      newUnit("Feed", "F-101", 0, 110),
      column,
      newUnit("Product", "P-101", 800, 110),
    ],
    edges: [
      {
        id: "s1",
        name: "Bypass",
        source: "F-101",
        sourcePort: "out",
        target: "P-101",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, project);
  const edge = page.locator(
    '.react-flow__edge[data-id="s1"] .react-flow__edge-path',
  );
  await expect(edge).toHaveAttribute("d", /Q/);
  const path = await edge.getAttribute("d");
  // Inspect the rendered curve, including its rounded corners, in canvas units.
  expect(
    await edge.evaluate((element) => {
      const path = element as SVGPathElement;
      for (let distance = 0; distance <= path.getTotalLength(); distance += 2) {
        const point = path.getPointAtLength(distance);
        if (point.x > 352 && point.x < 496 && point.y > -158 && point.y < 368)
          return false;
      }
      return true;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await settleCanvas(page);
  await expect(edge).toHaveAttribute("d", path!);
  await page.screenshot({ path: "test-results/stream-routing-column.png" });

  const node = page.locator('.react-flow__node[data-id="D-101"]');
  const box = (await node.boundingBox())!;
  const scale = box.width / 128;
  const x = box.x + box.width / 2;
  const y = box.y + 100 * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 400 * scale, { steps: 12 });
  await page.mouse.up();
  await expect(edge).not.toHaveAttribute("d", /Q/);
  await expect
    .poll(() =>
      edge.evaluate((element) => (element as SVGPathElement).getTotalLength()),
    )
    .toBe(679);
  await expect(
    page.locator('.react-flow__edge[data-id="s1"] .stream-label text'),
  ).toHaveText("Bypass");
  expect(errors).toEqual([]);
});
