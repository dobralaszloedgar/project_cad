import { expect, test } from "@playwright/test";

test("equipment gallery survives graphics recovery and remains selectable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/sandbox");
  const canvas = page.getByLabel("Interactive 3D equipment model");
  // A cold 25-assembly scene takes ~6.5s to compile shaders in headless
  // software WebGL. Wait for renderer readiness, including after recovery.
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await expect(page.locator("h1")).toHaveText("Integrated process plant");
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".equipment-world-label")).toHaveCount(25);
  await canvas.dispatchEvent("webglcontextlost");
  await expect(
    page.getByRole("heading", { name: "The 3D connection was interrupted" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  // Switch immediately after recovery: the previous nested label roots could
  // race the initial Canvas mount and leave one of the eight labels missing.
  await page
    .getByRole("button", { name: "All equipment", exact: true })
    .click();
  await expect(page.locator(".equipment-world-label")).toHaveCount(8);
  await page
    .locator(".equipment-world-label")
    .filter({ hasText: "Heater" })
    .click();
  await expect(page.locator("h1")).toHaveText("Heater");
  await page
    .getByRole("button", { name: "Play operation", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Section view" }).click();
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("switch", { name: "Section view" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Transparent shell" }).click();
  await expect(
    page.getByRole("switch", { name: "Section view" }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("button", { name: "Pause operation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Process preview", exact: true })
    .click();
  const systems = page.getByRole("combobox", { name: "System example" });
  await systems.selectOption("heating");
  await expect(page.locator(".equipment-world-label")).toHaveCount(3);
  for (const [id, count] of [
    ["mixing", 5],
    ["reaction", 5],
    ["distillation", 5],
    ["splitting", 4],
  ] as const) {
    await systems.selectOption(id);
    await expect(page.locator(".equipment-world-label")).toHaveCount(count);
  }
  await systems.selectOption("distillation");
  await page.getByLabel("Number of trays").fill("12");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator('[data-mode="process"]')).toHaveAttribute(
    "data-trays",
    "12",
  );
  await page
    .locator(".equipment-world-label")
    .filter({ hasText: "D-401" })
    .click();
  await expect(page.locator("h1")).toHaveText("Distillation column");
  await expect(page.getByLabel("Number of trays")).toHaveValue("12");
  await expect(
    page.getByText("12 trays with alternating downcomers"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("large examples start transparent and retain dynamic columns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sandbox/equipment");
  const systems = page.getByRole("combobox", { name: "System example" });
  for (const [id, count] of [
    ["parallel", 17],
    ["fractionation", 21],
    ["integrated", 25],
  ] as const) {
    await page.getByRole("switch", { name: "Transparent shell" }).click();
    await systems.selectOption(id);
    await expect(page.locator(".equipment-world-label")).toHaveCount(count);
    await expect(
      page.getByRole("switch", { name: "Transparent shell" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("switch", { name: "Section view" }),
    ).toHaveAttribute("aria-checked", "false");
  }
  await page.getByLabel("Number of trays").fill("12");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator('[data-mode="process"]')).toHaveAttribute(
    "data-trays",
    "12",
  );
  await page
    .getByRole("combobox", { name: "Inspect equipment" })
    .selectOption("secondColumn");
  await expect(page.locator("h1")).toHaveText("Distillation column");
  await expect(page.getByLabel("Number of trays")).toHaveValue("12");
  expect(errors).toEqual([]);
});
