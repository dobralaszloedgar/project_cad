import { expect, test } from "./test";
import { catalogFixture } from "./catalog-fixture";
import { settingsFor } from "../helpers/catalog";
import { loadProject } from "./project-fixture";

test("double-click saves once and survives reload without applying the picker", async ({
  page,
}) => {
  await catalogFixture(page);
  await page.goto("/workspace?example=solution");
  let finish!: () => void;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const selections: string[][] = [];
  await page.route("**/api/chemicals/selection", async (route) => {
    const input = route.request().postDataJSON();
    selections.push(input.ids);
    await hold;
    await route.fulfill({ json: settingsFor(input.ids, input.model).catalog });
  });
  const open = page.getByRole("button", {
    name: "Project components",
    exact: true,
  });
  await open.click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await picker.getByRole("searchbox").fill("water");
  const cell = picker.getByRole("cell", { name: "water H2O", exact: true });
  await cell.dblclick();
  await expect(picker.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await cell.dblclick();
  expect(selections).toEqual([["71-43-2", "108-88-3", "7732-18-5"]]);
  finish();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await open.click();
  await expect(picker.locator(".component-slot")).toHaveCount(3);
  await expect(
    picker.getByRole("button", { name: "Remove water from project" }),
  ).toHaveCount(1);
});

test("failed automatic saves keep the current selection and allow Add to retry", async ({
  page,
}) => {
  await catalogFixture(page);
  let attempts = 0;
  await page.route("**/api/chemicals/selection", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { error: "Could not save. Please retry." },
        })
      : route.fallback();
  });
  await page.goto("/workspace?example=solution");
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await picker.getByRole("searchbox").fill("water");
  const add = picker.getByRole("button", { name: "Add water to project" });
  await add.click();
  await expect(picker.getByRole("alert")).toHaveText(
    "Could not save. Please retry.",
  );
  await expect(picker.locator(".component-slot")).toHaveCount(2);
  await expect(add).toBeEnabled();
  await add.click();
  await expect(picker).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("the first catalog mixture saves as soon as both teaching species are replaced", async ({
  page,
}) => {
  await catalogFixture(page);
  await loadProject(page, {
    version: 1,
    name: "New mixture",
    units: [],
    edges: [],
  });
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await picker
    .getByRole("button", {
      name: "Remove Synthetic A from project",
      exact: true,
    })
    .click();
  await picker
    .getByRole("button", {
      name: "Remove Synthetic B from project",
      exact: true,
    })
    .click();
  await picker.getByRole("searchbox").fill("water");
  await picker.getByRole("button", { name: "Add water to project" }).click();
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Apply components" }),
  ).toBeDisabled();
  await picker.getByRole("searchbox").fill("ethanol");
  await picker
    .getByRole("cell", { name: "ethanol C2H6O", exact: true })
    .dblclick();
  await expect(picker).toHaveCount(0);
});

test("revisiting a chemical search reuses results and field changes fetch fresh matches", async ({
  page,
}) => {
  await catalogFixture(page);
  const searches: URLSearchParams[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/chemicals") searches.push(url.searchParams);
  });
  await page.goto("/workspace?example=solution");
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  const input = picker.getByRole("searchbox");
  for (const name of ["water", "ethanol", "water"]) {
    await input.fill(name);
    await expect(
      picker.getByRole("button", {
        name: `Add ${name} to project`,
        exact: true,
      }),
    ).toBeVisible();
  }
  expect(
    searches.filter((params) => params.get("query") === "water"),
  ).toHaveLength(1);
  await picker
    .getByRole("combobox", { name: "Search chemical field" })
    .selectOption("formula");
  await expect(picker.getByText("No chemicals found.")).toBeVisible();
  expect(
    searches.filter((params) => params.get("query") === "water"),
  ).toHaveLength(2);
});
