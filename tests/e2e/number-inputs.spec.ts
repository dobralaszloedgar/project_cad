import { expect, test, type Locator, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { newUnit, type Kind } from "../../src/domain/schema";
import { presetPreferences } from "../../src/domain/unit-preferences";
import { reactionProject } from "../helpers/reactions";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((preferences) => {
    localStorage.setItem(
      "project-cad:unit-preferences",
      JSON.stringify(preferences),
    );
  }, presetPreferences("si"));
});

async function inspect(page: Page, id: string) {
  await page.locator(".react-flow__node").filter({ hasText: id }).dblclick();
  await expect(
    page.getByRole("tab", { name: "Setup", exact: true }),
  ).toBeVisible();
}

async function openBlock(page: Page, kind: Kind) {
  await loadProject(page, {
    version: 1,
    name: `${kind} input limits`,
    units: [newUnit(kind, "unit-1", 100, 100)],
    edges: [],
  });
  await inspect(page, "unit-1");
}

function arrows(input: Locator) {
  return {
    up: input
      .locator("..")
      .getByRole("button", { name: "Increase", exact: true }),
    down: input
      .locator("..")
      .getByRole("button", { name: "Decrease", exact: true }),
  };
}

async function checkBounds(input: Locator, min: number, max: number) {
  const { up, down } = arrows(input);
  await input.fill(String(max));
  await expect(up).toBeDisabled();
  await input.press("ArrowUp");
  expect(Number(await input.inputValue())).toBe(max);
  await down.click();
  expect(Number(await input.inputValue())).toBeLessThan(max);
  await input.fill(String(min));
  await expect(down).toBeDisabled();
  await input.press("ArrowDown");
  expect(Number(await input.inputValue())).toBe(min);
  await up.click();
  expect(Number(await input.inputValue())).toBeGreaterThan(min);
  expect(Number(await input.inputValue())).toBeLessThanOrEqual(max);
}

