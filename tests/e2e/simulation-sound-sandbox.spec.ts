import { expect, test, type Page } from "./test";
import { audioStartCount, observeAudio } from "./sound-fixture";
import {
  completionSounds,
  createCompletionSamples,
  soundDetails,
  soundFamilies,
  type CompletionSound,
  type SimulationOutcome,
} from "../../src/lib/audio/completion-sounds";
import { SOUND_STORAGE_KEY } from "../../src/lib/audio/sound-preferences";
import { musicBoxVariants } from "../../src/lib/audio/music-box-variants";

async function expectCompletion(
  page: Page,
  style: CompletionSound,
  outcome: SimulationOutcome = "complete",
) {
  const actual = await page.evaluate(() => window.__soundProbe.starts.at(-1)!);
  const expected = createCompletionSamples(style, actual.sampleRate, outcome);
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

const previewStatus = (page: Page) =>
  page
    .getByRole("region", { name: "Hear it at the finish.", exact: true })
    .getByRole("status");

test.beforeEach(async ({ page }) => {
  await observeAudio(page);
  await page.goto("/sandbox/sound");
});

test("auditions every success and attention pair without changing app preferences", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      errors.push(message.text());
  });
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, enabled: true, volume: 18 }),
      ),
    SOUND_STORAGE_KEY,
  );
  await page.reload();
  await expect(page).toHaveTitle("Project CAD – Simulation sounds");
  await expect(page).toHaveURL(/\/sandbox\/sound$/);
  await expect(
    page.getByRole("heading", { name: "A sound for every outcome." }),
  ).toBeVisible();
  await expect(page.getByText("Preview only", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Classic", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("button[data-sound]")).toHaveCount(10);
  await page
    .getByRole("group", { name: "Sound family", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear chime", exact: true }).click();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  expect(await audioStartCount(page)).toBe(0);
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mute preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await audioStartCount(page)).toBe(0);
  await expect(page.locator("button[data-sound]")).toHaveCount(29);
  for (const outcome of ["complete", "attention"] as const) {
    await page
      .getByRole("group", { name: "Simulation outcome", exact: true })
      .getByRole("button", {
        name: outcome === "complete" ? "Complete" : "Needs attention",
        exact: true,
      })
      .click();
    for (const sound of completionSounds) {
      const details = soundDetails(sound.id, outcome);
      const count = await audioStartCount(page);
      await page
        .getByRole("button", { name: details.name, exact: true })
        .click();
      expect(await audioStartCount(page)).toBe(count + 1);
      await expectCompletion(page, sound.id, outcome);
      await expect(
        page.getByText(`Last heard · ${details.name}`, { exact: true }),
      ).toBeVisible();
    }
  }
  expect(await audioStartCount(page)).toBe(58);
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Felt finish", exact: true }).click();
  await page.getByRole("slider", { name: "Volume", exact: true }).fill("22");
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.22,
  );
  await page
    .getByRole("button", { name: "Preview Felt finish", exact: true })
    .click();
  await expectCompletion(page, "felt-finish");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SOUND_STORAGE_KEY,
    ),
  ).toEqual({ version: 1, enabled: true, volume: 18 });
  expect(errors).toEqual([]);
  await page
    .getByRole("heading", { name: "A sound for every outcome." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("simulation-sounds-desktop.png"),
    fullPage: false,
    animations: "disabled",
  });
});

