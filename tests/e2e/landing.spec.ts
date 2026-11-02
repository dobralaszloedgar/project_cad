// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test, type Locator, type Page } from "./test";
import { STORY_END } from "../../src/components/landing/landing-playback";

// Software WebGL compiles the same live equipment shaders as the application;
// Include shader warmup on machines without a hardware GPU.
test.setTimeout(180000);

async function chapter(page: Page, name: string, index: number) {
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    String(index),
    { timeout: 15000 },
  );
  await expect
    .poll(
      () =>
        page
          .locator(`[data-scene="${["design", "build", "explore"][index]}"]`)
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.99);
}
async function expectStill(canvas: Locator) {
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-render-loop", "demand");
  // Canvas screenshots also include the DOM layered above it. Freeze the CSS
  // scroll cue so this comparison measures 3D motion rather than its arrow.
  const capture = () => canvas.screenshot({ animations: "disabled" });
  let previous = await capture();
  await expect
    .poll(
      async () => {
        const next = await capture();
        const unchanged = next.equals(previous);
        previous = next;
        return unchanged;
      },
      { timeout: 20000, intervals: [600] },
    )
    .toBe(true);
  await canvas.page().waitForTimeout(600);
  expect((await capture()).equals(previous)).toBe(true);
}
async function scrollTo(page: Page, progress: number) {
  await page.evaluate(
    ({ value, end }) => {
      const root = document.querySelector<HTMLElement>("[data-landing-page]")!;
      // Interrupt the chapter's scroll animation just as manual scrolling does.
      window.dispatchEvent(new WheelEvent("wheel"));
      window.scrollTo(0, ((root.offsetHeight - innerHeight) * value) / end);
    },
    { value: progress, end: STORY_END },
  );
}

async function expectViewportFilled(page: Page) {
  const view = await page.evaluate(() => {
    const rect = document
      .querySelector("[data-landing-stage]")!
      .getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      height: innerHeight,
      width: innerWidth,
      screens:
        document.querySelector<HTMLElement>("[data-landing-page]")!
          .offsetHeight / innerHeight,
    };
  });
  expect(view.top).toBe(0);
  expect(view.left).toBe(0);
  expect(view.right).toBe(view.width);
  expect(view.bottom).toBe(view.height);
  expect(view.screens).toBeCloseTo(3.8, 2);
}