test("feed arrows stay visible, respect fractions, preserve decimals, and validate typed values", async ({
  page,
}) => {
  await openBlock(page, "Feed");
  await page.getByLabel("Equipment name").focus();
  await page.mouse.move(0, 0);
  const inputs = page.getByRole("dialog").getByRole("spinbutton");
  await expect(inputs).toHaveCount(5);
  for (const input of await inputs.all()) {
    await expect(arrows(input).up).toBeVisible();
    await expect(arrows(input).down).toBeVisible();
    expect(
      await arrows(input).up.evaluate((button) =>
        Number(getComputedStyle(button).opacity),
      ),
    ).toBeGreaterThan(0);
  }
  const fraction = page.getByLabel("Mole fraction A", { exact: true });
  await fraction.fill("0.995");
  await arrows(fraction).up.click();
  await expect(fraction).toHaveValue("1.005");
  await fraction.fill("0.005");
  await fraction.press("ArrowDown");
  await expect(fraction).toHaveValue("0");
  await fraction.fill("1.2");
  await expect(fraction).toHaveAttribute("aria-invalid", "false");
  await arrows(fraction).down.click();
  await expect(fraction).toHaveValue("1.19");
  await fraction.fill("0.333333");
  await fraction.press("ArrowUp");
  await expect(fraction).toHaveValue("0.343333");
  expect(
    await fraction.evaluate(
      (input) => (input as HTMLInputElement).validity.valid,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await expect(
    page.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await checkBounds(
    page.getByLabel("Temperature (K)", { exact: true }),
    250,
    800,
  );
  await checkBounds(
    page.getByLabel("Pressure (Pa abs)", { exact: true }),
    10000,
    2000000,
  );
  await checkBounds(
    page.getByLabel("Molar flow (mol/s)", { exact: true }),
    0.001,
    1000,
  );
  await page.screenshot({ path: "test-results/number-inputs-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/number-inputs-mobile.png" });
});

test("each equipment block uses its own limits and trays remain integers", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const kind of [
    "Splitter",
    "Distillation",
    "Heater",
    "Cooler",
    "PBR",
  ] as const) {
    await openBlock(page, kind);
    if (kind === "Splitter") {
      await checkBounds(
        page.getByLabel("Secondary outlet fraction", { exact: true }),
        0,
        0.95,
      );
    } else if (kind === "Distillation") {
      await checkBounds(
        page.getByLabel("Relative volatility A/B", { exact: true }),
        1.01,
        20,
      );
      await checkBounds(
        page.getByLabel("Distillate fraction", { exact: true }),
        0.01,
        0.99,
      );
      const trays = page.getByLabel("Visible trays (2D & 3D)", { exact: true });
      await checkBounds(trays, 2, 80);
      await trays.fill("2.5");
      await expect(
        page.getByRole("button", { name: "Apply conditions" }),
      ).toBeDisabled();
      await page.getByRole("button", { name: /items? to complete/ }).click();
      await page.getByRole("button", { name: /^Tray count:/ }).click();
      await expect(trays).toBeFocused();
      await trays.press("ArrowUp");
      await expect(trays).toHaveValue("3");
    } else if (kind === "PBR") {
      await checkBounds(
        page.getByLabel("Catalyst mass (kg)", { exact: true }),
        0,
        1e9,
      );
      await page
        .getByLabel("Packed-bed calculation")
        .selectOption("target-conversion");
      await checkBounds(
        page.getByLabel("Target conversion (%)", { exact: true }),
        0.000001,
        99.9999,
      );
    } else {
      await page.getByLabel("Thermal specification").selectOption("duty");
      await checkBounds(
        page.getByLabel("Heat duty (W)", { exact: true }),
        kind === "Heater" ? 0 : -1e8,
        kind === "Cooler" ? 0 : 1e8,
      );
    }
  }
});

test("unit changes keep physical bounds exact, including negative gauge pressure", async ({
  page,
}) => {
  await openBlock(page, "Feed");
  const preferences = presetPreferences("us");
  preferences.units.pressure = "psig";
  await page.evaluate((preferences) => {
    const key = "project-cad:unit-preferences";
    localStorage.setItem(key, JSON.stringify(preferences));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, preferences);
  const temperature = page.getByLabel("Temperature (°F)", { exact: true });
  await checkBounds(temperature, -9.67, 980.33);
  await temperature.fill("980");
  await temperature.press("ArrowUp");
  await expect(temperature).toHaveValue("980.33");
  const pressure = page.getByLabel("Pressure (psig)", { exact: true });
  const minimum = Number(await pressure.getAttribute("min"));
  expect(minimum).toBeLessThan(0);
  await pressure.fill(String(minimum + 0.01));
  await pressure.press("ArrowDown");
  expect(Number(await pressure.inputValue())).toBe(minimum);
  await expect(arrows(pressure).down).toBeDisabled();
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await expect(
    page.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await page.evaluate((preferences) => {
    const key = "project-cad:unit-preferences";
    localStorage.setItem(key, JSON.stringify(preferences));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, presetPreferences("si"));
  await expect(page.getByLabel("Temperature (K)", { exact: true })).toHaveValue(
    "800",
  );
  await expect(
    page.getByLabel("Pressure (Pa abs)", { exact: true }),
  ).toHaveValue("10000");
});

test("reaction inputs respect their ranges and retain scientific notation", async ({
  page,
}) => {
  test.setTimeout(120000);
  await loadProject(page, reactionProject());
  await inspect(page, "F-101");
  for (const input of await page
    .getByRole("spinbutton", { name: /^Mole fraction / })
    .all()) {
    await input.fill("0");
    await expect(arrows(input).down).toBeDisabled();
    await input.fill("2");
    await expect(arrows(input).up).toBeEnabled();
    await expect(input).toHaveAttribute("aria-invalid", "false");
  }
  await page.keyboard.press("Escape");
  await inspect(page, "R-101");
  await checkBounds(
    page.getByLabel("Catalyst mass (kg)", { exact: true }),
    0,
    1e9,
  );
  await page
    .getByLabel("Packed-bed calculation")
    .selectOption("target-conversion");
  await checkBounds(
    page.getByLabel("Target conversion (%)", { exact: true }),
    0.000001,
    99.9999,
  );
  await checkBounds(
    page.getByLabel("Pressure drop (Pa)", { exact: true }),
    0,
    2e6,
  );
  await checkBounds(
    page.getByLabel("reactants coefficient 1", { exact: true }),
    0.000001,
    1000,
  );
  await checkBounds(page.getByLabel("Reaction order", { exact: true }), 0, 20);
  await checkBounds(page.getByLabel("Rate constant", { exact: true }), 0, 1e20);
  await page.getByLabel("Rate law model").selectOption("general");
  const parameter = page.getByLabel("Parameter kf", { exact: true });
  await parameter.fill("1e-");
  await expect(parameter).toHaveValue("1e-");
  await expect(parameter).toHaveAttribute("aria-invalid", "true");
  await parameter.pressSequentially("3");
  await expect(parameter).toHaveValue("1e-3");
  await expect(parameter).toHaveAttribute("aria-invalid", "false");
  await parameter.fill("0");
  await expect(arrows(parameter).down).toBeDisabled();
  await parameter.press("ArrowUp");
  await expect(parameter).toHaveValue("0.01");
  const order = page.getByLabel("forward factor 1 order", { exact: true });
  await order.fill("-0.5");
  await order.press("ArrowDown");
  await expect(order).toHaveValue("-0.6");
  await page.getByLabel("Rate species 1 basis").selectOption("mole-fraction");
  await page
    .getByText("Test the rate with sample values", { exact: true })
    .click();
  await checkBounds(page.getByLabel("Sample a", { exact: true }), 0, 1);
});
