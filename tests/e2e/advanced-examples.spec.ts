import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { plantTemplate } from "../../src/domain/plant-templates";
import { projectSchema } from "../../src/domain/schema";
import type { Workspace } from "../../src/lib/revisions";

const examples = [
  {
    id: "recycle-complex",
    name: "Recycle recovery plant",
    units: 32,
    streams: 32,
    column: "D-901",
    trays: 12,
  },
  {
    id: "parallel-complex",
    name: "Three-train processing plant",
    units: 39,
    streams: 40,
    column: "D-1001",
    trays: 12,
  },
  {
    id: "fractionation-complex",
    name: "Four-column recovery plant",
    units: 35,
    streams: 34,
    column: "D-1101",
    trays: 14,
  },
] as const;
const exampleUrl = (id: string, play = false) =>
  `/?example=${id}&view=3D${play ? "&play=1" : ""}`;

async function loaded(page: Page) {
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}
async function rendered(page: Page) {
  // Large procedural assemblies need time to compile on software WebGL.
  await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible({
    timeout: 45000,
  });
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}
async function exported(page: Page): Promise<Workspace> {
  await page.getByRole("button", { name: "Project menu" }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await fs.readFile((await download.path())!, "utf8"));
}
async function projects(page: Page) {
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
}

for (const example of examples) {
  const { id } = example;
  test(`${id} opens as an editable, transparent 3D plant and simulates`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const expected = projectSchema.parse(plantTemplate(id)!);
    expect(expected.units.length).toBe(example.units);
    await page.goto(exampleUrl(id));
    await loaded(page);
    await expect(page).toHaveTitle(/Project CAD/);
    await expect(page.locator(".project-heading h1")).toHaveText(example.name);
    await expect(
      page.getByRole("button", { name: "3D schematic", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await rendered(page);
    await expect(page.locator(".plant-label")).toHaveCount(
      expected.units.length,
    );
    await expect(page.locator(".plant-view")).toHaveAttribute(
      "data-stream-count",
      String(example.streams),
    );
    await expect(
      page.getByRole("switch", { name: "Transparent shell" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Play flow", exact: true }).click();
    await page.getByRole("combobox", { name: "Flow speed" }).selectOption("2");
    await expect(
      page.getByRole("button", { name: "Pause flow", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause flow", exact: true }).click();
    const column = expected.units.find((unit) => unit.id === example.column)!;
    await page
      .getByRole("combobox", { name: "Inspect 3D equipment" })
      .selectOption(column.id);
    await expect(page.getByLabel("Visible trays (3D)")).toHaveValue(
      String(example.trays),
    );
    await closeDialog(page);
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    await closeDialog(page);
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(
      expected.units.length,
    );
    const actual = await exported(page);
    expect(actual.project).toEqual(expected);
    expect(errors).toEqual([]);
  });
}

test("example links preserve the original project and reopen an edited example without duplicates", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/");
  await loaded(page);
  const original = await exported(page);
  // Opening the library flushes the original snapshot before following a link.
  await projects(page);
  await expect(page.locator(".project-card")).toHaveCount(1);
  const example = plantTemplate("recycle-complex")!;
  await page.goto(exampleUrl("recycle-complex"));
  await loaded(page);
  await rendered(page);
  const column = example.units.find((unit) => unit.kind === "Distillation")!;
  const editedCount = column.params.trayCount + 2;
  await page
    .getByRole("combobox", { name: "Inspect 3D equipment" })
    .selectOption(column.id);
  await page.getByLabel("Visible trays (3D)").fill(String(editedCount));
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await closeDialog(page);
  const edited = await exported(page);
  expect(
    edited.project.units.find((unit) => unit.id === column.id)!.params
      .trayCount,
  ).toBe(editedCount);
  await projects(page);
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: `Open ${original.project.name}`, exact: true })
    .click();
  expect(await exported(page)).toEqual(original);
  await page.reload();
  await loaded(page);
  await expect(page.locator(".project-heading h1")).toHaveText(
    original.project.name,
  );
  await page.goto(exampleUrl("recycle-complex"));
  await loaded(page);
  await rendered(page);
  expect(await exported(page)).toEqual(edited);
  await page.reload();
  await loaded(page);
  await rendered(page);
  expect(await exported(page)).toEqual(edited);
  await projects(page);
  await expect(page.locator(".project-card")).toHaveCount(2);
});

test("play links animate on request and respect reduced-motion preferences", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.goto(exampleUrl("parallel-complex", true));
  await loaded(page);
  await rendered(page);
  await expect(
    page.getByRole("button", { name: "Pause flow", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause flow", exact: true }).click();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const reduced = await context.newPage();
    await reduced.goto(
      new URL(exampleUrl("parallel-complex", true), page.url()).href,
    );
    await loaded(reduced);
    await rendered(reduced);
    await expect(
      reduced.getByRole("button", { name: "Play flow", exact: true }),
    ).toBeVisible();
    await reduced
      .getByRole("button", { name: "Play flow", exact: true })
      .click();
    await expect(
      reduced.getByRole("button", { name: "Pause flow", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