test("an unsuccessful demo plays only its attention cue and resets cleanly when switching outcome", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "Needs attention", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Classic pause", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "Sound family", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  expect(await audioStartCount(page)).toBe(0);
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation running…");
  await expect(
    page.getByRole("button", { name: "Complete", exact: true }),
  ).toBeDisabled();
  expect(await audioStartCount(page)).toBe(0);
  await page.getByRole("button", { name: "Muted chime", exact: true }).click();
  expect(await audioStartCount(page)).toBe(0);
  await expect(previewStatus(page)).toContainText("Simulation needs attention");
  await expect(previewStatus(page)).toContainText(
    "Review the issues, then try again.",
  );
  expect(await audioStartCount(page)).toBe(1);
  await expectCompletion(page, "clear-chime", "attention");
  await page.screenshot({
    path: info.outputPath("simulation-needs-attention.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(previewStatus(page)).toContainText("Ready when you are");
  await expect(
    page.getByRole("button", { name: "Clear chime", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await audioStartCount(page)).toBe(1);
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation complete");
  await expectCompletion(page, "clear-chime", "complete");
  expect(await audioStartCount(page)).toBe(2);
});

test("family filters expose the full collection with stable two-digit numbers", async ({
  page,
}) => {
  const filters = page.getByRole("group", {
    name: "Sound family",
    exact: true,
  });
  for (const family of soundFamilies) {
    await filters.getByRole("button", { name: family, exact: true }).click();
    await expect(page.locator("button[data-sound]")).toHaveCount(
      completionSounds.filter((sound) => sound.family === family).length,
    );
    for (const sound of completionSounds.filter(
      (candidate) => candidate.family === family,
    )) {
      await expect(
        page.getByRole("button", { name: sound.name, exact: true }),
      ).toBeVisible();
    }
  }
  await filters.getByRole("button", { name: "Tactile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Wooden close", exact: true }),
  ).toContainText("29");
  await page
    .getByRole("button", { name: "Needs attention", exact: true })
    .click();
  await expect(page.locator("button[data-sound]")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Wooden double", exact: true }),
  ).toContainText("29");
  await filters.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator("button[data-sound]")).toHaveCount(29);
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
});

test("a demo plays once on completion and uses the latest choice without an early cue", async ({
  page,
}, info) => {
  await page
    .getByRole("group", { name: "Sound family", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation running…");
  expect(await audioStartCount(page)).toBe(0);
  await expect(
    page.getByRole("button", { name: "Preview Classic", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Warm resolve", exact: true }).click();
  expect(await audioStartCount(page)).toBe(0);
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(1);
  await expectCompletion(page, "warm-resolve");
  await page.screenshot({
    path: info.outputPath("simulation-sounds-finished.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Run preview again", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation running…");
  expect(await audioStartCount(page)).toBe(1);
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(2);
});

test("cancelled and muted runs stay quiet; enabling does not replay a finished run", async ({
  page,
}) => {
  await page.clock.install();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await page.clock.fastForward(2500);
  await expect(previewStatus(page)).toContainText("Ready when you are");
  expect(await audioStartCount(page)).toBe(0);
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "Mute preview", exact: true }).click();
  await page.clock.fastForward(2500);
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(0);
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  expect(await audioStartCount(page)).toBe(0);
  await page.getByRole("slider", { name: "Volume", exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Run preview again", exact: true })
    .click();
  await page.clock.fastForward(2500);
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable sound", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
});

test("mobile music-box controls, reduced motion, and a complete preview fit without overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("button[data-sound]")).toHaveCount(10);
  await page.getByRole("button", { name: "Enable sound", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Little star", exact: true }).focus();
  await page.keyboard.press("Space");
  await expectCompletion(page, "music-box-little-star");
  await page
    .getByRole("slider", { name: "Volume", exact: true })
    .press("ArrowRight");
  await expect(page.locator("output")).toHaveText("36%");
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("simulation-sounds-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
});

test("opens with ten music boxes and pairs the same version with a two-note failed run", async ({
  page,
}, info) => {
  const family = page.getByRole("group", { name: "Sound family", exact: true });
  await expect(
    family.getByRole("button", { name: "Music box", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Choose a music box", exact: true }),
  ).toBeVisible();
  await expect(page.locator("button[data-sound]")).toHaveCount(10);
  await expect(page.getByText("10 versions", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Needs attention", exact: true })
    .click();
  for (const variant of musicBoxVariants) {
    const card = page.getByRole("button", {
      name: variant.attention.name,
      exact: true,
    });
    await expect(card.getByText("2 notes", { exact: true })).toBeVisible();
    await expect(
      card.getByText(String(variant.variant).padStart(2, "0"), { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Moonlight pause", exact: true })
    .click();
  await expectCompletion(page, "music-box-moonlight", "attention");
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation needs attention");
  expect(await audioStartCount(page)).toBe(2);
  await expectCompletion(page, "music-box-moonlight", "attention");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("music-box-failure.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Moonlight", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await audioStartCount(page)).toBe(2);
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(3);
  await expectCompletion(page, "music-box-moonlight", "complete");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("music-box-success.png"),
    animations: "disabled",
  });
});

test("audio errors preserve the visual demo", async ({ page }) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Unavailable for test");
      }
    } as unknown as typeof AudioContext;
  });
  await page.reload();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Audio is unavailable",
  );
  await page
    .getByRole("button", { name: "Preview a simulation", exact: true })
    .click();
  await expect(previewStatus(page)).toContainText("Simulation complete");
  expect(await audioStartCount(page)).toBe(0);
});
