import { expect, test, type Page } from "./test";
import { templates, templateSpecification } from "../../src/domain/templates";
import { componentNames, mixtureName } from "../../src/domain/thermo/catalog";
import { simulate } from "../../src/domain/solver";
import { folderText, installFolderPicker } from "./folder-fixture";

async function openTemplates(page: Page) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Start from a template" });
}

test("every offered template loads its specifications and runs without a chemical lookup", async ({
  page,
}, info) => {
  test.setTimeout(120000);
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
    await expect(dialog.locator(".template-list")).not.toContainText("reactor");
    const option = dialog.locator(".template-option").filter({
      has: page.getByText(template.name, { exact: true }),
    });
    await expect(option).toContainText(templateSpecification(project));
    if (template.id === "solution")
      await page.screenshot({ path: info.outputPath("templates-desktop.png") });
    await option.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".project-heading h1")).toHaveText(project.name);
    await expect(
      page.getByRole("button", { name: "Project components", exact: true }),
    ).toHaveAttribute("title", `Components: ${mixtureName(project.thermo!)}`);
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    const names = componentNames(project.thermo!);
    await expect(
      page.getByRole("columnheader", {
        name: `${names[0]} fraction`,
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    if (template.id === "mixing" || template.id === "distillation") {
      await page
        .getByRole("button", { name: "Project components", exact: true })
        .click();
      const components = page.getByRole("dialog", {
        name: "Project components",
        exact: true,
      });
      await expect(
        components.getByLabel("Component A", { exact: true }),
      ).toContainText(names[0]);
      await expect(
        components.getByLabel("Component B", { exact: true }),
      ).toContainText(names[1]);
      await expect(
        components.locator(".selected-components .component-badge"),
      ).toHaveText("2 / 2");
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
      ).toHaveText("0");
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
    .getByRole("button", { name: /Raoult’s law separation/ })
    .click();
  const create = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await create
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await create
    .getByRole("button", { name: "Create project", exact: true })
    .click();
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
  ).toHaveAttribute("title", "Components: Benzene / toluene");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(
    page.getByRole("columnheader", { name: "Benzene fraction", exact: true }),
  ).toBeVisible();
});
