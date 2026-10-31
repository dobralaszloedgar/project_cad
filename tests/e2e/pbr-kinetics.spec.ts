import { expect, test, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { reactionProject } from "../helpers/reactions";

async function openReactor(page: Page) {
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "R-101" })
    .dblclick();
  await expect(page.getByLabel("Reaction name", { exact: true })).toBeVisible();
}

test("PBR live equations, custom definitions, nested editing and saved calculations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await loadProject(page, reactionProject());
  await openReactor(page);
  const equation = page.getByTestId("rate-preview");
  await expect(
    equation.getByRole("math", { name: /^Net disappearance/ }),
  ).toBeVisible();
  await expect(equation).toHaveAttribute("aria-label", /C\[methanol\]/);
  await page.getByLabel("Reaction order", { exact: true }).fill("2");
  await expect(equation.locator("annotation")).toContainText("^{2}");
  await page.getByLabel("Reaction order", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "With constants", exact: true })
    .click();
  await expect(equation.locator("annotation")).toContainText("0.1");
  await page.getByLabel("Rate constant", { exact: true }).fill("0.2");
  await expect(equation.locator("annotation")).toContainText("0.2");
  await page.getByLabel("Rate constant", { exact: true }).fill("0.1");
  await page
    .getByLabel("Rate law model", { exact: true })
    .selectOption("general");
  await page.getByRole("button", { name: "Expand rate editor" }).click();
  const expanded = page.getByRole("dialog", {
    name: "Reaction rate editor",
    exact: true,
  });
  await expect(expanded).toBeVisible();
  await page.getByLabel("Include reverse reaction", { exact: true }).check();
  await page.getByRole("button", { name: "Add reverse factor" }).click();
  await page.getByRole("button", { name: "Add adsorption term" }).click();
  await page.getByLabel("Denominator power", { exact: true }).fill("2");
  await expect(equation.locator("annotation")).toContainText("\\frac{");
  await expect(equation.locator("annotation")).toContainText("k_{r}");
  await page.getByLabel("Rate editing method").selectOption("custom");
  await page.getByLabel("Custom rate expression").fill("kf*a/(1+K1*a)^2");
  await page
    .getByLabel("Rate species 1 symbol", { exact: true })
    .fill("methanol");
  await page
    .getByLabel("Rate species 1 symbol", { exact: true })
    .press("Enter");
  await expect(page.getByLabel("Custom rate expression")).toHaveValue(
    "kf*methanol/(1+K1*methanol)^2",
  );
  await page.getByLabel("Parameter K1 symbol", { exact: true }).fill("Kads");
  await page.getByLabel("Parameter K1 symbol", { exact: true }).press("Enter");
  await page.getByLabel("Parameter Kads", { exact: true }).fill("0.5");
  await page.getByLabel("Sample methanol", { exact: true }).fill("3");
  await expect(page.getByTestId("rate-sample-result")).toContainText(
    "0.0480000",
  );
  await page.getByLabel("Rate editing method").selectOption("table");
  await expect(page.getByLabel("forward factor 1 species")).toHaveValue(
    "methanol",
  );
  await page.getByLabel("Rate editing method").selectOption("custom");
  await expect(page.getByLabel("Custom rate expression")).toHaveValue(
    "kf*methanol/(1+Kads*methanol)^2",
  );
  await page.getByLabel("Custom rate expression").fill("kf*methanol/(");
  await expect(page.locator(".rate-errors")).toContainText("character");
  await expect(equation).toContainText("Complete the expression");
  await page
    .getByLabel("Custom rate expression")
    .fill("kf*methanol/(1+Kads*methanol)^2");
  await page
    .getByRole("button", { name: "With constants", exact: true })
    .click();
  await expect(equation.locator("annotation")).toContainText("0.5");
  await page.screenshot({
    path: "test-results/pbr-custom-kinetics-desktop.png",
  });
  expect(
    await expanded.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(expanded).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand rate editor" }),
  ).toBeFocused();
  // Both general-law drafts survive a visit to the simple law.
  await page
    .getByLabel("Rate law model", { exact: true })
    .selectOption("power-law");
  await page
    .getByLabel("Rate law model", { exact: true })
    .selectOption("general");
  await expect(page.getByLabel("Custom rate expression")).toHaveValue(
    "kf*methanol/(1+Kads*methanol)^2",
  );
  // Independent sample errors must not prevent applying valid engineering data.
  await page
    .getByText("Test the rate with sample values", { exact: true })
    .click();
  await page.getByLabel("Sample T", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Reactor species balance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Reactor species balance" }),
  ).toContainText("Conversion (%)");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await openReactor(page);
  await expect(page.getByLabel("Custom rate expression")).toHaveValue(
    "kf*methanol/(1+Kads*methanol)^2",
  );
  await expect(page.getByLabel("Parameter Kads", { exact: true })).toHaveValue(
    "0.5",
  );
  expect(errors).toEqual([]);
});

