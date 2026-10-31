import { loadProject } from "./project-fixture";
import { expect, test, type Page } from "./test";
import { solutionExample } from "../../src/domain/examples";
import { simulate } from "../../src/domain/solver";
import { catalogSnapshotSchema } from "../../src/domain/thermo/data";
import { settingsFor } from "../helpers/catalog";
import { catalogFixture, chooseComponent } from "./catalog-fixture";
import type { ModelId } from "../../src/domain/thermo/registry";

const live = process.env.CATALOG_LIVE_TESTS === "1";
async function setup(page: Page) {
  await catalogFixture(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/Project CAD/);
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await loadProject(page, solutionExample());
}

test("catalog selection calculates, persists offline and preserves the 3D view", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.locator(".model-button").click();
  await page
    .getByRole("radio", { name: "Modified UNIFAC 2.0", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply model", exact: true }).click();
  await expect(page.locator(".model-button")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();

  await chooseComponent(page, "A", "71-43-2");
  await chooseComponent(page, "B", "108-88-3");
  await page.getByRole("button", { name: "Apply components" }).click();
  await expect(page.locator(".model-button")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(page.locator(".diagnostics")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Storage settings", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await pending;
  const fs = await import("node:fs/promises");
  const envelope = JSON.parse(
    await fs.readFile((await download.path())!, "utf8"),
  );
  const project = envelope.project ?? envelope;
  expect(project.thermo.mixture).toBe("catalog");
  const snapshot = catalogSnapshotSchema.parse(project.thermo.catalog);
  expect(snapshot.chemicals.map((c) => c.id)).toEqual(["71-43-2", "108-88-3"]);
  const response = await request.post("/api/simulate", { data: project });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual(simulate(project));
  await page.route("**/api/chemicals**", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".model-button")).toContainText(
    "Modified UNIFAC 2.0",
  );
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3D schematic", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "2D flowsheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  await expect(page.getByLabel("Component A", { exact: true })).toContainText(
    "benzene",
  );
  await page.screenshot({ path: "/tmp/project-cad-catalog-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("searchbox", { name: "Search chemical database" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply components" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Apply components" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/project-cad-catalog-mobile.png" });
  expect(errors).toEqual([]);
});

test("catalog service errors remain visible without replacing the current model", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/chemicals?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Chemical catalog is temporarily unavailable." },
    }),
  );
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove component A", exact: true })
    .click();

  await page
    .getByRole("searchbox", { name: "Search chemical database" })
    .fill("ethanol");
  await expect(
    page.locator(".chemical-browser").getByRole("alert"),
  ).toContainText("temporarily unavailable");
  await expect(
    page.getByRole("button", { name: "Apply components" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator(".model-button")).toContainText("Raoult");
});

test("live catalog filters model coverage and supplies all three calculation models", async ({
  request,
}) => {
  test.skip(
    !live,
    "Requires the configured catalog; enable CATALOG_LIVE_TESTS=1.",
  );
  for (const model of [
    "ideal-gas",
    "ideal-solution",
    "modified-unifac-2.0",
  ] as ModelId[]) {
    const search = await request.get(
      `/api/chemicals?query=71-43-2&model=${model}`,
    );
    expect(search.status()).toBe(200);
    const page = await search.json();
    const selection = await request.post("/api/chemicals/selection", {
      data: { release: page.release, ids: ["71-43-2", "108-88-3"], model },
    });
    expect(selection.status()).toBe(200);
    const project = solutionExample();
    project.thermo = {
      modelId: model,
      mixture: "catalog",
      extrapolate: false,
      catalog: catalogSnapshotSchema.parse(await selection.json()),
    };
    const response = await request.post("/api/simulate", { data: project });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(simulate(project));
  }
  const oxygen = await request.get(
    "/api/chemicals?query=7782-44-7&model=modified-unifac-2.0",
  );
  expect((await oxygen.json()).total).toBe(0);
  const invalid = await request.post("/api/chemicals/selection", {
    data: {
      release: "a".repeat(64),
      ids: ["71-43-2", "71-43-2"],
      model: "ideal-gas",
    },
  });
  expect(invalid.status()).toBe(422);
});

test("canceling a pending chemical selection does not apply it later", async ({
  page,
}) => {
  await setup(page);
  let releaseResponse!: () => void;
  const hold = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let responseFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    responseFinished = resolve;
  });
  await page.route("**/api/chemicals/selection", async (route) => {
    const input = route.request().postDataJSON();
    await hold;
    await route
      .fulfill({ json: settingsFor(input.ids, input.model).catalog })
      .catch(() => {});
    responseFinished();
  });
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  await chooseComponent(page, "A", "64-17-5");
  await chooseComponent(page, "B", "7732-18-5");
  const started = page.waitForRequest("**/api/chemicals/selection");
  await page.getByRole("button", { name: "Apply components" }).click();
  await started;
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  releaseResponse();
  await finished;
  await expect(page.locator(".model-button")).toContainText("Raoult");
  await page
    .getByRole("button", { name: "Project components", exact: true })
    .click();
  await expect(page.getByLabel("Component A", { exact: true })).toContainText(
    "71-43-2",
  );
});
