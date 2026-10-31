import { expect, test, type Locator, type Page } from "./test";
import { STORY_END } from "../../src/components/landing/landing-playback";

// Software WebGL compiles the same live equipment shaders as the application;
// Include the paced construction sequence and material rebuilds.
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
  let previous = await canvas.screenshot();
  await expect
    .poll(
      async () => {
        const next = await canvas.screenshot();
        const unchanged = next.equals(previous);
        previous = next;
        return unchanged;
      },
      { timeout: 20000, intervals: [600] },
    )
    .toBe(true);
  await canvas.page().waitForTimeout(600);
  expect((await canvas.screenshot()).equals(previous)).toBe(true);
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
    };
  });
  expect(view.top).toBe(0);
  expect(view.left).toBe(0);
  expect(view.right).toBe(view.width);
  expect(view.bottom).toBe(view.height);
}

test("the app-style assistant starts with a cursor, opens, types and sends", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let release!: () => void;
  const scripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/.*\.js(?:\?.*)?$/, async (route) => {
    await scripts;
    await route.continue();
  });
  await page.goto("/landing", { waitUntil: "commit" });
  try {
    await expect(page.locator("[data-landing-page]")).toHaveAttribute(
      "data-palette",
      "light",
    );
    await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
    await expect(
      page.getByRole("button", { name: "Open assistant demo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Design.", exact: true }),
    ).toBeVisible();
    const bubble = page.getByRole("button", {
      name: "Open assistant demo",
      exact: true,
    });
    await expect(bubble).toHaveCSS("width", "44px");
    await expect(bubble).toHaveCSS("height", "44px");
    await expect(page.locator("[data-design-chat]")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expectViewportFilled(page);
  } finally {
    release();
  }
  const chat = page.locator("[data-design-chat]");
  await expect(chat).toHaveAttribute("data-intro", "cursor");
  await expect(page.locator("[data-demo-cursor]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("cursor-desktop.png") });
  const approach = await page.evaluate(
    () =>
      new Promise<{ x: number; y: number; cursorX: number; cursorY: number }[]>(
        (resolve) => {
          const samples: {
            x: number;
            y: number;
            cursorX: number;
            cursorY: number;
          }[] = [];
          const sample = () => {
            const button = document.querySelector<HTMLButtonElement>(
              'button[aria-controls="landing-assistant"]',
            )!;
            if (button.getAttribute("aria-expanded") === "true") {
              resolve(samples);
              return;
            }
            const bubble = button.getBoundingClientRect();
            const cursor = document
              .querySelector("[data-demo-cursor] svg")!
              .getBoundingClientRect();
            samples.push({
              x: bubble.x,
              y: bubble.y,
              cursorX: cursor.x + 5,
              cursorY: cursor.y + 4,
            });
            requestAnimationFrame(sample);
          };
          sample();
        },
      ),
  );
  expect(approach.length).toBeGreaterThan(2);
  expect(
    Math.max(...approach.map((sample) => sample.x)) -
      Math.min(...approach.map((sample) => sample.x)),
  ).toBeLessThan(2);
  expect(
    Math.max(...approach.map((sample) => sample.y)) -
      Math.min(...approach.map((sample) => sample.y)),
  ).toBeLessThan(2);
  const click = approach.at(-1)!;
  expect(click.cursorX).toBeGreaterThan(click.x);
  expect(click.cursorX).toBeLessThan(click.x + 44);
  expect(click.cursorY).toBeGreaterThan(click.y);
  expect(click.cursorY).toBeLessThan(click.y + 44);
  await expect(chat).toHaveAttribute("data-expanded", "true", {
    timeout: 15000,
  });
  await expect(
    chat.getByRole("heading", { name: "How can I help you today?" }),
  ).toBeVisible();
  await expect(chat).toHaveAttribute("data-phase", "working", {
    timeout: 45000,
  });
  await expect(
    chat.getByRole("button", { name: "Build this flowsheet" }),
  ).toBeVisible({ timeout: 15000 });
  await chat.getByText("3 project tool calls").click();
  await expect(chat.getByText("propose actions · done")).toBeVisible();
  await page.screenshot({ path: info.outputPath("design-desktop.png") });
  await page
    .getByRole("button", { name: "Minimize assistant demo", exact: true })
    .click();
  await expect(chat).toHaveAttribute("data-expanded", "false");
  await page
    .getByRole("button", { name: "Open assistant demo", exact: true })
    .click();
  await expect(chat).toHaveAttribute("data-expanded", "true");
  await page.getByRole("button", { name: "Replay chat demo" }).click();
  await expect(chat).toHaveAttribute("data-phase", "typing");
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  const field = chat.getByRole("textbox", {
    name: "Example prompt",
    includeHidden: true,
  });
  const paused = await field.inputValue();
  const cursorPosition = await page
    .locator("[data-demo-cursor] > div")
    .last()
    .evaluate((element) => element.getAttribute("style"));
  await page.waitForTimeout(500);
  expect(await field.inputValue()).toBe(paused);
  expect(
    await page
      .locator("[data-demo-cursor] > div")
      .last()
      .evaluate((element) => element.getAttribute("style")),
  ).toBe(cursorPosition);
  await page
    .getByRole("button", { name: "Resume motion", exact: true })
    .click();
  await page.getByRole("button", { name: "Send example prompt" }).click();
  await expect(chat).toHaveAttribute("data-phase", "working", {
    timeout: 10000,
  });
  await chat.getByRole("button", { name: "Build this flowsheet" }).click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    "1",
    { timeout: 15000 },
  );
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
  await expect(page.getByRole("heading", { name: "Design." })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }),
  ).toHaveAttribute("href", "/onboarding");
  const canvas = page.locator("[data-shared-scene] canvas");
  // Model assembly and software WebGL warm-up are asynchronous; wait for the
  // actual readiness signal instead of the default five-second DOM deadline.
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  await expect(canvas).toBeVisible();
  const original = await canvas.elementHandle();
  await expect(canvas).toHaveAttribute("data-process-phase", "design");
  await page.mouse.move(768, 500);
  await page.mouse.wheel(0, -2000);
  await expectViewportFilled(page);
  await expect(page.locator("[data-design-chat]")).toBeVisible();

  // The prompt travels through the scene instead of teleporting to Build.
  await page
    .getByRole("button", { name: "Watch this process take shape" })
    .click();
  await expect(canvas).toHaveAttribute("data-process-phase", "blueprint", {
    timeout: 15000,
  });
  await expect(canvas).toHaveAttribute("data-unfold", "0.0000");
  // The workbench keeps constructing after scrolling stops; a fast scroll
  // must not collapse the whole equipment/stream sequence into one frame.
  const initialBuild = Number(await canvas.getAttribute("data-construction"));
  expect(initialBuild).toBeLessThan(0.9);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-construction")), {
      timeout: 25000,
    })
    .toBeGreaterThan(0.99);
  await expect(page.getByText("Simulation complete")).toBeVisible();
  const actualCanvas = page.locator(
    '[data-live-cad] [data-canvas-mode="presentation"]',
  );
  await expect(actualCanvas.locator(".react-flow__node")).toHaveCount(9);
  await expect(actualCanvas.locator(".react-flow__edge")).toHaveCount(9);
  await expect(actualCanvas.locator(".equipment-symbol")).toHaveCount(9);
  await expect(
    actualCanvas.locator(".react-flow__edge-path").first(),
  ).toHaveCSS("stroke", "rgb(180, 63, 68)");
  const streamColors = await actualCanvas
    .locator(".react-flow__edge-path")
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
  await expect(
    page.getByRole("switch", { name: "Transparent shells" }),
  ).toBeChecked();
  expect(errors).toEqual([]);
});

