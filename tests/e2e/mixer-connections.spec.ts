// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { loadProject } from "./project-fixture";
import { expect, test, type Locator, type Page } from "./test";
import { newUnit, type Project } from "../../src/domain/schema";
import { fourBranchProject } from "../helpers/four-branch-project";

async function distinctEndpoints(page: Page, prefix: string, end: boolean) {
  return page
    .locator(`.react-flow__edge[data-id^="${prefix}"] .react-flow__edge-path`)
    .evaluateAll(
      (elements, end) =>
        new Set(
          elements.map((element) => {
            const path = element as SVGPathElement;
            const point = path.getPointAtLength(
              end ? path.getTotalLength() : 0,
            );
            return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
          }),
        ).size,
      end,
    );
}

test("four distinct branches survive arrange, fraction edits, 3D and reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[React Flow]")) warnings.push(message.text());
  });
  await page.goto("/workspace");
  await loadProject(page, fourBranchProject(true));
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect.poll(() => distinctEndpoints(page, "feed-", true)).toBe(4);
  await expect.poll(() => distinctEndpoints(page, "product-", false)).toBe(4);
  await page.screenshot({
    path: "test-results/four-branches-2d.png",
    fullPage: true,
  });

  await page.locator('.react-flow__node[data-id="S"]').dblclick();
  for (let index = 0; index < 4; index++)
    await page
      .getByLabel(`Outlet ${index + 1} fraction`, { exact: true })
      .fill(String((4 - index) / 10));
  await page
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".plant-view")).toHaveAttribute(
    "data-stream-count",
    "9",
    { timeout: 30000 },
  );
  await expect(page.locator(".plant-label")).toHaveCount(10, {
    timeout: 30000,
  });
  await page.screenshot({
    path: "test-results/four-branches-3d.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "2D flowsheet", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect.poll(() => distinctEndpoints(page, "feed-", true)).toBe(4);
  await expect.poll(() => distinctEndpoints(page, "product-", false)).toBe(4);
  await page.locator('.react-flow__node[data-id="S"]').dblclick();
  for (let index = 0; index < 4; index++)
    await expect(
      page.getByLabel(`Outlet ${index + 1} fraction`, { exact: true }),
    ).toHaveValue(String((4 - index) / 10));
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("a full mixer rejects a fifth branch", async ({ page }) => {
  const project = fourBranchProject();
  project.units.push(newUnit("Feed", "F-5", 0, 720));
  await page.goto("/workspace");
  await loadProject(page, project);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const source = page.getByLabel("F-5 outlet out", { exact: true });
  await wireToCenter(
    page,
    source,
    page.locator('.react-flow__node[data-id="M"]'),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(9);
  await expect(source).toHaveClass(/\bconnectable\b/);
  for (const port of ["in", "in2", "in3", "in4"])
    await expect(
      page.getByLabel(`M inlet ${port}`, { exact: true }),
    ).not.toHaveClass(/\bconnectable\b/);
});

async function wireToCenter(page: Page, source: Locator, target: Locator) {
  // Fit View animates the viewport; wait for the handle to stop moving first.
  await source.hover();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).toBeTruthy();
  expect(to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
}

test("mixer center accepts four stream drops, persists and simulates all feeds", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[React Flow]")) warnings.push(message.text());
  });
  const project: Project = {
    version: 1,
    name: "Mixer center connections",
    units: [
      ...[0, 1, 2, 3].map((index) =>
        newUnit("Feed", `F-${index + 1}`, 0, index * 170),
      ),
      newUnit("Mixer", "M-center", 330, 250),
      newUnit("Product", "P-out", 660, 250),
    ],
    edges: [
      {
        id: "product",
        source: "M-center",
        target: "P-out",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await loadProject(page, project);
  await expect(page.locator(".project-heading h1")).toHaveText(project.name);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const mixer = page.locator('.react-flow__node[data-id="M-center"]');
  for (let index = 1; index <= 4; index++) {
    const source = page.getByLabel(`F-${index} outlet out`, { exact: true });
    if (index === 4) {
      await wireToCenter(
        page,
        source,
        page.getByLabel("P-out inlet in", { exact: true }),
      );
      await expect(page.locator(".react-flow__edge")).toHaveCount(4);
    }
    await wireToCenter(page, source, mixer);
    await expect(page.locator(".react-flow__edge")).toHaveCount(index + 1);
    await expect(source).not.toHaveClass(/\bconnectable\b/);
  }

  const streamPoint = await page
    .getByRole("group", { name: "Stream 5", exact: true })
    .locator(".react-flow__edge-interaction")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path
        .getPointAtLength(20)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
  await page.mouse.dblclick(streamPoint.x, streamPoint.y);
  await page
    .getByRole("button", { name: "Remove stream", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  // Occupied mixer inlet handles remain usable as well as the center drop area.
  const fourthSource = page.getByLabel("F-4 outlet out", { exact: true });
  await expect(fourthSource).toHaveClass(/\bconnectable\b/);
  await wireToCenter(
    page,
    fourthSource,
    page.getByLabel("M-center inlet in2", { exact: true }),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);

  // The invisible drop area must not block normal equipment dragging.
  const before = await mixer.boundingBox();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 60,
    before!.y + before!.height / 2 + 30,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await mixer.boundingBox())!.x)
    .toBeGreaterThan(before!.x + 25);
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(
    page
      .locator(".stream-table tbody tr")
      .filter({ hasText: "Stream 1" })
      .locator("td")
      .nth(1),
  ).toHaveText("144");
  await page.screenshot({
    path: "test-results/mixer-center.png",
    fullPage: true,
  });
  expect(warnings).toEqual([]);
});
