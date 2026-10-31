import type { Page } from "@playwright/test";
import {
  referenceChemicals,
  referenceParameters,
  settingsFor,
} from "../helpers/catalog";
import { availableModels } from "../../src/domain/thermo/availability";
import { models, type ModelId } from "../../src/domain/thermo/registry";

export async function catalogFixture(page: Page) {
  if (process.env.CATALOG_LIVE_TESTS === "1") return;
  await page.route("**/api/chemicals/models", (route) =>
    route.fulfill({
      json: {
        release: "a".repeat(64),
        models: models.map((model) => ({
          ...model,
          count: referenceChemicals.filter((c) =>
            availableModels(c, referenceParameters).includes(model.id),
          ).length,
        })),
      },
    }),
  );
  await page.route("**/api/chemicals?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const query = (params.get("query") ?? "").toLowerCase();
    const model = params.get("model") as ModelId;
    const catalog = referenceChemicals.filter((c) =>
      availableModels(c, referenceParameters).includes(model),
    );
    const results = catalog
      .filter((c) => {
        const field = params.get("field");
        const value =
          field === "name"
            ? c.name
            : field === "cas"
              ? c.id
              : field === "formula"
                ? c.formula
                : `${c.id} ${c.name} ${c.formula}`;
        return (value ?? "").toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const offset = (Number(params.get("page") ?? 1) - 1) * 20;
    return route.fulfill({
      json: {
        release: "a".repeat(64),
        total: results.length,
        catalogTotal: catalog.length,
        results: results.slice(offset, offset + 20),
      },
    });
  });
  await page.route("**/api/chemicals/selection", (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: settingsFor(input.ids, input.model).catalog });
  });
}

export async function chooseComponent(
  page: Page,
  slot: "A" | "B",
  cas: string,
) {
  const remove = page.getByRole("button", {
    name: `Remove component ${slot}`,
    exact: true,
  });
  if (await remove.count()) await remove.click();
  await page
    .getByRole("searchbox", { name: "Search chemical database" })
    .fill(cas);
  await page
    .getByRole("table", { name: "Chemical search results" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: cas, exact: true }) })
    .getByRole("button", { name: /^Add .* to project$/ })
    .click();
}
