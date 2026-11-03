// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { test, expect, type Page } from "./test";
import {
  folderText,
  installFolderPicker,
  recoveryWorkspace,
} from "./folder-fixture";
import { submitNewProject } from "./project-create-fixture";

const blueIndicators = (page: Page) =>
  page.locator(
    ".equipment-status-dot.calculated, .equipment-status-dot.warning",
  );

async function home(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

async function openResults(page: Page, expectedTable: string) {
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".stream-table")).toHaveText(expectedTable, {
    useInnerText: true,
  });
}

test("saved browser results and blue indicators return without rerunning", async ({
  page,
}, info) => {
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  const table = await page.locator(".stream-table").innerText();
  const name = await page.locator(".project-heading h1").innerText();
  await expect(blueIndicators(page)).toHaveCount(6);
  await home(page);
  const saved = await recoveryWorkspace(page);
  expect(saved).toHaveProperty("simulation.result.converged", true);
  await page
    .getByRole("button", { name: `Open ${name}`, exact: true })
    .dblclick();
  await expect(blueIndicators(page)).toHaveCount(6);
  await openResults(page, table);
  await page.reload();
  await expect(blueIndicators(page)).toHaveCount(6);
  await expect(blueIndicators(page).first()).toHaveCSS(
    "background-color",
    "rgb(59, 130, 246)",
  );
  await openResults(page, table);
  expect(await recoveryWorkspace(page)).toEqual(saved);
  await page.screenshot({
    path: info.outputPath("restored-simulation-results.png"),
  });
});

test("project files keep results through switching, trash restoration and duplication", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/workspace");
  await home(page);
  const originalName = await page
    .locator(".project-card-title strong")
    .innerText();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: /Simple heating/ })
    .click();
  await submitNewProject(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  const table = await page.locator(".stream-table").innerText();
  await expect
    .poll(
      async () =>
        JSON.parse(await folderText(page, "Simple heating")).workspace
          .simulation?.result?.converged,
    )
    .toBe(true);
  const saved = JSON.parse(await folderText(page, "Simple heating")).workspace
    .simulation;
  await page.reload();
  await expect(blueIndicators(page)).toHaveCount(3);
  await openResults(page, table);
  await home(page);
  await page
    .getByRole("button", { name: `Open ${originalName}`, exact: true })
    .dblclick();
  await expect(page.locator(".project-heading h1")).toHaveText(originalName);
  await expect(blueIndicators(page)).toHaveCount(0);
  await home(page);
  await page
    .getByRole("button", { name: "Actions for Simple heating", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore all", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Simple heating", exact: true })
    .dblclick();
  await expect(blueIndicators(page)).toHaveCount(3);
  await openResults(page, table);
  await home(page);
  await page
    .getByRole("button", { name: "Actions for Simple heating", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await submitNewProject(page);
  await expect(blueIndicators(page)).toHaveCount(3);
  await openResults(page, table);
  expect(
    JSON.parse(await folderText(page, "Simple heating copy")).workspace
      .simulation,
  ).toEqual(saved);
});

test("changed calculation inputs never reopen with outdated blue results", async ({
  page,
}) => {
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(blueIndicators(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(blueIndicators(page)).toHaveCount(6);
  await page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name: "Equipment", exact: true })
    .click();
  await page.getByTitle("Add Heater", { exact: true }).click();
  await expect(blueIndicators(page)).toHaveCount(0);
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(blueIndicators(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Calculate results", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stream-table")).toHaveCount(0);
});
