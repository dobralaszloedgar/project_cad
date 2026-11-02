import { test, expect } from "./test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { extractText } from "unpdf";
import { reactorExample } from "../../src/domain/examples";
import { presetPreferences } from "../../src/domain/unit-preferences";
import { loadProject } from "./project-fixture";

test("results has a useful empty state, searchable views, expansion and stream inspection", async ({
  page,
}, info) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name: "Results", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Results",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Export results" }),
  ).toBeDisabled();
  await expect(panel.getByText("See the whole picture.")).toBeVisible();
  await panel.getByRole("button", { name: "Calculate results" }).click();
  await expect(panel.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(panel.locator(".kpi").first()).toContainText("77.46%");
  await expect(panel.locator("tbody tr")).toHaveCount(6);
  expect((await panel.boundingBox())!.width).toBeGreaterThan(1100);
  await panel.getByLabel("Search results").fill("F-101");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await panel.getByLabel("Search results").fill("no-such-stream");
  await expect(panel.getByText("No matching results")).toBeVisible();
  await panel
    .getByRole("button", { name: "Clear search", exact: true })
    .click();
  await panel.getByRole("button", { name: "Composition", exact: true }).click();
  await expect(panel.getByRole("table")).toHaveAccessibleName(
    "Composition · mole fractions",
  );
  await expect(panel.locator("thead th")).toHaveCount(3);
  await panel.getByRole("button", { name: "Equipment", exact: true }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(6);
  await expect(panel.getByRole("table")).toHaveAccessibleName(
    "Equipment duties",
  );
  await panel.getByRole("button", { name: "Conditions", exact: true }).click();
  await panel.getByRole("button", { name: "Expand results" }).click();
  await expect(panel.locator(".results")).toHaveAttribute(
    "data-expanded",
    "true",
  );
  await panel.getByRole("button", { name: "Restore results size" }).click();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(1240);
  await panel.locator(".workspace-drawer-content").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath("results-desktop.png") });
  await panel.getByRole("button", { name: "Export results" }).click();
  await expect(
    panel.getByRole("group", { name: "Export formats" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("results-export-menu.png") });
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("group", { name: "Export formats" }),
  ).toHaveCount(0);
  await panel.locator(".results-stream-link").first().click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("dialog[open]")).toBeVisible();
});

test("all five formats download valid, complete data even when the stream table is filtered", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Results",
    exact: true,
  });
  await expect(panel.locator(".diagnostics h3")).toHaveText("Converged");
  await panel.getByLabel("Search results").fill("F-101");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  for (const [format, label] of [
    ["xlsx", "Excel workbook"],
    ["pdf", "PDF report"],
    ["png", "PNG image"],
    ["csv", "CSV data"],
    ["txt", "Text report"],
  ]) {
    await panel.getByRole("button", { name: "Export results" }).click();
    const downloading = page.waitForEvent("download", { timeout: 90_000 });
    await panel.getByRole("button", { name: new RegExp(label) }).click();
    const download = await downloading;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`-results-.*\\.${format}$`),
    );
    const path = info.outputPath(`report.${format}`);
    await download.saveAs(path);
    const buffer = await readFile(path);
    if (format === "xlsx") {
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(path);
      expect(book.getWorksheet("Streams")!.rowCount).toBe(7);
      expect(typeof book.getWorksheet("Streams")!.getCell("E2").value).toBe(
        "number",
      );
      expect(book.getWorksheet("Summary")!.getCell("B4").value).toBe(
        "Converged",
      );
    } else if (format === "pdf") {
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      const pdf = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      expect(pdf.totalPages).toBeGreaterThan(1);
      expect(pdf.text).toContain("Heated reactor with recycle");
      expect(pdf.text).toContain("°C");
      expect(pdf.text).toContain("Composition");
      expect(pdf.text).toContain("Model notes");
    } else if (format === "png") {
      expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(buffer.readUInt32BE(16)).toBeGreaterThanOrEqual(1440);
      expect(buffer.readUInt32BE(20)).toBeGreaterThan(1500);
    } else if (format === "csv") {
      expect(buffer.toString("utf8").trim().split("\r\n")).toHaveLength(7);
      expect(buffer.toString("utf8")).toContain("Flow (kmol/h)");
      expect(buffer.toString("utf8")).toContain("B fraction");
    } else {
      expect(buffer.toString("utf8")).toContain("CONVERGENCE HISTORY");
      expect(buffer.toString("utf8")).toContain("MODEL NOTES");
    }
    await expect(panel.getByRole("status")).toContainText(
      `${format.toUpperCase()} export ready`,
    );
  }
  expect(errors).toEqual([]);
});

test("results stays within mobile bounds, supports dark mode, and exports selected units", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((preferences) => {
    localStorage.setItem(
      "project-cad:unit-preferences",
      JSON.stringify(preferences),
    );
    localStorage.setItem("project-cad.theme", "dark");
  }, presetPreferences("us"));
  await loadProject(page, reactorExample());
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Results",
    exact: true,
  });
  await expect(panel.locator(".diagnostics h3")).toHaveText("Converged");
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await panel
      .locator(".workspace-drawer-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await expect(panel.getByRole("table")).toContainText("°F");
  await page.screenshot({ path: info.outputPath("results-mobile-dark.png") });
  await panel.getByRole("button", { name: "Export results" }).click();
  const menu = panel.getByRole("group", { name: "Export formats" });
  await expect(menu).toBeVisible();
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(box.x);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(box.x + box.width);
  const downloading = page.waitForEvent("download");
  await menu.getByRole("button", { name: /CSV data/ }).click();
  const download = await downloading;
  const path = info.outputPath("us-results.csv");
  await download.saveAs(path);
  const csv = await readFile(path, "utf8");
  expect(csv).toContain("Temperature (°F)");
  expect(csv).toContain("Flow (lbmol/h)");
  expect(csv).toContain("Pressure (psi abs)");
  await panel.getByRole("button", { name: "Close Results" }).click();
  await expect(panel).toHaveCount(0);
});
