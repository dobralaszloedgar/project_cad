import { expect, test } from "./test";

test.beforeEach(() => {
  test.skip(
    process.env.CATALOG_LIVE_TESTS !== "1",
    "Requires the configured Supabase catalog.",
  );
});

test("catalog ranks exact matches, filters identifiers, and pages the full sorted result", async ({
  request,
}) => {
  const search = async (params: Record<string, string>) => {
    const response = await request.get("/api/chemicals", { params });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<{
      total: number;
      catalogTotal: number;
      results: { id: string; name: string; formula: string }[];
    }>;
  };
  const exact = await search({ query: "methane", sort: "relevance" });
  expect(exact.results[0].id).toBe("74-82-8");
  expect(exact.total).toBeGreaterThan(20);
  const cas = await search({ query: "64-17-5", field: "cas" });
  expect(cas.results.map((c) => c.id)).toEqual(["64-17-5"]);
  const formula = await search({ query: "H₂O", field: "formula" });
  expect(formula.results[0].id).toBe("7732-18-5");
  const wrongField = await search({ query: "64-17-5", field: "name" });
  expect(wrongField.total).toBe(0);
  const first = await search({ sort: "name", page: "1" });
  const second = await search({ sort: "name", page: "2" });
  expect(first.results).toHaveLength(20);
  expect(second.results).toHaveLength(20);
  expect(first.total).toBe(first.catalogTotal);
  expect(second.total).toBe(first.total);
  const combined = [...first.results, ...second.results];
  expect(new Set(combined.map((c) => c.id)).size).toBe(40);
  const names = combined.map((c) => c.name.toLowerCase());
  expect(names).toEqual([...names].sort());
  const empty = await search({ query: "%_'", field: "all" });
  expect(empty.total).toBe(0);
  const invalid: Record<string, string>[] = [
    { sort: "invalid" },
    { field: "invalid" },
    { page: "0" },
    { page: "1.5" },
  ];
  for (const params of invalid) {
    expect((await request.get("/api/chemicals", { params })).status()).toBe(
      400,
    );
  }
});

test("component search controls reset pages, remember ordering and work on mobile", async ({
  page,
}, info) => {
  await page.goto("/workspace");
  const components = page.getByRole("button", {
    name: "Project components",
    exact: true,
  });
  await expect(components).toBeVisible();
  await components.click();
  const dialog = page.getByRole("dialog", {
    name: "Project components",
    exact: true,
  });
  const search = dialog.getByRole("searchbox", {
    name: "Search chemical database",
  });
  const sort = dialog.getByRole("combobox", { name: "Sort chemicals" });
  const field = dialog.getByRole("combobox", { name: "Search chemical field" });
  const next = dialog.getByRole("button", { name: "Next chemical page" });
  await expect(sort).toHaveValue("relevance");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(dialog.locator(".chemical-pagination")).toContainText("21–40");
  await sort.selectOption("name");
  await expect(dialog.locator(".chemical-pagination")).toContainText("1–20");
  await field.selectOption("cas");
  await search.fill("64-17-5");
  await expect(dialog.getByRole("table")).toContainText("ethanol");
  await expect(dialog.locator(".chemical-pagination")).toContainText(
    "1–1 of 1 results",
  );
  await expect(next).toBeDisabled();
  await dialog.getByRole("button", { name: "Clear chemical search" }).click();
  await expect(search).toBeEmpty();
  await expect(next).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("components-search-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await components.click();
  await expect(sort).toHaveValue("name");
  await expect(field).toHaveValue("all");
  await sort.selectOption("relevance");
  await search.fill("methane");
  await expect(dialog.locator("tbody tr").first()).toContainText("74-82-8");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sort).toBeVisible();
  await expect(field).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("components-search-mobile.png"),
  });
});
