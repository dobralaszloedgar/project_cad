import { expect, test } from "./test";
import { catalogFixture } from "./catalog-fixture";

for (const theme of ["light", "nord"]) {
  test(`dropdown menus follow the ${theme} theme and preserve dialog keyboard navigation`, async ({
    page,
  }, info) => {
    await catalogFixture(page);
    await page.addInitScript(
      (palette) => localStorage.setItem("project-cad.theme", palette),
      theme,
    );
    await page.goto("/workspace?example=solution");
    await page
      .getByRole("button", { name: "Project components", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Project components",
      exact: true,
    });
    const field = dialog.getByRole("combobox", {
      name: "Search chemical field",
    });
    await field.click();
    await expect(
      field.getByRole("option", { name: "All identifiers", exact: true }),
    ).toBeVisible();
    expect(
      await field.evaluate(
        (element) =>
          getComputedStyle(element, "::picker(select)").backgroundColor,
      ),
    ).toBe(
      await dialog.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
    await page.screenshot({ path: info.outputPath("chemical-dropdown.png") });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(field).toHaveValue("name");
    await expect(dialog).toBeVisible();
    await field.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(field).toBeFocused();
    await expect(
      field.getByRole("option", { name: "Formula", exact: true }),
    ).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Units", exact: true }).click();
    const units = page.getByRole("dialog", {
      name: "Engineering units",
      exact: true,
    });
    const pressure = units.getByLabel("Pressure display unit", { exact: true });
    await pressure.click();
    await expect(
      pressure.locator('optgroup[label="Gauge pressure"]'),
    ).toBeVisible();
    await pressure.getByRole("option", { name: "barg", exact: true }).click();
    await expect(pressure).toHaveValue("barg");
    await page.setViewportSize({ width: 390, height: 844 });
    await pressure.click();
    const option = pressure.getByRole("option", {
      name: "barg",
      exact: true,
    });
    await expect(option).toBeVisible();
    const bounds = (await option.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: info.outputPath("unit-dropdown-mobile.png"),
    });
  });
}