test("PBR mixed species bases, added constants and compact desktop layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/");
  await loadProject(page, reactionProject());
  await openReactor(page);
  const shell = page.locator(".equipment-editor-dialog");
  const bounds = await shell.boundingBox();
  await page
    .getByLabel("Rate law model", { exact: true })
    .selectOption("general");
  await page
    .getByRole("button", { name: "Add rate species", exact: true })
    .click();
  await page
    .getByLabel("Rate species 2", { exact: true })
    .selectOption("64-17-5");
  await page
    .getByLabel("Rate species 2 basis", { exact: true })
    .selectOption("partial-pressure");
  await page
    .getByLabel("Rate species 2 unit", { exact: true })
    .selectOption("bar");
  await page
    .getByRole("button", { name: "Add forward factor", exact: true })
    .click();
  await page
    .getByLabel("forward factor 2 species", { exact: true })
    .selectOption("s1");
  await page.getByLabel("forward factor 2 order", { exact: true }).fill("0.5");
  await expect(page.getByTestId("rate-preview")).toHaveAttribute(
    "aria-label",
    /p\[ethanol\]\^\(0.5\)/,
  );
  await page.getByLabel("Rate species 2 symbol", { exact: true }).fill("T");
  await expect(page.locator(".rate-symbol-error")).toHaveText("T is reserved.");
  await page
    .getByLabel("Rate species 2 symbol", { exact: true })
    .fill("p_ethanol");
  await page
    .getByLabel("Rate species 2 symbol", { exact: true })
    .press("Enter");
  await page.getByLabel("Rate editing method").selectOption("custom");
  await page
    .getByRole("button", { name: "Add parameter", exact: true })
    .click();
  await page.getByLabel("Parameter k1 symbol", { exact: true }).fill("Km");
  await page.getByLabel("Parameter k1 symbol", { exact: true }).press("Enter");
  await page.getByLabel("Parameter Km", { exact: true }).fill("0.25");
  await page.getByLabel("Custom rate expression").fill("kf*a/(Km+a)");
  await page
    .getByRole("button", { name: "Remove parameter Km", exact: true })
    .click();
  await expect(page.locator(".rate-errors")).toContainText(
    "Unknown symbol “Km”",
  );
  await page
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(page.locator(".equipment-save-state")).toHaveText(
    "Unsaved changes",
  );
  await page
    .getByRole("button", { name: "Add parameter", exact: true })
    .click();
  await page.getByLabel("Parameter k1 symbol", { exact: true }).fill("Km");
  await page.getByLabel("Parameter k1 symbol", { exact: true }).press("Enter");
  await page.getByLabel("Parameter Km", { exact: true }).fill("0.25");
  await page.getByRole("button", { name: "Expand rate editor" }).click();
  const expanded = page.getByRole("dialog", {
    name: "Reaction rate editor",
    exact: true,
  });
  const scroller = expanded.locator(".rate-dialog-scroll");
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const previewBounds = await expanded.locator(".rate-preview").boundingBox();
  const scrollBounds = await scroller.boundingBox();
  expect(previewBounds!.y).toBeGreaterThanOrEqual(scrollBounds!.y - 2);
  expect(previewBounds!.y + previewBounds!.height).toBeLessThan(
    scrollBounds!.y + scrollBounds!.height,
  );
  expect(
    await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/pbr-compact-kinetics-desktop.png",
  });
  await page.getByRole("button", { name: "Done editing" }).click();
  expect(
    await page
      .locator(".equipment-editor-content")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Reactor species balance" }),
  ).toBeVisible();
  const resultsBounds = await shell.boundingBox();
  expect(resultsBounds!.width).toBeCloseTo(bounds!.width, 0);
  expect(resultsBounds!.height).toBeCloseTo(bounds!.height, 0);
});
