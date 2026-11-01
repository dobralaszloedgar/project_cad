import { newUnit, type Kind, type Project } from "../../src/domain/schema";
import { settleCanvas } from "./canvas-fixture";
import { loadProject } from "./project-fixture";
import { expect, test, type Locator, type Page } from "./test";

async function connect(
  page: Page,
  source: Locator,
  target: Locator,
  grab = { x: 0, y: 0 },
  drop = { x: 0.5, y: 0.5 },
) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  // Grab offsets are multiples of the visible dot's radius, including zoom.
  await page.mouse.move(
    from.x + (from.width / 2) * (1 + grab.x),
    from.y + (from.height / 2) * (1 + grab.y),
  );
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * drop.x, to.y + to.height * drop.y, {
    steps: 15,
  });
  await page.mouse.up();
}

const cases: {
  source: Kind;
  target: Kind;
  port: "out" | "out2";
  grab: { x: number; y: number };
  drop: { x: number; y: number };
}[] = [
  {
    source: "Feed",
    target: "Heater",
    port: "out",
    grab: { x: 2.8, y: 0 },
    drop: { x: 0.5, y: 0.5 },
  },
  {
    source: "Splitter",
    target: "Cooler",
    port: "out2",
    grab: { x: -2.8, y: 0 },
    drop: { x: 0.9, y: 0.1 },
  },
  {
    source: "Heater",
    target: "PBR",
    port: "out",
    grab: { x: 0, y: -2.8 },
    drop: { x: 0.8, y: 0.75 },
  },
  {
    source: "PBR",
    target: "Distillation",
    port: "out",
    grab: { x: 0, y: 2.8 },
    drop: { x: 0.75, y: 0.05 },
  },
  {
    source: "Distillation",
    target: "Product",
    port: "out2",
    grab: { x: 2.8, y: 0 },
    drop: { x: 0.8, y: 0.5 },
  },
  {
    source: "Feed",
    target: "Mixer",
    port: "out",
    grab: { x: -2.8, y: 0 },
    drop: { x: 0.9, y: 0.9 },
  },
  // Dropping over the target's outlet still connects to its inlet.
  {
    source: "Feed",
    target: "Splitter",
    port: "out",
    grab: { x: 0, y: -2.8 },
    drop: { x: 120 / 128, y: 40 / 128 },
  },
];

for (const [index, scenario] of cases.entries()) {
  test(`grab near ${scenario.source} ${scenario.port} and drop anywhere on ${scenario.target}`, async ({
    page,
  }) => {
    const project: Project = {
      version: 1,
      name: "Forgiving equipment connections",
      units: [
        newUnit(scenario.source, "Source", 0, 0),
        newUnit(scenario.target, "Target", 360, 0),
      ],
      edges: [],
    };
    await loadProject(page, project);
    if (index % 2) {
      await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
      await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
    }
    await settleCanvas(page);
    const sourceNode = page.locator('.react-flow__node[data-id="Source"]');
    const targetNode = page.locator('.react-flow__node[data-id="Target"]');
    const before = await sourceNode.getAttribute("style");
    const source = page.getByLabel(`Source outlet ${scenario.port}`, {
      exact: true,
    });
    await connect(page, source, targetNode, scenario.grab, scenario.drop);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(sourceNode).toHaveAttribute("style", before!);
    await expect(source).not.toHaveClass(/\bconnectable\b/);
    await expect(page.locator(".save-status")).toContainText(
      "Saved on this device",
    );

    const saved = await page.evaluate(
      () =>
        new Promise<Project>((resolve, reject) => {
          const request = indexedDB.open("project-cad");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const read = database
              .transaction("workspace")
              .objectStore("workspace")
              .get("current");
            read.onsuccess = () => {
              database.close();
              resolve(read.result.project);
            };
            read.onerror = () => {
              database.close();
              reject(read.error);
            };
          };
        }),
    );
    expect(saved.edges).toEqual([
      expect.objectContaining({
        source: "Source",
        target: "Target",
        sourcePort: scenario.port,
        targetPort: "in",
      }),
    ]);
  });
}

test("body drops reject self-connections, feeds, and occupied inlets", async ({
  page,
}) => {
  await loadProject(page, {
    version: 1,
    name: "Connection validation",
    units: [
      newUnit("Heater", "Source", 0, 0),
      newUnit("Feed", "Feed", 0, 240),
      newUnit("Cooler", "Occupied", 360, 0),
      newUnit("Product", "Product", 360, 240),
    ],
    edges: [
      {
        id: "existing",
        source: "Feed",
        target: "Occupied",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  });
  await settleCanvas(page);
  const source = page.getByLabel("Source outlet out", { exact: true });
  for (const id of ["Source", "Feed", "Occupied"]) {
    await connect(
      page,
      source,
      page.locator(`.react-flow__node[data-id="${id}"]`),
    );
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(source).toHaveClass(/\bconnectable\b/);
  }
  await connect(
    page,
    source,
    page.locator('.react-flow__node[data-id="Product"]'),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});
