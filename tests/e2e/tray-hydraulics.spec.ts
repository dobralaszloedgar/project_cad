import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { aromaticColumnTemplate } from "../../src/domain/real-chemical-templates";

test.use({ actionTimeout: 20000 });

test("sieve hydraulic setup, calculated states, 3D display, persistence and disabling", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadProject(page, aromaticColumnTemplate("mesh"));
  const open = async () => {
    await page.locator('.react-flow__node[data-id="D-201"] .unit-tag').click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  };
  await open();
  await page.getByLabel("Rate flooding and weeping").check();
  await page
    .getByLabel("Hydraulic liquid density", { exact: true })
    .fill("800");
  await page
    .getByLabel("Hydraulic surface tension", { exact: true })
    .fill("20"); // Default engineering units: mN/m, equal to 0.02 N/m.
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await expect(
    page.getByText("No pending changes", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("hydraulic-setup.png") });
  await page.keyboard.press("Escape");

  for (const [diameter, state] of [
    [1.2, "Within rated limits"],
    [2, "Weeping predicted"],
    [0.7, "Flooding predicted"],
  ] as const) {
    await open();
    await page
      .getByLabel("Tower internal diameter", { exact: true })
      .fill(String(diameter));
    await page.getByRole("button", { name: "Apply conditions" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    await open();
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    const table = page.getByRole("table", {
      name: "Tray hydraulics profile",
      exact: true,
    });
    await expect(table.locator("tbody tr")).toHaveCount(8);
    await expect(
      table.getByRole("cell", { name: state, exact: true }),
    ).toHaveCount(8);
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`hydraulics-${diameter}-results.png`),
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Close Results", exact: true })
      .click();
    await page
      .getByRole("button", { name: "3D schematic", exact: true })
      .click();
    await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible(
      { timeout: 30000 },
    );
    await expect(page.getByLabel("3D tray hydraulics")).toContainText(
      "Highest flooding load",
    );
    await page
      .getByRole("button", { name: "Focus selected equipment", exact: true })
      .click();
    const play = page.getByRole("button", { name: "Play flow", exact: true });
    if (await play.isVisible()) await play.click();
    await page.screenshot({
      path: info.outputPath(`hydraulics-${diameter}-3d.png`),
    });
    await page
      .getByRole("button", { name: "2D flowsheet", exact: true })
      .click();
  }
  await page.reload();
  await open();
  await expect(page.getByLabel("Rate flooding and weeping")).toBeChecked();
  await expect(
    page.getByLabel("Tower internal diameter", { exact: true }),
  ).toHaveValue("0.7");
  await expect(
    page.getByLabel("Hydraulic liquid density", { exact: true }),
  ).toHaveValue("800");
  await page.getByLabel("Rate flooding and weeping").uncheck();
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await open();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tray hydraulic rating" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("3D tray hydraulics")).toHaveCount(0);
  expect(errors).toEqual([]);
});
