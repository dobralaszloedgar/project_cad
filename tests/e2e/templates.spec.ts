// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test, type Page } from "./test";
import { templates, templateSpecification } from "../../src/domain/templates";
import { componentNames } from "../../src/domain/thermo/catalog";
import { simulate } from "../../src/domain/solver";
import { folderText, installFolderPicker } from "./folder-fixture";
import { submitNewProject } from "./project-create-fixture";

test.use({ actionTimeout: 20000 });

test("the 21-equipment methanol plant retains both MESH towers, branch models and hydraulic profiles after reload", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/chemicals**", (route) => route.abort());
  await page.goto("/?example=methanol-recycle-plant");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page
    .getByRole("button", { name: "Close Results", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("methanol-mesh-flowsheet.png"),
  });
  for (const [id, trays] of [
    ["D-701", 16],
    ["D-702", 20],
  ] as const) {
    await page.locator(`.react-flow__node[data-id="${id}"] .unit-tag`).click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await expect(page.getByLabel("Column calculation method")).toHaveValue(
      "mesh",
    );
    await expect(page.locator(".equipment-model-badge")).toContainText(
      "Raoult’s law",
    );
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await expect(
      page
        .getByRole("table", { name: "MESH stage profile", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(trays + 2);
    await expect(
      page
        .getByRole("table", { name: "Tray hydraulics profile", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(trays);
    await page.screenshot({ path: info.outputPath(`${id}-mesh-results.png`) });
    await page.keyboard.press("Escape");
  }
  await page.locator('.react-flow__node[data-id="S-703"] .unit-tag').click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Split basis", { exact: true })).toHaveValue(
    "component",
  );
  await expect(
    page.getByLabel("Outlet 2 property model", { exact: true }),
  ).toHaveValue("ideal-solution");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
  const hydraulics = page.getByLabel("3D tray hydraulics");
  for (const id of ["D-701", "D-702"]) {
    await page.getByLabel("Inspect 3D equipment").selectOption(id);
    await expect(hydraulics).not.toContainText("No current hydraulic result");
    await expect(hydraulics).toContainText("Trays: 0 flooding · 0 weeping");
  }
  await page.screenshot({ path: info.outputPath("methanol-mesh-3d.png") });
  expect(errors).toEqual([]);
});

async function openTemplates(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Start from a template" });
}

test("template sections, search and full flow previews work on desktop and mobile", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace");
  const dialog = await openTemplates(page);
  await expect(dialog.locator("summary")).toHaveCount(5);
  await page.screenshot({ path: info.outputPath("templates-overview.png") });
  const columns = dialog
    .locator("summary")
    .filter({ hasText: "Distillation & hydraulics" });
  await columns.click();
  const flooding = dialog.locator('[data-template-id="distillation-flooding"]');
  await expect(flooding).toBeVisible();
  await expect(
    flooding.locator('[data-column-equipment="condenser"]'),
  ).toHaveCount(1);
  await expect(
    flooding.locator('[data-column-equipment="reboiler"]'),
  ).toHaveCount(1);
  await columns.focus();
  await page.keyboard.press("Enter");
  await expect(flooding).not.toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Search templates" })
    .fill("weeping");
  await expect(dialog.locator(".template-option")).toHaveCount(1);
  await expect(dialog.locator(".template-option")).toContainText(
    "Weeping column",
  );
  await page.screenshot({ path: info.outputPath("templates-column.png") });
  await dialog
    .getByRole("textbox", { name: "Search templates" })
    .fill("no-such-process");
  await expect(dialog.getByRole("status")).toContainText("No templates match");
  await dialog.getByRole("button", { name: "Clear template search" }).click();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const plant = dialog.locator('[data-template-id="methanol-recycle-plant"]');
    await plant.scrollIntoViewIfNeeded();
    await expect(plant.locator(".preview-unit")).toHaveCount(21);
    await expect(plant.locator(".preview-pipes > path")).toHaveCount(21);
    await page.screenshot({ path: info.outputPath(`templates-${width}.png`) });
  }
  expect(errors).toEqual([]);
});

test("every offered template loads its specifications and runs without a chemical lookup", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await installFolderPicker(page);
  await page.route("**/api/chemicals**", (route) => route.abort());
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  // Switch between real mixtures and property models as well as operations.
  const ordered = [
    templates.find((template) => template.id === "solution")!,
    ...templates.filter((template) => template.id !== "solution"),
  ];
  for (const template of ordered) {
    const project = template.create();
    const dialog = await openTemplates(page);
    await expect(dialog.locator(".template-option")).toHaveCount(
      templates.length,
    );
    await expect(dialog.locator(".template-list")).not.toContainText(
      "Synthetic",
    );
    await expect(dialog.locator(".template-list")).toContainText(
      "Water–gas shift",
    );
    const option = dialog.locator(".template-option").filter({
      has: page.getByText(template.name, { exact: true }),
    });
    const section = option.locator("xpath=ancestor::details");
    if (
      !(await section.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await section.locator("summary").click();
    await expect(option).toHaveAttribute(
      "title",
      templateSpecification(project),
    );
    await expect(option.locator(".preview-unit")).toHaveCount(
      project.units.length,
    );
    await expect(option.locator(".preview-pipes > path")).toHaveCount(
      project.edges.length,
    );
    if (template.id === "solution")
      await page.screenshot({ path: info.outputPath("templates-desktop.png") });
    await option.click();
    await expect(dialog).not.toBeVisible();
    const create = page.getByRole("dialog", {
      name: "Create project",
      exact: true,
    });
    await submitNewProject(page);
    await expect(create).not.toBeVisible();
    await expect(page.locator(".project-heading h1")).toHaveText(project.name);
    await expect(
      page.getByRole("button", { name: "Project components", exact: true }),
    ).toHaveAttribute("title", "Components");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    const names = componentNames(project.thermo!);
    await page
      .getByRole("group", { name: "Result data", exact: true })
      .getByRole("button", { name: "Composition", exact: true })
      .click();
    await expect(
      page.getByRole("columnheader", {
        name: `${names[0]} mole fraction`,
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    if (template.id.startsWith("pbr-")) {
      await page
        .locator(".react-flow__node")
        .filter({ hasText: "R-101" })
        .dblclick();
      await page.getByRole("tab", { name: "Setup", exact: true }).click();
      const bed = project.units[1].params.packedBed!;
      await expect(page.locator(".reaction-card")).toHaveCount(
        bed.reactions.length,
      );
      await page
        .getByText("Kinetics source and limits", { exact: true })
        .click();
      const source = page.locator(".kinetics-source");
      await expect(source.getByRole("link")).toHaveAttribute(
        "href",
        bed.reactions[0].kineticsSource!.url,
      );
      await expect(source).toContainText(
        bed.reactions[0].kineticsSource!.catalyst,
      );
      if (template.id === "pbr-methanol-synthesis")
        await page.screenshot({
          path: info.outputPath("methanol-kinetics-source.png"),
        });
      await page
        .getByRole("button", { name: "Calculate", exact: true })
        .click();
      await expect(
        page
          .getByRole("table", { name: "Reactor species balance" })
          .getByRole("row"),
      ).toHaveCount(names.length + 1);
      await page.keyboard.press("Escape");
      const saved = JSON.parse(await folderText(page, project.name)).workspace
        .project;
      expect(saved.thermo).toEqual(project.thermo);
      expect(saved.units[1].params.packedBed).toEqual(bed);
    }
    if (template.id === "mixing" || template.id === "distillation") {
      await page
        .getByRole("button", { name: "Project components", exact: true })
        .click();
      const components = page.getByRole("dialog", {
        name: "Project components",
        exact: true,
      });
      await expect(components.locator(".component-slot").nth(0)).toContainText(
        names[0],
      );
      await expect(components.locator(".component-slot").nth(1)).toContainText(
        names[1],
      );
      await expect(
        components.locator(".selected-components .component-badge"),
      ).toHaveText("2 / 40");
      await page.keyboard.press("Escape");
    }
    if (template.id === "mixing") {
      await page
        .locator(".react-flow__node")
        .filter({ hasText: "F-501" })
        .dblclick();
      await expect(
        page.getByLabel("Mole fraction Benzene", { exact: true }),
      ).toHaveValue("1");
      await expect(
        page.getByLabel("Mole fraction Toluene", { exact: true }),
      ).toHaveValue("0");
      await page.keyboard.press("Escape");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openTemplates(page);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("templates-mobile.png") });
});

test("creating a folder project preserves the template chemicals, model and separation", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.route("**/api/chemicals**", (route) => route.abort());
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .locator("summary")
    .filter({ hasText: "Flash separations" })
    .click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: /Raoult’s law separation/ })
    .click();
  const create = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await submitNewProject(page);
  await expect(create).not.toBeVisible();
  const expected = templates
    .find((template) => template.id === "solution")!
    .create();
  const saved = JSON.parse(await folderText(page, expected.name)).workspace
    .project;
  expect(saved.thermo).toEqual(expected.thermo);
  expect(saved.units).toEqual(expected.units);
  expect(simulate(saved).converged).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
});

test("direct template links use the real-chemical recipe", async ({ page }) => {
  await page.goto("/?example=fractionation");
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Three-stage benzene–toluene recovery",
  );
  await expect(
    page.getByRole("button", { name: "Project components", exact: true }),
  ).toHaveAttribute("title", "Components");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page
    .getByRole("group", { name: "Result data", exact: true })
    .getByRole("button", { name: "Composition", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", {
      name: "Benzene mole fraction",
      exact: true,
    }),
  ).toBeVisible();
});

test("published reactor recipes reload offline with source limits on a narrow screen", async ({
  page,
}, info) => {
  await page.route("**/api/chemicals**", (route) => route.abort());
  await page.goto("/?example=pbr-water-gas-shift");
  await expect(page.locator(".project-heading h1")).toHaveText(
    "Water–gas shift PBR",
  );
  await page.reload();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "R-101" })
    .dblclick();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Kinetics source and limits", { exact: true }).click();
  const source = page.locator(".kinetics-source");
  await expect(source).toContainText("Choi & Stenger");
  expect(await source.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await source.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("pbr-source-mobile.png") });
});
