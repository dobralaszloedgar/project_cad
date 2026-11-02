import { test, expect, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { settleCanvas } from "./canvas-fixture";
import { newUnit, type Project } from "../../src/domain/schema";
import { distillationExample } from "../../src/domain/examples";
import { defaultPackedBed } from "../../src/domain/reactions/schema";
import { defaultDistillation } from "../../src/domain/equipment/distillation-schema";

function fixture(): Project {
  return {
    version: 1,
    name: "Equipment status navigation",
    units: [
      newUnit("Feed", "F1", 80, 200),
      newUnit("Heater", "H1", 360, 200),
      newUnit("Product", "P1", 640, 200),
    ],
    edges: [
      {
        id: "s1",
        source: "F1",
        target: "H1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "s2",
        source: "H1",
        target: "P1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
}

async function hoverStatus(page: Page, id: string) {
  const dot = page.locator(
    `.react-flow__node[data-id="${id}"] .equipment-status-dot`,
  );
  const popup = page.getByRole("dialog", {
    name: `${id} equipment status`,
    exact: true,
  });
  // Initial auto-fit can move the anchor away from the pointer after a hover.
  await expect(async () => {
    await dot.hover();
    await expect(popup).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  return popup;
}

async function expectClearOfEquipment(page: Page, id: string) {
  const popup = page.getByRole("dialog", {
    name: `${id} equipment status`,
    exact: true,
  });
  await expect(async () => {
    const bounds = (await popup.boundingBox())!;
    const canvas = (await page.locator(".flow-wrapper").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(canvas.x);
    expect(bounds.y).toBeGreaterThanOrEqual(canvas.y + 70);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      canvas.x + canvas.width,
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      canvas.y + canvas.height,
    );
    for (const selector of [".equipment-selection-frame", ".unit-label"]) {
      const equipment = (await page
        .locator(`.react-flow__node[data-id="${id}"] ${selector}`)
        .boundingBox())!;
      expect(
        bounds.x >= equipment.x + equipment.width + 8 ||
          bounds.x + bounds.width + 8 <= equipment.x ||
          bounds.y >= equipment.y + equipment.height + 8 ||
          bounds.y + bounds.height + 8 <= equipment.y,
        `Status popup must leave ${selector} unobstructed`,
      ).toBe(true);
    }
  }).toPass();
}

test("missing connections hover, remain clickable and focus the exact port without moving equipment", async ({
  page,
}) => {
  const project = fixture();
  project.edges.pop();
  await loadProject(page, project);
  const node = page.locator('.react-flow__node[data-id="H1"]');
  const originalPosition = await node.evaluate(
    (element) => element.style.transform,
  );
  const dot = page.getByRole("button", {
    name: "H1: Missing setup",
    exact: true,
  });
  const popup = await hoverStatus(page, "H1");
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Connect outlet 1." }).hover();
  await expect(popup).toBeVisible();
  await page.screenshot({ path: "test-results/equipment-status-missing.png" });
  await popup.getByRole("button", { name: "Connect outlet 1." }).click();
  const editor = page.getByRole("dialog", { name: "Heater · H1", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-setup-port="out"]')).toBeFocused();
  await expect(editor.locator('[data-setup-port="out"]')).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(await node.evaluate((element) => element.style.transform)).toBe(
    originalPosition,
  );
  await editor
    .getByRole("button", { name: "Close Heater · H1", exact: true })
    .click();
  await dot.click();
  await expect(editor.locator('[data-setup-port="out"]')).toBeFocused();
});

test("runtime errors belong to one unit and link to the failing field; a correction updates its dot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = fixture();
  project.units[1].params.temperature = 280;
  await loadProject(page, project);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const dot = page.getByRole("button", {
    name: "H1: Simulation failed",
    exact: true,
  });
  await expect(dot).toBeVisible();
  await expect(
    page.getByRole("button", { name: "F1: Ready to simulate", exact: true }),
  ).toBeVisible();
  const popup = await hoverStatus(page, "H1");
  await popup
    .getByRole("button", { name: /heater target is below inlet temperature/i })
    .click();
  const editor = page.getByRole("dialog", { name: "Heater · H1", exact: true });
  const temperature = editor.getByRole("spinbutton", { name: /^Temperature/ });
  await expect(temperature).toBeFocused();
  await page.screenshot({
    path: "test-results/equipment-status-error-field.png",
  });
  await temperature.fill("460");
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Close Heater · H1", exact: true })
    .click();
  await expect(dot).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "H1: Simulated with warnings",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "H1: Simulated with warnings", exact: true })
    .click();
  await expect(
    editor.getByRole("tab", { name: "Results", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    editor.getByRole("region", { name: "Calculation warnings" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keyboard hover details dismiss and calculation status survives arranging", async ({
  page,
}) => {
  await loadProject(page, fixture());
  const dot = page.getByRole("button", {
    name: "H1: Ready to simulate",
    exact: true,
  });
  await dot.focus();
  const popup = page.getByRole("dialog", {
    name: "H1 equipment status",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "H1: Simulated with warnings",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "H1: Simulated with warnings",
      exact: true,
    }),
  ).toBeVisible();
});

test("missing reaction and column settings link to their setup controls", async ({
  page,
}) => {
  const project = fixture();
  project.units[1].kind = "PBR";
  project.units[1].params.packedBed = defaultPackedBed(["A", "B"]);
  await loadProject(page, project);
  await (
    await hoverStatus(page, "H1")
  )
    .getByRole("button", { name: "Add a reaction before calculating." })
    .click();
  await expect(
    page.getByRole("button", { name: "Add reaction", exact: true }),
  ).toBeFocused();
  project.units[1].kind = "Distillation";
  project.units[1].params.packedBed = undefined;
  project.units[1].params.distillation = {
    ...defaultDistillation(["A", "B"]),
    lightKey: undefined,
  };
  await loadProject(page, project);
  await (
    await hoverStatus(page, "H1")
  )
    .getByRole("button", {
      name: "Select a light key.",
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Light key", exact: true }),
  ).toBeFocused();
});

test("hover cards stay within the desktop canvas, keep their size at zoom and dismiss on leave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const project = fixture();
  project.edges.pop();
  await loadProject(page, project);
  const popup = await hoverStatus(page, "H1");
  const firstWidth = (await popup.boundingBox())!.width;
  await expectClearOfEquipment(page, "H1");
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  const zoomed = await hoverStatus(page, "H1");
  expect((await zoomed.boundingBox())!.width).toBe(firstWidth);
  await expectClearOfEquipment(page, "H1");
  await page.screenshot({ path: "test-results/equipment-status-laptop.png" });
  await page.getByRole("heading", { name: project.name, exact: true }).hover();
  await expect(zoomed).toHaveCount(0);
  const symbol = page.locator(
    '.react-flow__node[data-id="H1"] .equipment-symbol',
  );
  await symbol.hover();
  await expect(popup).toBeVisible();
});

test("status cards stay clear of a tall equipment highlight at canvas edges and remain interactive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const project = distillationExample();
  const column = project.units[1];
  column.params.trayCount = 40;
  column.params.distillation = {
    ...defaultDistillation(["A", "B"]),
    method: "mesh",
  };
  await loadProject(page, project);
  await settleCanvas(page);
  await page
    .locator('.react-flow__node[data-id="D-201"] .equipment-symbol')
    .click();
  await expect(
    page.locator('.react-flow__node[data-id="D-201"] .equipment-node'),
  ).toHaveClass(/selected/);
  const dot = page.locator(
    '.react-flow__node[data-id="D-201"] .equipment-status-dot',
  );
  await hoverStatus(page, "D-201");
  // Reproduce the tall column in the report, where neither vertical side fits.
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  const popup = await hoverStatus(page, "D-201");
  await expectClearOfEquipment(page, "D-201");
  expect(
    await popup.evaluate(
      (element) =>
        new Promise<boolean>((resolve) => {
          // Observe several complete enter/leave debounce cycles.
          setTimeout(() => resolve(element.isConnected), 1600);
        }),
    ),
  ).toBe(true);
  await expect(dot).toHaveAttribute("aria-expanded", "true");

  // Keep the card open while resizing and panning the column to each edge.
  await dot.focus();
  await page.setViewportSize({ width: 1000, height: 700 });
  await expectClearOfEquipment(page, "D-201");
  for (const side of ["left", "right"] as const) {
    const canvas = (await page.locator(".flow-wrapper").boundingBox())!;
    const label = (await page
      .locator('.react-flow__node[data-id="D-201"] .unit-label')
      .boundingBox())!;
    const targetX =
      side === "left"
        ? canvas.x + 24
        : canvas.x + canvas.width - label.width - 24;
    await page.locator(".react-flow__pane").dispatchEvent("wheel", {
      deltaX: (label.x - targetX) * 2,
      deltaY: (label.y - canvas.y - 84) * 2,
    });
    await expect
      .poll(
        async () =>
          (await page
            .locator('.react-flow__node[data-id="D-201"] .unit-label')
            .boundingBox())!.x,
      )
      .toBeCloseTo(targetX, 0);
    await expectClearOfEquipment(page, "D-201");
    const bounds = (await popup.boundingBox())!;
    const frame = (await page
      .locator('.react-flow__node[data-id="D-201"] .equipment-selection-frame')
      .boundingBox())!;
    if (side === "left")
      expect(bounds.x).toBeGreaterThan(frame.x + frame.width);
    else expect(bounds.x + bounds.width).toBeLessThan(frame.x);
  }
  await page.screenshot({
    path: "test-results/equipment-status-clear-highlight.png",
  });
  await dot.evaluate((element) => element.blur());

  // The equipment and its portaled card form one continuous hover region.
  await page
    .locator('.react-flow__node[data-id="D-201"] .equipment-symbol')
    .hover();
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Open setup", exact: true }).hover();
  await expect(popup).toBeVisible();
  await page.locator(".project-heading h1").hover();
  await expect(popup).toHaveCount(0);
});