test("the hardcoded assistant plays without mounting editor or assistant controls", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/assistant/")) requests.push(request.url());
  });
  await page.goto("/landing");
  await expect(
    page.getByRole("heading", { name: "Design", exact: true }),
  ).toBeVisible();
  await expectViewportFilled(page);
  const chat = page.locator("[data-design-chat]");
  await expect(page.locator("[data-demo-cursor]")).toBeVisible();
  await expect(page.locator("[data-demo-cursor] svg")).toHaveCSS(
    "filter",
    "none",
  );
  await expect(chat.locator("button, input, textarea, form")).toHaveCount(0);
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(chat).toHaveAttribute("data-phase", "complete", {
    timeout: 15000,
  });
  await expect(chat.locator("[data-demo-result]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("design-desktop.png") });
  await expect(
    page.getByRole("button", { name: /Pause motion|Step inside/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explore in 3D" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("switch", { name: "Transparent shells" }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("one 3D scene continuously unfolds the drawing and keeps operating equipment live", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/landing");
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }),
  ).toHaveAttribute("href", "/workspace?home=1");
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveCount(0);
  await page.mouse.move(768, 500);
  await page.mouse.wheel(0, -2000);
  await expectViewportFilled(page);
  await expect(page.locator("[data-design-chat]")).toBeVisible();

  // The prompt travels through the scene instead of teleporting to Build.
  await page
    .getByRole("button", { name: "Watch this process take shape" })
    .click();
  // 3D now warms up on entry to Build, while the live drawing stays usable.
  await expect(page.locator("[data-live-cad]")).toBeVisible({
    timeout: 15000,
  });
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  const original = await canvas.elementHandle();
  await expect(canvas).toHaveAttribute("data-process-phase", "blueprint", {
    timeout: 15000,
  });
  await expect(canvas).toHaveAttribute("data-unfold", "0.0000");
  // The workbench keeps constructing after scrolling stops; a fast scroll
  // must not collapse the whole equipment/stream sequence into one frame.
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-construction")), {
      timeout: 25000,
    })
    .toBeGreaterThan(0.99);
  await expect(page.getByText("Simulation complete")).toBeVisible();
  const actualCanvas = page.locator("[data-demo-worksheet]");
  await expect(actualCanvas.locator("[data-unit]")).toHaveCount(9);
  await expect(actualCanvas.locator("[data-stream]")).toHaveCount(9);
  await expect(actualCanvas.locator(".equipment-symbol")).toHaveCount(9);
  await expect(actualCanvas.locator("[data-stream] > path").first()).toHaveCSS(
    "stroke",
    "rgb(180, 63, 68)",
  );
  const streamColors = await actualCanvas
    .locator("[data-stream] > path")
    .evaluateAll((edges) => edges.map((edge) => getComputedStyle(edge).stroke));
  expect(new Set(streamColors).size).toBe(8);
  await expect(canvas).toHaveAttribute("data-simulation", "1.0000");
  await expect(page.locator("[data-live-cad]")).toHaveAttribute(
    "data-built-units",
    "9",
  );
  const bounds = await page.locator("[data-live-cad]").boundingBox();
  expect(bounds!.x).toBeGreaterThan(0);
  expect(bounds!.y).toBeGreaterThan(70);
  expect(bounds!.x + bounds!.width).toBeLessThan(1280);
  expect(bounds!.y + bounds!.height).toBeLessThan(704);
  await page.screenshot({ path: info.outputPath("build-desktop.png") });
  let previous = 0;
  for (const progress of [0.6, 0.7, 0.8]) {
    await scrollTo(page, progress);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-unfold")))
      .toBeGreaterThan(previous + 0.01);
    await page.waitForTimeout(500);
    const value = Number(await canvas.getAttribute("data-unfold"));
    expect(value).toBeGreaterThan(previous);
    expect(value).toBeLessThan(1);
    previous = value;
    expect(
      await original!.evaluate(
        (element) =>
          element.isConnected &&
          element === document.querySelector("[data-shared-scene] canvas"),
      ),
    ).toBe(true);
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  await chapter(page, "03 Explore", 2);
  await expect(canvas).toHaveAttribute("data-unfold", "1.0000");
  await page.screenshot({ path: info.outputPath("explore-desktop.png") });
  const overview = await canvas.getAttribute("data-camera-pose");
  await scrollTo(page, 1.25);
  await expect(canvas).toHaveAttribute("data-focus", "heater", {
    timeout: 15000,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-tour")), {
      timeout: 15000,
    })
    .toBeGreaterThan(0.3);
  expect(await canvas.getAttribute("data-camera-pose")).not.toBe(overview);
  await scrollTo(page, STORY_END);
  await expect(canvas).toHaveAttribute("data-focus", "column", {
    timeout: 20000,
  });
  await expect(canvas).toHaveAttribute("data-tour", "1.0000", {
    timeout: 20000,
  });
  await expectViewportFilled(page);
  await expect(canvas).toHaveAttribute("data-render-loop", "demand");
  await expectStill(canvas);
  expect(errors).toEqual([]);
});

test("reduced motion and reverse navigation preserve the scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing");
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveCount(0);
  await chapter(page, "03 Explore", 2);
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  const original = await canvas.elementHandle();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-motion",
    "paused",
  );
  await expectStill(canvas);
  // Reversing the same timeline restores the exact planar state.
  await chapter(page, "02 Build", 1);
  await expect(canvas).toHaveAttribute("data-unfold", "0.0000");
  await chapter(page, "01 Design", 0);
  await expect(
    page.getByRole("heading", { name: "Design", exact: true }),
  ).toBeVisible();
  expect(
    await original!.evaluate(
      (element) =>
        element.isConnected &&
        element === document.querySelector("[data-shared-scene] canvas"),
    ),
  ).toBe(true);
});

