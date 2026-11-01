import { expect, test, type Page } from "./test";
import { loadProject } from "./project-fixture";
import { audioStartCount, observeAudio } from "./sound-fixture";
import { newUnit, type Project } from "../../src/domain/schema";
import {
  createCompletionSamples,
  type SimulationOutcome,
} from "../../src/lib/audio/completion-sounds";

function fixture(): Project {
  return {
    version: 1,
    name: "Moonlight simulation feedback",
    units: [
      newUnit("Feed", "F1", 0, 100),
      newUnit("Heater", "H1", 320, 100),
      newUnit("Product", "P1", 640, 100),
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

async function expectSoundOn(page: Page) {
  await expect(
    page.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  return page.getByRole("complementary", { name: "Settings", exact: true });
}

async function expectMoonlight(
  page: Page,
  outcome: SimulationOutcome,
  count: number,
) {
  await expect.poll(() => audioStartCount(page)).toBe(count);
  const actual = await page.evaluate(() => window.__soundProbe.starts.at(-1)!);
  // Compare the actual browser buffer to the exact approved sandbox version.
  const approved = createCompletionSamples(
    "music-box-moonlight",
    actual.sampleRate,
    outcome,
  );
  expect(actual.running).toBe(true);
  expect(actual.frames).toBe(approved.length);
  expect(actual.peak).toBeGreaterThan(0);
  expect(actual.checksum).toBeCloseTo(
    approved.reduce(
      (sum, sample, index) => sum + sample * ((index % 17) + 1),
      0,
    ),
    5,
  );
}

test.beforeEach(async ({ page }) => {
  await observeAudio(page);
  await loadProject(page, fixture());
});

test("successful button and keyboard runs play Moonlight exactly once, including results with warnings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      errors.push(message.text());
  });
  await expectSoundOn(page);
  expect(await audioStartCount(page)).toBe(0);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expectMoonlight(page, "complete", 1);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expectMoonlight(page, "complete", 2);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .focus();
  await page.keyboard.press("Control+Enter");
  await expectMoonlight(page, "complete", 3);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toBeVisible();
  expect(await audioStartCount(page)).toBe(0);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  expect(errors).toEqual([]);
});

test("missing setup plays the approved two-note failure cue once", async ({
  page,
}) => {
  const project = fixture();
  project.edges.pop();
  await loadProject(page, project);
  await expectSoundOn(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expectMoonlight(page, "attention", 1);
  await expect(page.getByRole("status")).toContainText(/connect/i);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expectMoonlight(page, "attention", 2);
});

test("a run that exhausts its recycle iterations uses failure rather than success", async ({
  page,
}) => {
  const project: Project = {
    version: 1,
    name: "Slow recycle sound check",
    units: [
      newUnit("Feed", "F1", 0, 100),
      newUnit("Mixer", "M1", 200, 100),
      newUnit("Distillation", "D1", 400, 100),
      newUnit("Product", "P1", 650, 100),
    ],
    edges: [
      {
        id: "feed",
        source: "F1",
        target: "M1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "inlet",
        source: "M1",
        target: "D1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "product",
        source: "D1",
        target: "P1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "recycle",
        source: "D1",
        target: "M1",
        sourcePort: "out2",
        targetPort: "in2",
        color: "teal",
      },
    ],
  };
  // Returning 99% of the flow requires more than the normal 500 iterations.
  project.units[2].params.distillateFraction = 0.01;
  await loadProject(page, project);
  await expectSoundOn(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Recycle did not converge",
  );
  await expectMoonlight(page, "attention", 1);
});

test("a solver error plays failure; automatic edit recalculation stays quiet; the next run plays success", async ({
  page,
}) => {
  const project = fixture();
  project.units[1].params.temperature = 280;
  await loadProject(page, project);
  await expectSoundOn(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "H1: Simulation failed", exact: true }),
  ).toBeVisible();
  await expectMoonlight(page, "attention", 1);
  await page.locator('.react-flow__node[data-id="H1"]').dblclick();
  const editor = page.getByRole("dialog", { name: "Heater · H1", exact: true });
  await editor.getByRole("spinbutton", { name: /^Temperature/ }).fill("460");
  await editor
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Close Heater · H1", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "H1: Simulated with warnings",
      exact: true,
    }),
  ).toBeVisible();
  expect(await audioStartCount(page)).toBe(1);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expectMoonlight(page, "complete", 2);
});

test("Moonlight previews and real runs honor the shared volume, zero volume, mute, and saved preference", async ({
  page,
}, info) => {
  const panel = await settings(page);
  await expect(panel.getByText("Moonlight", { exact: true })).toBeVisible();
  const toggle = panel.getByRole("switch", {
    name: "Canvas sounds",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("button", { name: "Preview success", exact: true }),
  ).toBeEnabled();
  await toggle.click();
  await expect(
    panel.getByRole("button", { name: "Preview success", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Preview failure", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("switch", { name: "Canvas sounds", exact: true })
    .click();
  await panel.getByRole("slider", { name: "Volume", exact: true }).fill("18");
  await panel
    .getByRole("button", { name: "Preview success", exact: true })
    .click();
  await expectMoonlight(page, "complete", 1);
  await panel
    .getByRole("button", { name: "Preview failure", exact: true })
    .click();
  await expectMoonlight(page, "attention", 2);
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.18,
  );
  await page.screenshot({
    path: info.outputPath("moonlight-settings-desktop.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expectMoonlight(page, "complete", 1);
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.18,
  );
  const restored = await settings(page);
  await restored.getByRole("slider", { name: "Volume", exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  expect(await audioStartCount(page)).toBe(1);
  const again = await settings(page);
  await again.getByRole("slider", { name: "Volume", exact: true }).fill("18");
  await page
    .getByRole("button", { name: "Mute canvas sounds", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  expect(await audioStartCount(page)).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await settings(page);
  await expect(
    mobile.getByRole("button", { name: "Preview failure", exact: true }),
  ).toBeDisabled();
  await mobile
    .getByRole("button", { name: "Preview failure", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("moonlight-settings-mobile.png"),
    animations: "disabled",
  });
});

test("an audio failure cannot turn a successful simulation into an error", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Audio unavailable for test");
      }
    } as unknown as typeof AudioContext;
  });
  await page.reload();
  await expectSoundOn(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(
    page.getByRole("button", { name: "Enable canvas sounds", exact: true }),
  ).toBeVisible();
  const panel = await settings(page);
  await expect(panel.getByRole("alert")).toContainText("Couldn’t start audio");
});
