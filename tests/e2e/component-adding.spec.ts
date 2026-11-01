import { expect, test } from "./test";
import { catalogFixture } from "./catalog-fixture";
import { settingsFor } from "../helpers/catalog";
import { contentHash } from "../../src/domain/thermo/data";
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
  await expect(
    picker.getByText("Saving changes…", { exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Add water to project" }),
  ).toBeDisabled();
  await expect(
    picker.getByRole("button", { name: /^(Apply components|Cancel)$/ }),
  ).toHaveCount(0);
  await cell.dblclick();
  expect(selections).toEqual([["71-43-2", "108-88-3", "7732-18-5"]]);
  finish();
  await expect(picker.locator(".component-slot")).toHaveCount(3);
  await expect(picker).toBeVisible();
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
  await expect(picker.locator(".component-slot")).toHaveCount(3);
  await expect(picker).toBeVisible();
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
  ).toHaveCount(0);
  await expect(
    picker.getByText("Choose at least two chemicals to save the mixture."),
  ).toBeVisible();
  await picker.getByRole("searchbox").fill("ethanol");
  await picker
    .getByRole("cell", { name: "ethanol C2H6O", exact: true })
    .dblclick();
  await expect(picker.getByText("Changes save automatically.")).toBeVisible();
  await expect(picker.locator(".component-slot")).toHaveCount(2);
  await expect(picker).toBeVisible();
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

test("components can be added and removed repeatedly without closing or applying", async ({
  page,
}) => {
  await catalogFixture(page);
  await page.goto("/workspace?example=solution");
  const open = page.getByRole("button", {
    name: "Project components",
    exact: true,
  });
  await open.click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  for (const [index, name] of ["water", "ethanol"].entries()) {
    await picker.getByRole("searchbox").fill(name);
    await picker
      .getByRole("button", { name: `Add ${name} to project`, exact: true })
      .click();
    await expect(picker.locator(".component-slot")).toHaveCount(index + 3);
    await expect(picker).toBeVisible();
  }
  // Removal uses the verified saved records even if the database is offline.
  await page.route("**/api/chemicals/selection", (route) => route.abort());
  await picker
    .getByRole("button", { name: "Remove water from project", exact: true })
    .click();
  await expect(picker.locator(".component-slot")).toHaveCount(3);
  await expect(
    picker.getByRole("button", {
      name: "Remove ethanol from project",
      exact: true,
    }),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Close Project components" })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await open.click();
  await expect(picker.locator(".component-slot")).toHaveCount(3);
  await expect(
    picker.getByRole("button", {
      name: "Remove water from project",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    picker.getByRole("button", {
      name: "Remove ethanol from project",
      exact: true,
    }),
  ).toBeVisible();
});

test("opening and reopening during a preload shares one database request", async ({
  page,
}) => {
  await catalogFixture(page);
  let finish!: () => void;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let searches = 0;
  await page.route("**/api/chemicals?*", async (route) => {
    searches++;
    await hold;
    await route.fallback();
  });
  const started = page.waitForRequest("**/api/chemicals?*");
  await page.goto("/workspace?example=solution");
  await started;
  const open = page.getByRole("button", {
    name: "Project components",
    exact: true,
  });
  await open.click();
  const picker = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  await expect(picker.getByText("Searching…", { exact: true })).toBeVisible();
  await picker
    .getByRole("button", { name: "Close Project components" })
    .click();
  await open.click();
  finish();
  await expect(picker.getByRole("table")).toBeVisible();
  expect(searches).toBe(1);
  await picker
    .getByRole("button", { name: "Close Project components" })
    .click();
  await open.click();
  await expect(picker.getByRole("table")).toBeVisible();
  expect(searches).toBe(1);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1024, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`the picker fits ${viewport.width}×${viewport.height} with 40 selected components`, async ({
    page,
  }, info) => {
    await catalogFixture(page);
    await page.setViewportSize(viewport);
    const thermo = settingsFor(["71-43-2", "108-88-3"]);
    const chemicals = Array.from({ length: 40 }, (_, index) => ({
      ...thermo.catalog!.chemicals[0],
      id: `${10000 + index}-00-0`,
      name: `Component ${index + 1}`,
    }));
    thermo.catalog = {
      ...thermo.catalog!,
      chemicals,
      recordHashes: chemicals.map(contentHash),
    };
    await loadProject(page, {
      version: 1,
      name: "Many components",
      thermo,
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
    await expect(picker.locator(".component-slot")).toHaveCount(40);
    await expect(picker.getByRole("table")).toBeVisible();
    await expect(
      picker.getByRole("button", { name: /^(Apply components|Cancel)$/ }),
    ).toHaveCount(0);
    const bounds = (await picker.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    for (const element of [picker, picker.locator(".dialog-body")]) {
      expect(
        await element.evaluate(
          (el) =>
            el.scrollHeight <= el.clientHeight &&
            el.scrollWidth <= el.clientWidth,
        ),
      ).toBe(true);
    }
    await expect(
      picker.getByRole("button", { name: "Close Project components" }),
    ).toBeInViewport();
    await expect(
      picker.getByRole("button", { name: "Next chemical page" }),
    ).toBeInViewport();
    await picker.locator(".component-slots").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      picker.getByRole("button", {
        name: "Remove Component 40 from project",
        exact: true,
      }),
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath("components-fit.png") });
  });
}