test("mobile scenes fit and rest between gestures without changing desktop layout", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Inspect stable layouts without tying this check to software GPU frame time.
  // The cursor and construction tests exercise the animated journey separately.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing");
  for (const [index, name] of [
    "01 Design",
    "02 Build",
    "03 Explore",
  ].entries()) {
    // This test inspects layout at each completed chapter. Fast scrolling and
    // the construction/simulation gate are exercised separately below.
    if (index === 2)
      await expect(page.locator("[data-build-activity]")).toHaveAttribute(
        "data-complete",
        "true",
        { timeout: 45000 },
      );
    await chapter(page, name, index);
    await expectViewportFilled(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const heading = await page
      .locator(`[data-scene="${["design", "build", "explore"][index]}"]`)
      .getByRole("heading", {
        name: ["Design", "Build", "Explore"][index],
        exact: true,
      })
      .boundingBox();
    expect(heading!.x).toBeGreaterThanOrEqual(0);
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(390);
    expect(heading!.y + heading!.height).toBeLessThan(844);
    await page.screenshot({
      path: info.outputPath(`chapter-${index}-mobile.png`),
    });
  }
  await expect(page.locator("canvas")).toHaveCount(1);
  // Mobile browser chrome changes the visible height at either endpoint.
  for (const height of [740, 900, 844]) {
    await page.setViewportSize({ width: 390, height });
    await scrollTo(page, STORY_END);
    await page.mouse.wheel(0, 1800);
    await expectViewportFilled(page);
  }
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-render-loop", "demand");
  await expectStill(canvas);
  for (const [position, focus] of [
    [1.2, "heater"],
    [1.4, "reactor"],
    [1.65, "column"],
  ] as const) {
    await scrollTo(page, position);
    await expect(canvas).toHaveAttribute("data-focus", focus);
    await expect(page.locator("#explore-title").locator("..")).toHaveCSS(
      "bottom",
      "80px",
    );
    await page.screenshot({ path: info.outputPath(`${focus}-mobile.png`) });
  }
  // Phone-only caption positioning must not persist when returning to desktop.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#explore-title").locator("..")).not.toHaveCSS(
    "bottom",
    "80px",
  );
});

test("a fast scroll accelerates every build step before revealing the plant", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing");
  const canvas = page.locator("[data-shared-scene] canvas");
  await chapter(page, "02 Build", 1);
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 60000,
  });
  await chapter(page, "01 Design", 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await scrollTo(page, STORY_END);
  const samples = await page.evaluate(async () => {
    const samples: {
      progress: number;
      built: number;
      simulation: number;
      unfold: number;
    }[] = [];
    const canvas = document.querySelector("canvas")!;
    const start = performance.now();
    while (performance.now() - start < 45000) {
      await new Promise(requestAnimationFrame);
      const progress = Number(canvas.getAttribute("data-story-progress"));
      const built = Number(canvas.getAttribute("data-construction"));
      samples.push({
        progress,
        built,
        simulation: Number(canvas.getAttribute("data-simulation")),
        unfold: Number(canvas.getAttribute("data-unfold")),
      });
      if (progress > 0.94) break;
    }
    return samples;
  });
  expect(samples.some((s) => s.built > 0.1 && s.built < 0.9)).toBe(true);
  expect(
    samples.filter((s) => s.simulation < 0.999).every((s) => s.unfold === 0),
  ).toBe(true);
  expect(
    new Set(
      samples.filter((s) => s.built < 1).map((s) => Math.floor(s.built * 18)),
    ).size,
  ).toBe(18);
  expect(
    samples.some((s) => s.built === 1 && s.simulation > 0 && s.simulation < 1),
  ).toBe(true);
  expect(samples.at(-1)!.progress).toBeGreaterThan(0.94);
  await expect(canvas).toHaveAttribute("data-ready", "true");
});

test("reduced motion is still, remains navigable and handles a lost GPU", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing");
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-motion",
    "paused",
  );
  await chapter(page, "02 Build", 1);
  await chapter(page, "03 Explore", 2);
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toBeVisible();
  // Preparation can show consecutive blank frames before the real scene is
  // presented. Stillness is a property of the ready scene, not its placeholder.
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  await expectStill(canvas);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-motion",
    "playing",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-motion",
    "paused",
  );
  await canvas.evaluate((element) =>
    element.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(
    page.getByRole("link", { name: "Open the 3D sandbox" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
