// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { aromaticColumnTemplate } from "../../src/domain/real-chemical-templates";
import { hydraulicProject } from "../fixtures/hydraulic-project";

test.use({ actionTimeout: 20000 });

test.beforeEach(async ({ page }) => {
  // Other tasks can edit this shared development workspace during a run.
  await page.routeWebSocket(/\/_next\/webpack-hmr/, () => {});
});

for (const [diameter, state, direction] of [
  [2, "Trays: 0 flooding · 8 weeping", "droplets fall through tray holes"],
  [0.7, "Trays: 8 flooding · 0 weeping", "liquid carried upward between trays"],
] as const) {
  test(`${diameter} m tower activates hydraulic animation from 3D and preserves its rating after reload`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    // Snap camera transitions on software WebGL. The explicit tray-effects
    // action must still resume the fluid animation with reduced motion enabled.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = hydraulicProject();
    project.units[1].params.distillation!.hydraulics!.diameter = diameter;
    await loadProject(page, project);
    await page
      .getByRole("button", { name: "3D schematic", exact: true })
      .click();
    const legend = page.getByLabel("3D tray hydraulics");
    await expect(legend).toContainText("No current hydraulic result");
    await legend
      .getByRole("button", { name: "Calculate tray effects" })
      .click();
    await expect(legend).toContainText(state);
    await expect(legend.getByText(direction, { exact: false })).toBeHidden();
    await legend.getByText("Details", { exact: true }).click();
    await expect(legend.getByText(direction, { exact: false })).toBeVisible();
    await legend.getByText("Details", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Close Results", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible(
      { timeout: 30000 },
    );
    const pause = page.getByRole("button", { name: "Pause flow", exact: true });
    await pause.click();
    const shell = page.getByRole("switch", { name: "Transparent shell" });
    await shell.click();
    await expect(legend).toContainText("Animation paused");
    await expect(legend).toContainText("Shell is opaque");
    await legend.getByRole("button", { name: "Show tray effects" }).click();
    await expect(pause).toBeVisible();
    await expect(shell).toHaveAttribute("aria-checked", "true");
    await expect(legend).not.toContainText("Animation paused");
    await page.screenshot({ path: info.outputPath(`active-${diameter}.png`) });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Run simulation" }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "3D schematic", exact: true })
      .click();
    await expect(legend).toContainText(state);
    await expect(
      legend.getByRole("button", { name: "Calculate tray effects" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("sieve hydraulic setup, calculated states, 3D display, persistence and disabling", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadProject(page, aromaticColumnTemplate("mesh"));
  const open = async () => {
    const closeResults = page.getByRole("button", {
      name: "Close Results",
      exact: true,
    });
    if (await closeResults.isVisible()) await closeResults.click();
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
      .getByRole("button", { name: "3D schematic", exact: true })
      .click();
    await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible(
      { timeout: 30000 },
    );
    await expect(page.getByLabel("3D tray hydraulics")).toContainText(
      "Peak flood load",
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
