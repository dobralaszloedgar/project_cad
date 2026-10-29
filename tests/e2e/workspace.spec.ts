import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
const output = "/tmp/project-cad-qa";
test.beforeAll(async () => {
  await fs.mkdir(output, { recursive: true });
});
async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}
async function template(page: Page, name: string) {
  await page.getByRole("button", { name: "Project menu" }).click();
  await page
    .locator(".project-menu")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
}
async function edit(page: Page, id: string) {
  await page.locator(".react-flow__node").filter({ hasText: id }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
}
async function chooseView(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function preferences(page: Page) {
  await page.getByRole("button", { name: "Project menu" }).click();
  await page
    .locator(".project-menu")
    .getByRole("button", { name: "Preferences" })
    .click();
}
test("reactor: calculate, edit, compare, restore, persist and round-trip", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await expect(page).toHaveTitle(/Project CAD/);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".kpi").first()).toContainText("77.46%");
  await closeDialog(page);
  await edit(page, "R-101");
  await page.getByLabel("Temperature (K)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await expect(page.locator(".equipment-result")).toContainText(
    "Calculated results",
  );
  await closeDialog(page);
  await page.getByRole("button", { name: "Open revision history" }).click();
  await page
    .locator(".comparison select")
    .selectOption({ label: "1. Initial example" });
  await expect(page.locator(".comparison")).toContainText("1 modified");
  await expect(page.locator(".delta")).toContainText("77.46%");
  await page
    .locator(".revision-row")
    .filter({ hasText: "Initial example" })
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(page.locator(".revision-row")).toHaveCount(4);
  await closeDialog(page);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".kpi").first()).toContainText("77.46%");
  await page.screenshot({
    path: `${output}/desktop-results.png`,
    fullPage: true,
  });
  await closeDialog(page);
  await page.getByRole("button", { name: "Project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  const json = JSON.parse(await fs.readFile(path!, "utf8"));
  expect(json.project.units).toHaveLength(6);
  expect(json.revisions).toHaveLength(4);
  await template(page, "Blank flowsheet");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.getByLabel("Import project file").setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  expect(errors).toEqual([]);
});
test("3D and split views preserve topology and synchronized editing", async ({
  page,
}) => {
  await start(page);
  await chooseView(page, "3D schematic");
  await expect(page.locator(".plant-view canvas")).toBeVisible();
  await expect(page.locator(".plant-label")).toHaveCount(6);
  await page.locator(".plant-label").filter({ hasText: "S-101" }).click();
  await page.getByLabel("Secondary outlet fraction").fill("0.7");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await closeDialog(page);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await closeDialog(page);
  await chooseView(page, "Split");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.locator(".plant-label")).toHaveCount(6);
  await page.getByRole("button", { name: "Reset camera" }).click();
});
test("simple templates, equipment validation, theme and mobile editing", async ({
  page,
}) => {
  await start(page);
  await template(page, "Simple heating");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".stream-table")).toContainText("400");
  await closeDialog(page);
  await template(page, "Ideal separation");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.locator(".limitations summary").click();
  await expect(page.locator(".limitations")).toContainText("No stage count");
  await closeDialog(page);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByTitle("Add Cooler", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("status")).toContainText("connect");
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete equipment", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".equipment-library")).toHaveCount(0);
  await edit(page, "D-201");
  await expect(page.getByLabel("Relative volatility A/B")).toBeVisible();
  await closeDialog(page);
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle equipment library" }).click();
  await expect(page.getByTitle("Add Feed", { exact: true })).toBeVisible();
});
test("manual editing supports connect, move, double-click, duplicate and delete", async ({
  page,
}) => {
  await start(page);
  await template(page, "Blank flowsheet");
  await page.getByTitle("Add Feed", { exact: true }).click();
  await page.getByTitle("Add Product", { exact: true }).click();
  await page
    .locator(".react-flow__handle.source")
    .first()
    .dragTo(page.locator(".react-flow__handle.target").first());
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await closeDialog(page);
  const feed = page.locator(".react-flow__node").filter({ hasText: "Feed" });
  const box = await feed.boundingBox();
  await page.mouse.move(box!.x + 40, box!.y + 35);
  await page.mouse.down();
  await page.mouse.move(box!.x + 90, box!.y + 60, { steps: 10 });
  await page.mouse.up();
  await feed.dblclick({ delay: 100 });
  await expect(page.getByLabel("Molar flow (mol/s)")).toBeVisible();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Delete equipment", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});
test("invalid import and disabled or cross-origin AI are rejected", async ({
  page,
  request,
  baseURL,
}) => {
  await start(page);
  await page.getByLabel("Import project file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole("status")).toContainText("Invalid project");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "Open Meta assistant" }).click();
  await expect(
    page.getByRole("button", { name: "Generate actions" }),
  ).toBeDisabled();
  expect((await (await request.get("/api/ai")).json()).enabled).toBe(false);
  expect(
    (
      await request.post("/api/ai", {
        data: { prompt: "x" },
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/ai", {
        data: {},
        headers: { Origin: "https://untrusted.invalid" },
      })
    ).status(),
  ).toBe(403);
});
test("reviewed Meta action UI applies a test-only proposal and rejects stale proposals", async ({
  page,
}) => {
  await page.route("**/api/ai", (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? { enabled: true, model: "muse-spark-1.3" }
          : {
              model: "muse-spark-1.3",
              plan: {
                summary: "Test-only proposal: raise reactor temperature.",
                actions: [
                  { type: "update", id: "R-101", params: { temperature: 500 } },
                ],
              },
            },
    }),
  );
  await start(page);
  await page.getByRole("button", { name: "Open Meta assistant" }).click();
  await page
    .getByLabel("Process prompt")
    .fill("Set the reactor temperature to 500 K.");
  await page.getByRole("button", { name: "Generate actions" }).click();
  await expect(
    page.getByRole("dialog", { name: "Review Meta proposal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply reviewed actions" }).click();
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await edit(page, "R-101");
  await expect(page.getByLabel("Temperature (K)", { exact: true })).toHaveValue(
    "500",
  );
  await closeDialog(page);
  await page.getByRole("button", { name: "Open Meta assistant" }).click();
  await page
    .getByLabel("Process prompt")
    .fill("Set the reactor temperature to 500 K.");
  await page.getByRole("button", { name: "Generate actions" }).click();
  await page.getByTitle("Add Feed", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply reviewed actions" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("dialog", { name: "Review Meta proposal" }),
  ).toContainText("Project changed");
});
test("WebGL failure leaves a usable 2D project", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await start(page);
  await chooseView(page, "3D schematic");
  await expect(page.locator(".plant-view")).toContainText(/unavailable/);
  await chooseView(page, "2D flowsheet");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
});
test("clear local history requires confirmation and persists an empty project", async ({
  page,
}) => {
  await start(page);
  await preferences(page);
  await page
    .getByRole("button", { name: "Clear local project & history" })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await preferences(page);
  await page
    .getByRole("button", { name: "Clear local project & history" })
    .click();
  await page
    .getByRole("button", { name: "Clear project", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("cleared");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Untitled process",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
});
