import { expect, test, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { reactorExample } from "../../src/domain/examples";

const storageKey = "project-cad:unit-preferences";

async function openUnits(page: Page) {
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Units", exact: true })
    .click();
  return page.getByRole("region", { name: "Engineering units", exact: true });
}

async function inspectFeed(page: Page) {
  await page.locator('.react-flow__node[data-id="F-101"]').click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  return page.getByRole("dialog");
}

test("unit presets, custom quantities and defaults persist and fit desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const panel = await openUnits(page);
  await expect(panel.getByLabel("Unit system", { exact: true })).toHaveValue(
    "metric",
  );
  await expect(panel.getByLabel("Temperature display unit")).toHaveValue(
    "degC",
  );
  await expect(
    panel.getByLabel("Pressure display unit", { exact: true }),
  ).toHaveValue("bar");
  await expect(panel.locator(".units-grid select")).toHaveCount(29);
  await page.screenshot({ path: "test-results/engineering-units-desktop.png" });
  await panel.getByLabel("Unit system", { exact: true }).selectOption("us");
  await expect(panel.getByLabel("Temperature display unit")).toHaveValue(
    "degF",
  );
  await expect(panel.getByLabel("Molar flow display unit")).toHaveValue(
    "lbmol/h",
  );
  await panel.getByLabel("Temperature display unit").selectOption("K");
  await panel
    .getByLabel("Pressure display unit", { exact: true })
    .selectOption("psig");
  await expect(panel.getByLabel("Unit system", { exact: true })).toHaveValue(
    "custom",
  );
  await page.reload();
  await openUnits(page);
  await expect(panel.getByLabel("Temperature display unit")).toHaveValue("K");
  await expect(
    panel.getByLabel("Pressure display unit", { exact: true }),
  ).toHaveValue("psig");
  await panel.getByRole("button", { name: "Reset to US customary" }).click();
  await expect(panel.getByLabel("Unit system", { exact: true })).toHaveValue(
    "us",
  );
  await panel.getByRole("button", { name: "Restore defaults" }).click();
  await expect(panel.getByLabel("Unit system", { exact: true })).toHaveValue(
    "metric",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/engineering-units-mobile.png" });
  await panel
    .getByLabel("Time display unit", { exact: true })
    .selectOption("min");
  await expect(
    panel.getByLabel("Time display unit", { exact: true }),
  ).toHaveValue("min");
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

test("display changes preserve process values and converted inputs save in SI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadProject(page, reactorExample());
  let editor = await inspectFeed(page);
  await expect(
    editor.getByLabel("Temperature (°C)", { exact: true }),
  ).toHaveValue("26.85");
  await expect(editor.getByLabel("Pressure (bar abs)")).toHaveValue("1.01325");
  await expect(editor.getByLabel("Molar flow (kmol/h)")).toHaveValue("36");
  await page.keyboard.press("Escape");
  let panel = await openUnits(page);
  await panel.getByLabel("Unit system", { exact: true }).selectOption("us");
  await page.keyboard.press("Escape");
  editor = await inspectFeed(page);
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByLabel("Temperature (°F)", { exact: true }),
  ).toHaveValue("80.33");
  await editor.getByLabel("Temperature (°F)", { exact: true }).fill("32");
  await editor.getByRole("button", { name: "Apply conditions" }).click();
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  panel = await openUnits(page);
  await panel.getByLabel("Unit system", { exact: true }).selectOption("si");
  await page.keyboard.press("Escape");
  editor = await inspectFeed(page);
  await expect(
    editor.getByLabel("Temperature (K)", { exact: true }),
  ).toHaveValue("273.15");
  await expect(editor.getByLabel("Pressure (Pa abs)")).toHaveValue("101325");
  await expect(editor.getByLabel("Molar flow (mol/s)")).toHaveValue("10");
  await editor.getByLabel("Temperature (K)", { exact: true }).fill("300");
  await editor.getByRole("button", { name: "Apply conditions" }).click();
  await page.keyboard.press("Escape");
  panel = await openUnits(page);
  await panel.getByRole("button", { name: "Restore defaults" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  const row = page
    .locator(".stream-table tbody tr")
    .filter({ hasText: "Stream 1" });
  await expect(row.locator("td").nth(1)).toHaveText("36");
  await expect(row.locator("td").nth(2)).toHaveText("26.85");
  await expect(
    page.getByRole("columnheader", { name: "Flow (kmol/h)" }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Stream 1" }).click();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.locator(".stream-inspector .facts")).toContainText(
    "26.85 °C",
  );
  expect(errors).toEqual([]);
});

test("gauge reference validates entries and converts pressure without changing pressure drops", async ({
  page,
}) => {
  await loadProject(page, reactorExample());
  const panel = await openUnits(page);
  await panel
    .getByLabel("Pressure display unit", { exact: true })
    .selectOption("barg");
  await panel.getByLabel("Atmospheric pressure unit").selectOption("kPa");
  await panel.getByLabel("Atmospheric pressure", { exact: true }).fill("100");
  await panel.getByLabel("Atmospheric pressure", { exact: true }).fill("-1");
  await expect(panel.getByRole("alert")).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).atmosphere,
      storageKey,
    ),
  ).toBe(100000);
  await panel.getByLabel("Atmospheric pressure", { exact: true }).fill("100");
  await page.keyboard.press("Escape");
  const editor = await inspectFeed(page);
  await expect(editor.getByLabel("Pressure (barg)")).toHaveValue("0.01325");
  await editor.getByLabel("Pressure (barg)").fill("1");
  await editor.getByRole("button", { name: "Apply conditions" }).click();
  await page.keyboard.press("Escape");
  await openUnits(page);
  await panel
    .getByLabel("Pressure display unit", { exact: true })
    .selectOption("bar");
  await expect(panel.getByLabel("Pressure drop display unit")).toHaveValue(
    "bar",
  );
  await panel.getByRole("button", { name: "Restore defaults" }).click();
  await expect(
    panel.getByLabel("Atmospheric pressure", { exact: true }),
  ).toHaveValue("1");
  await page.keyboard.press("Escape");
  await inspectFeed(page);
  await expect(editor.getByLabel("Pressure (bar abs)")).toHaveValue("2");
});

test("malformed preferences recover and selections synchronize between tabs", async ({
  page,
  context,
}) => {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, "malformed");
  }, storageKey);
  await page.goto("/");
  const panel = await openUnits(page);
  await expect(panel.getByLabel("Unit system", { exact: true })).toHaveValue(
    "metric",
  );
  const second = await context.newPage();
  await second.goto("/");
  const otherPanel = await openUnits(second);
  await panel.getByLabel("Unit system", { exact: true }).selectOption("si");
  await expect(otherPanel.getByLabel("Temperature display unit")).toHaveValue(
    "K",
  );
  await otherPanel
    .getByLabel("Unit system", { exact: true })
    .selectOption("metric");
  await expect(panel.getByLabel("Temperature display unit")).toHaveValue(
    "degC",
  );
});
