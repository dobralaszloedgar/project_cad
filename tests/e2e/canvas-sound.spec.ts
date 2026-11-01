import { expect, test, type Page, type Locator } from "./test";
import { loadProject } from "./project-fixture";
import { audioStartCount, observeAudio } from "./sound-fixture";
import { newUnit, type Project } from "../../src/domain/schema";
import {
  createSoundSamples,
  type SoundCue,
} from "../../src/lib/audio/sound-design";
import { SOUND_STORAGE_KEY } from "../../src/lib/audio/sound-preferences";

const fixture: Project = {
  version: 1,
  name: "Felt keys workspace",
  units: [
    newUnit("Feed", "F-101", 0, 100),
    newUnit("Heater", "H-101", 320, 100),
    newUnit("Product", "P-101", 640, 100),
  ],
  edges: [],
};

async function expectCue(page: Page, cue: SoundCue) {
  const actual = await page.evaluate(() => window.__soundProbe.starts.at(-1)!);
  const expected = createSoundSamples("felt", cue, actual.sampleRate);
  expect(actual.running).toBe(true);
  expect(actual.frames).toBe(expected.length);
  expect(actual.checksum).toBeCloseTo(
    expected.reduce(
      (sum, sample, index) => sum + sample * ((index % 17) + 1),
      0,
    ),
    5,
  );
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

async function wire(page: Page, source: Locator, target: Locator) {
  await settleCanvas(page);
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

async function settleCanvas(page: Page) {
  let previous: string | null = null;
  let stable = 0;
  await expect
    .poll(
      async () => {
        const current = await page
          .locator(".react-flow__viewport")
          .getAttribute("style");
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      { intervals: [100], timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(3);
}

test.beforeEach(async ({ page }) => {
  // The shared workspace may be edited concurrently; freeze this loaded test page.
  await page.routeWebSocket(/\/_next\/webpack-hmr/, () => {});
  await observeAudio(page);
  await loadProject(page, fixture);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await settleCanvas(page);
  await expect(
    page.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("sound starts enabled; adding equipment uses Felt keys while movement stays silent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      errors.push(message.text());
  });
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SOUND_STORAGE_KEY),
  ).toBeNull();
  // Moving an existing object must not even initialize audio on a fresh visit.
  const initialHeater = page.locator('.react-flow__node[data-id="H-101"]');
  const initialBounds = (await initialHeater.boundingBox())!;
  await page.mouse.move(
    initialBounds.x + initialBounds.width / 2,
    initialBounds.y + initialBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    initialBounds.x + initialBounds.width / 2 + 60,
    initialBounds.y + initialBounds.height / 2 + 35,
    { steps: 12 },
  );
  await page.mouse.up();
  expect((await initialHeater.boundingBox())!.x).toBeGreaterThan(
    initialBounds.x + 20,
  );
  expect(await audioStartCount(page)).toBe(0);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Cooler", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect.poll(() => audioStartCount(page)).toBe(1);
  await expectCue(page, "place");
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(1);
  let before = await audioStartCount(page);
  await page.getByTitle("Add Mixer", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect.poll(() => audioStartCount(page)).toBe(before + 1);
  await expectCue(page, "place");

  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await page
    .getByTitle("Add Splitter", { exact: true })
    .dispatchEvent("dragstart", { dataTransfer: transfer });
  const canvas = page.getByLabel("2D process canvas", { exact: true });
  const bounds = (await canvas.boundingBox())!;
  before = await audioStartCount(page);
  await canvas.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: bounds.x + bounds.width * 0.65,
    clientY: bounds.y + bounds.height * 0.65,
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  expect(await audioStartCount(page)).toBe(before + 1);
  await page
    .getByRole("button", { name: "Close Equipment", exact: true })
    .click();
  await settleCanvas(page);
  const heater = page.locator('.react-flow__node[data-id="H-101"]');
  const node = (await heater.boundingBox())!;
  before = await audioStartCount(page);
  await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    node.x + node.width / 2 + 60,
    node.y + node.height / 2 + 35,
    { steps: 12 },
  );
  expect(await audioStartCount(page)).toBe(before);
  await page.mouse.up();
  expect((await heater.boundingBox())!.x).toBeGreaterThan(node.x + 20);
  expect(await audioStartCount(page)).toBe(before);
  before = await audioStartCount(page);
  await heater.click();
  expect(await audioStartCount(page)).toBe(before);
  await page.keyboard.press("Control+z");
  expect(await audioStartCount(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("only completed connections play; wire pickup, invalid wires, and deletion stay quiet", async ({
  page,
}) => {
  let before = await audioStartCount(page);
  await wire(
    page,
    page.getByLabel("F-101 outlet out", { exact: true }),
    page.getByLabel("H-101 inlet in", { exact: true }),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect.poll(() => audioStartCount(page)).toBe(before + 1);
  await expectCue(page, "connect");
  before = await audioStartCount(page);
  // The heater's own occupied inlet is an invalid destination.
  await wire(
    page,
    page.getByLabel("H-101 outlet out", { exact: true }),
    page.getByLabel("H-101 inlet in", { exact: true }),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await audioStartCount(page)).toBe(before);
  await wire(
    page,
    page.getByLabel("H-101 outlet out", { exact: true }),
    page.getByLabel("P-101 inlet in", { exact: true }),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  expect(await audioStartCount(page)).toBe(before + 1);
  await expectCue(page, "connect");
  const edgePoint = await page
    .locator(".react-flow__edge-interaction")
    .first()
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(edgePoint.x, edgePoint.y);
  before = await audioStartCount(page);
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await audioStartCount(page)).toBe(before);
  before = await audioStartCount(page);
  await page.keyboard.press("Delete");
  expect(await audioStartCount(page)).toBe(before);
  await page.locator('.react-flow__node[data-id="H-101"]').dblclick();
  await page
    .getByRole("button", { name: "Delete equipment", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  expect(await audioStartCount(page)).toBe(before);
});

test("saved volume and mute survive reload without playing on page load", async ({
  page,
}, info) => {
  const panel = await settings(page);
  await expect(panel.getByText("Felt keys", { exact: true })).toBeVisible();
  await expect(panel.locator("output")).toHaveText("100%");
  const toggle = panel.getByRole("switch", {
    name: "Canvas sounds",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await panel.getByRole("slider", { name: "Volume", exact: true }).fill("18");
  await expect(panel.locator("output")).toHaveText("18%");
  await panel
    .getByRole("button", { name: "Preview sound", exact: true })
    .click();
  await expectCue(page, "connect");
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.18,
  );
  await page.screenshot({
    path: info.outputPath("canvas-sound-desktop.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Cooler", { exact: true }).click();
  await expect.poll(() => audioStartCount(page)).toBe(1);
  await expectCue(page, "place");
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.18,
  );
  await page
    .getByRole("button", { name: "Mute canvas sounds", exact: true })
    .click();
  const before = await audioStartCount(page);
  await page.getByTitle("Add Mixer", { exact: true }).click();
  expect(await audioStartCount(page)).toBe(before);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable canvas sounds", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  const restoredPanel = await settings(page);
  await expect(restoredPanel.locator("output")).toHaveText("18%");
  await expect(
    restoredPanel.getByRole("button", { name: "Preview sound", exact: true }),
  ).toBeDisabled();
});

test("audio failure cannot block editing", async ({ page }) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Audio unavailable for test");
      }
    } as unknown as typeof AudioContext;
  });
  await page.reload();
  const panel = await settings(page);
  await panel
    .getByRole("button", { name: "Preview sound", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable canvas sounds", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("Couldn’t start audio");
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Cooler", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
});

test("a rejected placement makes no sound", async ({ page }) => {
  await loadProject(page, {
    ...fixture,
    units: Array.from({ length: 40 }, (_, index) =>
      newUnit(
        "Feed",
        `F-${index + 1}`,
        (index % 8) * 180,
        Math.floor(index / 8) * 180,
      ),
    ),
  });
  const before = await audioStartCount(page);
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Mixer", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(40);
  expect(await audioStartCount(page)).toBe(before);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
});

test("mobile controls work with keyboard and synchronize mute across tabs", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Mute canvas sounds", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Enable canvas sounds", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  expect(await audioStartCount(page)).toBe(0);
  const panel = await settings(page);
  await panel.getByRole("slider", { name: "Volume", exact: true }).fill("25");
  await panel
    .getByRole("slider", { name: "Volume", exact: true })
    .press("ArrowRight");
  await expect(panel.locator("output")).toHaveText("26%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("canvas-sound-mobile.png"),
    animations: "disabled",
  });
  const other = await context.newPage();
  await observeAudio(other);
  await other.goto("/workspace");
  await expect(
    other.getByRole("button", { name: "Mute canvas sounds", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mute canvas sounds", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Enable canvas sounds", exact: true }),
  ).toBeVisible();
  expect(await other.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  expect(
    await other.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SOUND_STORAGE_KEY,
    ),
  ).toMatchObject({ enabled: false, volume: 26 });
  await other.close();
});
