import { loadProject } from "./project-fixture";
import { test, expect } from "./test";
import { distillationExample, reactorExample } from "../../src/domain/examples";
import { ports } from "../../src/domain/schema";

test.beforeEach(async ({ page }) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
});

test("left edge tab opens the workspace menu without moving the canvas", async ({
  page,
}) => {
  const tabs = page.getByRole("navigation", { name: "Workspace panels" });
  const pullTab = page.getByRole("button", {
    name: "Workspace menu",
    exact: true,
  });
  const menu = page.getByRole("navigation", { name: "Workspace", exact: true });
  await expect(tabs.getByRole("button")).toHaveCount(2);
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  const canvas = (await page.locator(".canvas-panel").boundingBox())!;
  // Wait for the initial fit before comparing panel actions with this camera.
  await expect(page.locator(".react-flow__viewport")).not.toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  const viewport = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  const tabBox = (await pullTab.boundingBox())!;
  expect(tabBox.x).toBe(canvas.x);
  expect(tabBox.y + tabBox.height / 2).toBeCloseTo(
    canvas.y + canvas.height / 2,
    0,
  );
  await pullTab.click();
  await expect(pullTab).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("button")).toHaveText([
    "Equipment",
    "Results",
    "Components",
    "Thermodynamics",
    "Toggle chat",
    "Storage settings",
    "Settings",
  ]);
  await expect(page.getByText("Drag equipment onto the canvas.")).toHaveCount(
    0,
  );
  await expect(page.getByText("Connect the dots to add a stream.")).toHaveCount(
    0,
  );
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export project", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-drawer")).toHaveCount(1);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(tabs.getByRole("button", { name: "Results" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  await expect(pullTab).toBeFocused();
  await tabs.getByRole("button", { name: "Equipment" }).click();
  await tabs.getByRole("button", { name: "Equipment" }).click();
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-canvas.png" });
  expect(
    await page.locator(".react-flow__viewport").getAttribute("style"),
  ).toBe(viewport);
  await pullTab.click();
  await page.screenshot({ path: "test-results/workspace-menu.png" });
  await menu.getByRole("button", { name: "Storage settings" }).click();
  await expect(
    page.getByRole("button", { name: "Export project", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await pullTab.click();
  await menu.getByRole("button", { name: "Toggle chat" }).click();
  await expect(page.locator(".assistant-drawer")).toBeVisible();
  await pullTab.click();
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Settings", exact: true })
    .getByRole("heading", { name: "Assistant", exact: true })
    .click();
  await expect(page.locator(".assistant-drawer")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Show assistant", exact: true })
    .click();
  await expect(page.locator(".assistant-drawer")).toBeVisible();
  await pullTab.click();
  await menu.getByRole("button", { name: "Toggle chat" }).click();
  await expect(page.locator(".assistant-drawer")).not.toBeVisible();
  await pullTab.click();
  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 700, y: 150 } });
  await expect(menu).toHaveCount(0);
  await pullTab.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(pullTab).toBeFocused();
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
  await loadProject(page, distillationExample());
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  expect(new Set(Object.values(await colors())).size).toBe(3);
});

test("material handles match equipment roles and cursors use the shared drag hands", async ({
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
  const box = (await reactor.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(reactor).toHaveCSS(
    "cursor",
    /url\(.*\/cursors\/grab\.svg.*\) 8 8, grab$/,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await expect(reactor).toHaveCSS(
    "cursor",
    /url\(.*\/cursors\/grabbing\.svg.*\) 8 8, grabbing$/,
  );
  await page.mouse.up();
  await expect(reactor).toHaveCSS(
    "cursor",
    /url\(.*\/cursors\/grab\.svg.*\) 8 8, grab$/,
  );
  await expect(pane).toHaveCSS("cursor", "default");
  await page.keyboard.press("p");
  await expect(pane).toHaveCSS(
    "cursor",
    /url\(.*\/cursors\/grab\.svg.*\) 8 8, grab$/,
  );
  await page.keyboard.press("v");
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await expect(page.getByLabel("Search equipment")).toHaveCSS("cursor", "text");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Workspace menu", exact: true }),
  ).toHaveCSS("cursor", "pointer");
  await expect(page.locator("main.workspace")).toHaveCSS("cursor", "default");
});

test("phone pull tab and panels remain reachable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const pullTab = page.getByRole("button", {
    name: "Workspace menu",
    exact: true,
  });
  const menu = page.getByRole("navigation", { name: "Workspace", exact: true });
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  for (const name of ["Equipment", "Settings", "Results"]) {
    await pullTab.click();
    await menu.getByRole("button", { name, exact: true }).click();
    const panel = page.getByRole("complementary", { name });
    await expect(panel).toBeVisible();
    const rect = (await panel.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(44);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await expect(pullTab).toBeVisible();
  }
  await pullTab.click();
  await menu.getByRole("button", { name: "Storage settings" }).click();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(page.locator(".assistant-drawer")).toBeVisible();
  await expect(page.locator(".workspace-drawer")).toHaveCount(0);
  await pullTab.click();
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Settings" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-drawer")).not.toBeVisible();
  await pullTab.click();
  await page.screenshot({ path: "test-results/pull-tabs-mobile.png" });
});
