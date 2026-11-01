import { expect, test, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { catalogFixture } from "./catalog-fixture";
import { newUnit, type Project } from "../../src/domain/schema";
import { settingsFor } from "../helpers/catalog";

function fixture(): Project {
  return {
    version: 1,
    name: "Feed setup",
    units: [newUnit("Feed", "F1", 80, 200), newUnit("Product", "P1", 440, 200)],
    edges: [
      {
        id: "s1",
        source: "F1",
        target: "P1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
}

async function inspect(page: Page) {
  await page.locator('.react-flow__node[data-id="F1"]').click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  return page.getByRole("dialog", { name: "Feed · F1", exact: true });
}

test("inline unit selectors convert values and save entered conditions in SI", async ({
  page,
}) => {
  await loadProject(page, fixture());
  const editor = await inspect(page);
  await editor
    .getByLabel("Temperature unit", { exact: true })
    .selectOption("K");
  await expect(
    editor.getByLabel("Temperature (K)", { exact: true }),
  ).toHaveValue("300");
  await editor
    .getByLabel("Temperature unit", { exact: true })
    .selectOption("degF");
  await expect(
    editor.getByLabel("Temperature (°F)", { exact: true }),
  ).toHaveValue("80.33");
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await editor.getByLabel("Temperature (°F)", { exact: true }).fill("122");
  await editor
    .getByLabel("Pressure unit", { exact: true })
    .selectOption("barg");
  await expect(
    editor.getByLabel("Pressure (barg)", { exact: true }),
  ).toHaveValue("0");
  await editor.getByLabel("Pressure (barg)", { exact: true }).fill("1");
  await editor
    .getByLabel("Molar flow unit", { exact: true })
    .selectOption("kmol/h");
  await editor.getByLabel("Molar flow (kmol/h)", { exact: true }).fill("72");
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await inspect(page);
  await editor
    .getByLabel("Temperature unit", { exact: true })
    .selectOption("K");
  await editor.getByLabel("Pressure unit", { exact: true }).selectOption("Pa");
  await editor
    .getByLabel("Molar flow unit", { exact: true })
    .selectOption("mol/s");
  await expect(
    editor.getByLabel("Temperature (K)", { exact: true }),
  ).toHaveValue("323.15");
  await expect(
    editor.getByLabel("Pressure (Pa abs)", { exact: true }),
  ).toHaveValue("201325");
  await expect(
    editor.getByLabel("Molar flow (mol/s)", { exact: true }),
  ).toHaveValue("20");
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
});

test("add a third component from the feed, retain drafts and normalize ratios on apply", async ({
  page,
}) => {
  await catalogFixture(page);
  const project = fixture();
  project.thermo = settingsFor(["71-43-2", "108-88-3"]);
  project.units[0].params.composition = { "71-43-2": 0.4, "108-88-3": 0.6 };
  await loadProject(page, project);
  const editor = await inspect(page);
  await editor.getByLabel("Molar flow (kmol/h)", { exact: true }).fill("72");
  await editor.getByLabel("Mole fraction benzene", { exact: true }).fill("2");
  await editor.getByLabel("Mole fraction toluene", { exact: true }).fill("3");
  await editor
    .getByRole("button", { name: "Add components", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    editor.getByLabel("Mole fraction benzene", { exact: true }),
  ).toHaveValue("2");
  await editor
    .getByRole("button", { name: "Add components", exact: true })
    .click();
  picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await picker
    .getByRole("searchbox", { name: "Search chemical database" })
    .fill("110-54-3");
  await picker.getByRole("button", { name: /^Add .* to project$/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(editor.locator(".equipment-composition-row")).toHaveCount(3);
  await expect(
    editor.getByLabel("Molar flow (kmol/h)", { exact: true }),
  ).toHaveValue("72");
  await expect(
    editor.getByLabel("Mole fraction benzene", { exact: true }),
  ).toHaveValue("2");
  await expect(
    editor.getByLabel("Mole fraction toluene", { exact: true }),
  ).toHaveValue("3");
  await editor
    .locator(".equipment-composition-row")
    .nth(2)
    .getByRole("spinbutton")
    .fill("5");
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(
    editor.getByLabel("Mole fraction benzene", { exact: true }),
  ).toHaveValue("0.2");
  await expect(
    editor.getByLabel("Mole fraction toluene", { exact: true }),
  ).toHaveValue("0.3");
  await expect(
    editor.locator(".equipment-composition-row").nth(2).getByRole("spinbutton"),
  ).toHaveValue("0.5");
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/feed-composition-ratios.png" });
  await page.keyboard.press("Escape");
  await inspect(page);
  await expect(editor.locator(".equipment-composition-row")).toHaveCount(3);
  await expect(
    editor.getByLabel("Mole fraction benzene", { exact: true }),
  ).toHaveValue("0.2");
});

test("missing setup checklist links to fields, rejects invalid ratios and fits mobile", async ({
  page,
}) => {
  const project = fixture();
  project.units[0].missingInputs = [
    "flow",
    "temperature",
    "pressure",
    "composition",
  ];
  await loadProject(page, project);
  const dot = page.getByRole("button", {
    name: "F1: Missing setup",
    exact: true,
  });
  await dot.focus();
  const status = page.getByRole("dialog", {
    name: "F1 equipment status",
    exact: true,
  });
  await expect(
    status.getByRole("button", { name: "Specify flow.", exact: true }),
  ).toBeVisible();
  await status
    .getByRole("button", { name: "Specify flow.", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Feed · F1", exact: true });
  await expect(
    editor.getByLabel("Molar flow (kmol/h)", { exact: true }),
  ).toBeFocused();
  await expect(
    editor.getByRole("button", { name: "Apply conditions", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "4 items to complete", exact: true })
    .click();
  const checklist = editor.getByRole("dialog", {
    name: "Items to complete in Setup",
  });
  await expect(
    checklist.getByText("Complete setup", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/feed-missing-setup.png" });
  await checklist
    .getByRole("button", { name: "Specify temperature.", exact: true })
    .click();
  await expect(
    editor.getByLabel("Temperature (°C)", { exact: true }),
  ).toBeFocused();
  await editor.getByLabel("Temperature (°C)", { exact: true }).fill("25");
  await editor.getByLabel("Pressure (bar abs)", { exact: true }).fill("1");
  await editor.getByLabel("Molar flow (kmol/h)", { exact: true }).fill("36");
  await editor.getByLabel("Mole fraction A", { exact: true }).fill("0");
  await editor.getByLabel("Mole fraction B", { exact: true }).fill("0");
  await expect(
    editor.getByRole("button", { name: "1 item to complete", exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Apply conditions", exact: true }),
  ).toBeDisabled();
  await editor.getByLabel("Mole fraction A", { exact: true }).fill("-1");
  await editor
    .getByRole("button", { name: "1 item to complete", exact: true })
    .click();
  await expect(
    checklist.getByText("Review equipment errors", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(checklist).toBeVisible();
  const bounds = await checklist.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: "test-results/feed-missing-setup-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(checklist).toHaveCount(0);
  await expect(editor).toBeVisible();
  await editor.getByLabel("Mole fraction A", { exact: true }).fill("2");
  await editor.getByLabel("Mole fraction B", { exact: true }).fill("3");
  await expect(
    editor.getByRole("button", { name: /items? to complete/ }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(
    editor.getByLabel("Mole fraction A", { exact: true }),
  ).toHaveValue("0.4");
  await expect(
    editor.getByLabel("Mole fraction B", { exact: true }),
  ).toHaveValue("0.6");
  await editor.getByLabel("Mole fraction A", { exact: true }).fill("4");
  await editor.getByLabel("Mole fraction B", { exact: true }).fill("6");
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(
    editor.getByLabel("Mole fraction A", { exact: true }),
  ).toHaveValue("0.4");
  await expect(
    editor.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dot).toHaveCount(0);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await inspect(page);
  await expect(
    editor.getByLabel("Mole fraction A", { exact: true }),
  ).toHaveValue("0.4");
});
