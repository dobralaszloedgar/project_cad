// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { newUnit, type Kind, type Project } from "../../src/domain/schema";
import { loadProject } from "./project-fixture";
import { settleCanvas } from "./canvas-fixture";
import { expect, test, type Page } from "./test";

function fixture(targetKind: Kind = "Heater"): Project {
  return {
    version: 1,
    name: "Reconnect streams",
    units: [
      newUnit("Splitter", "Source", 0, 0),
      newUnit(targetKind, "Original", 350, 0),
      newUnit("Cooler", "Destination", 650, 220),
    ],
    edges: [
      {
        id: "stream",
        name: "Named stream",
        source: "Source",
        sourcePort: "out2",
        target: "Original",
        targetPort: "in",
        color: "amber",
        colorIndex: 3,
      },
    ],
  };
}

async function savedProject(page: Page) {
  return page.evaluate(
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
}

async function headPosition(page: Page, distance = 2, offset = 0) {
  // Measure the visible stream, not the invisible reconnection hit target.
  return page
    .locator('.react-flow__edge[data-id="stream"] .react-flow__edge-path')
    .evaluate(
      (element, { distance, offset }) => {
        const path = element as SVGPathElement;
        const length = path.getTotalLength();
        const matrix = path.getScreenCTM()!;
        const head = path.getPointAtLength(length).matrixTransform(matrix);
        const behind = path
          .getPointAtLength(length - 1)
          .matrixTransform(matrix);
        const scale = Math.hypot(behind.x - head.x, behind.y - head.y);
        const dx = (behind.x - head.x) / scale;
        const dy = (behind.y - head.y) / scale;
        return {
          x: head.x + dx * distance - dy * offset,
          y: head.y + dy * distance + dx * offset,
        };
      },
      { distance, offset },
    );
}

async function dragHead(
  page: Page,
  target: string | { x: number; y: number },
  distance = 2,
  offset = 0,
) {
  const from = await headPosition(page, distance, offset);
  const box =
    typeof target === "string"
      ? (await page
          .locator(`.react-flow__node[data-id="${target}"]`)
          .boundingBox())!
      : null;
  const to = box
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : (target as { x: number; y: number });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await expect(page.locator(".react-flow__connection")).toBeVisible();
  await page.mouse.up();
}

for (const scenario of [
  { kind: "Heater", distance: 2, offset: 0, zoomOut: false },
  { kind: "Heater", distance: 22, offset: 12, zoomOut: true },
  { kind: "PBR", distance: 2, offset: 0, zoomOut: false },
  { kind: "PBR", distance: 22, offset: 12, zoomOut: true },
] as const) {
  test(`drag ${scenario.kind} stream ${scenario.distance === 2 ? "head" : "near head at lower zoom"} to different equipment`, async ({
    page,
  }) => {
    const project = fixture(scenario.kind);
    await loadProject(page, project);
    if (scenario.zoomOut) {
      await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
      await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
    }
    await settleCanvas(page);
    // A selected receiving unit must not cover the stream's grab target.
    await page.locator('.react-flow__node[data-id="Original"]').click();
    await dragHead(page, "Destination", scenario.distance, scenario.offset);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    const reconnected = [{ ...project.edges[0], target: "Destination" }];
    await expect
      .poll(async () => (await savedProject(page)).edges)
      .toEqual(reconnected);
    expect((await savedProject(page)).units).toEqual(project.units);
    await page.keyboard.press("Control+z");
    await expect
      .poll(async () => (await savedProject(page)).edges)
      .toEqual(project.edges);
    await page.keyboard.press("Control+Shift+z");
    await expect
      .poll(async () => (await savedProject(page)).edges)
      .toEqual(reconnected);
    await page.reload();
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(
      page.getByLabel("Destination inlet in", { exact: true }),
    ).not.toHaveClass(/\bconnectable\b/);
    await expect(
      page.getByLabel("Original inlet in", { exact: true }),
    ).toHaveClass(/\bconnectable\b/);
  });
}

test("releasing an unconnected head deletes the stream, and undo restores it", async ({
  page,
}) => {
  const project = fixture();
  await loadProject(page, project);
  await settleCanvas(page);
  const canvas = (await page
    .getByLabel("2D process canvas", { exact: true })
    .boundingBox())!;
  await dragHead(page, {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + canvas.height - 90,
  });
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect.poll(async () => (await savedProject(page)).edges).toEqual([]);
  await expect(
    page.getByLabel("Source outlet out2", { exact: true }),
  ).toHaveClass(/\bconnectable\b/);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await savedProject(page)).edges)
    .toEqual(project.edges);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Clicking a head without dragging still just selects the stream.
  const head = await headPosition(page);
  await page.mouse.click(head.x, head.y);
  await expect(page.locator('.react-flow__edge[data-id="stream"]')).toHaveClass(
    /selected/,
  );
  await expect
    .poll(async () => (await savedProject(page)).edges)
    .toEqual(project.edges);
  await dragHead(page, "Original");
  await expect
    .poll(async () => (await savedProject(page)).edges)
    .toEqual(project.edges);
});

test("invalid drops delete only the dragged stream", async ({ page }) => {
  const project = fixture();
  project.units.push(newUnit("Feed", "Feed", 0, 220));
  project.edges.push({
    id: "occupied",
    source: "Feed",
    sourcePort: "out",
    target: "Destination",
    targetPort: "in",
    color: "teal",
  });
  await loadProject(page, project);
  await settleCanvas(page);
  for (const target of ["Source", "Feed", "Destination"]) {
    await dragHead(page, target);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect
      .poll(async () => (await savedProject(page)).edges.map((edge) => edge.id))
      .toEqual(["occupied"]);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  }
});

test("reconnect to a free mixer inlet and return a stream to a full mixer", async ({
  page,
}) => {
  const project = fixture();
  project.units[2] = newUnit("Mixer", "Destination", 650, 220);
  for (let index = 1; index <= 3; index++) {
    project.units.push(newUnit("Feed", `Feed-${index}`, 0, 180 * index));
    project.edges.push({
      id: `feed-${index}`,
      source: `Feed-${index}`,
      sourcePort: "out",
      target: "Destination",
      targetPort: index === 1 ? "in" : index === 2 ? "in2" : "in3",
      color: "teal",
    });
  }
  await loadProject(page, project);
  await settleCanvas(page);
  await dragHead(page, "Destination");
  await expect
    .poll(async () => (await savedProject(page)).edges[0])
    .toEqual({ ...project.edges[0], target: "Destination", targetPort: "in4" });
  await expect(
    page.getByLabel("Destination connect streams to equipment", {
      exact: true,
    }),
  ).not.toHaveClass(/\bconnectable\b/);
  await dragHead(page, "Destination");
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  await expect
    .poll(async () => (await savedProject(page)).edges[0].targetPort)
    .toBe("in4");
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await savedProject(page)).edges[0])
    .toEqual(project.edges[0]);
});