test("pause, shell controls and reverse navigation preserve the scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing");
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  await chapter(page, "03 Explore", 2);
  const original = await canvas.elementHandle();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-motion",
    "paused",
  );
  await expectStill(canvas);
  await page.getByRole("switch", { name: "Transparent shells" }).click();
  await expect(
    page.getByRole("switch", { name: "Transparent shells" }),
  ).not.toBeChecked();
  await page.getByRole("switch", { name: "Transparent shells" }).click();
  // Reversing the same timeline restores the exact planar state.
  await chapter(page, "02 Build", 1);
  await expect(canvas).toHaveAttribute("data-unfold", "0.0000");
  await chapter(page, "01 Design", 0);
  await expect(
    page.getByRole("button", { name: "Resume motion", exact: true }),
  ).toBeVisible();
  expect(
    await original!.evaluate(
      (element) =>
        element.isConnected &&
        element === document.querySelector("[data-shared-scene] canvas"),
    ),
  ).toBe(true);
});

test("mobile scenes fit, have readable controls and open the real equipment sandbox", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
      .getByRole("heading")
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
  await page.getByRole("link", { name: "Explore in 3D", exact: true }).click();
  await expect(page).toHaveURL(/\/sandbox\/equipment$/);
  await expect(
    page.getByText("Equipment sandbox", { exact: true }),
  ).toBeVisible();
});

test("a fast scroll accelerates every build step before revealing the plant", async ({
  page,
}) => {
  await page.goto("/landing");
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 60000,
  });
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
    page.getByRole("link", { name: "Explore in 3D", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
