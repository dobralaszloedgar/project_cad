import { test, expect } from "@playwright/test";
import { distillationExample, reactorExample } from "../../src/domain/examples";
import { ports } from "../../src/domain/schema";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
});

test("left pull tabs switch and collapse without blocking the canvas", async ({
  page,
}) => {
  const tabs = page.getByRole("navigation", { name: "Workspace panels" });
  await expect(tabs.getByRole("button")).toHaveCount(3);
  await expect(
    page.getByRole("complementary", { name: "Equipment" }),
  ).toBeVisible();
  await expect(page.getByText("Drag equipment onto the canvas.")).toHaveCount(
    0,
  );
  await expect(page.getByText("Connect the dots to add a stream.")).toHaveCount(
    0,
  );
  await tabs.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Property model")).toBeVisible();
  await expect(page.locator(".workspace-drawer")).toHaveCount(1);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("main.workspace")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(tabs.getByRole("button", { name: "Results" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  await expect(tabs.getByRole("button", { name: "Results" })).toBeFocused();
  await tabs.getByRole("button", { name: "Equipment" }).click();
  await tabs.getByRole("button", { name: "Equipment" }).click();
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-canvas-dark.png" });
});

test("solid stream and arrow colors follow composition before and after simulation", async ({
  page,
}) => {
  const colors = () =>
    page
      .locator(".react-flow__edge")
      .evaluateAll((edges) =>
        Object.fromEntries(
          edges.map((edge) => [
            edge.getAttribute("data-id"),
            getComputedStyle(edge.querySelector(".react-flow__edge-path")!)
              .stroke,
          ]),
        ),
      );
  const initial = await colors();
  expect(initial.s1).not.toBe(initial.s2);
  expect(initial.s2).toBe(initial.s3);
  expect(initial.s3).not.toBe(initial.s4);
  expect(initial.s4).toBe(initial.s5);
  expect(initial.s5).toBe(initial.recycle);
  await expect(page.locator(".react-flow__edge linearGradient")).toHaveCount(0);
  const markerColors = await page
    .locator(".react-flow__edge-path")
    .evaluateAll((paths) =>
      paths.map((path) => {
        const id = path
          .getAttribute("marker-end")!
          .match(/url\(['"]?#(.*?)['"]?\)$/)![1];
        const marker = document.getElementById(id)!;
        return [
          getComputedStyle(path).stroke,
          getComputedStyle(marker.querySelector("polyline")!).stroke,
        ];
      }),
    );
  for (const [line, arrow] of markerColors) expect(arrow).toBe(line);
  await page.getByRole("button", { name: "Run simulation" }).click();
  expect(await colors()).toEqual(initial);
  await page.keyboard.press("Escape");
  await page.getByLabel("Import project file").setInputFiles({
    name: "separation.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(distillationExample())),
  });
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  expect(new Set(Object.values(await colors())).size).toBe(3);
});

test("material handles match equipment roles and cursor stays visible across interactions", async ({
  page,
}) => {
  for (const unit of reactorExample().units) {
    const node = page.locator(`.react-flow__node[data-id="${unit.id}"]`);
    const expected = ports(unit.kind);
    await expect(node.locator(".material-handle.target")).toHaveCount(
      expected.inputs.length,
    );
    await expect(node.locator(".material-handle.source")).toHaveCount(
      expected.outputs.length,
    );
  }
  await expect(
    page.locator('[data-id="P-101"] .equipment-symbol path'),
  ).toHaveCount(2);
  const pane = page.locator(".react-flow__pane");
  const reactor = page.locator('.react-flow__node[data-id="R-101"]');
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle theme" }).click();
    const box = (await reactor.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(reactor).toHaveCSS("cursor", /grab\.svg/);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 30,
      box.y + box.height / 2 + 30,
      { steps: 8 },
    );
    await expect(reactor).toHaveCSS("cursor", /grabbing\.svg/);
    await page.mouse.up();
    await expect(reactor).toHaveCSS("cursor", /grab\.svg/);
    await expect(pane).toHaveCSS("cursor", /grab\.svg/);
    await expect(page.getByLabel("Search equipment")).toHaveCSS(
      "cursor",
      /text\.svg/,
    );
  }
  for (const name of [
    "default",
    "pointer",
    "grab",
    "grabbing",
    "connect",
    "text",
  ])
    expect((await page.request.get(`/cursors/${name}.svg`)).ok()).toBe(true);
});

test("phone pull tabs remain reachable with scrolling panels and no page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const tabs = page.getByRole("navigation", { name: "Workspace panels" });
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  for (const name of ["Equipment", "Settings", "Results"]) {
    await tabs.getByRole("button", { name }).click();
    const panel = page.getByRole("complementary", { name });
    await expect(panel).toBeVisible();
    const rect = (await panel.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(44);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await expect(tabs.getByRole("button", { name: "Equipment" })).toBeVisible();
  }
  await tabs.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.screenshot({ path: "test-results/pull-tabs-mobile.png" });
});
