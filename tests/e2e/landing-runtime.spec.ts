// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { STORY_END } from "../../src/components/landing/landing-playback";
test.use({
  launchOptions: {
    args:
      process.platform === "win32"
        ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"]
        : [],
  },
});

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  reducedMotion: "reduce",
});

test("prewarms shaders, respects the pixel budget and rests between gestures", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("project-cad.graphics-backend", "webgl");
    const probe = window as typeof window & { landingPrograms: number };
    probe.landingPrograms = 0;
    const create = WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram = function () {
      probe.landingPrograms++;
      return create.call(this);
    };
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "03 Explore" })
    .click();
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 45000,
  });
  await expect(canvas).toHaveAttribute("data-render-mode", "live-3d");
  const programs = () =>
    page.evaluate(
      () =>
        (window as typeof window & { landingPrograms: number }).landingPrograms,
    );
  const prepared = await programs();
  expect(prepared).toBeGreaterThan(2);
  for (const progress of [0.68, 0.95, 1.2, 1.4, 1.65, 0.95]) {
    await page.evaluate(
      ({ progress, end }) => {
        const root = document.querySelector<HTMLElement>(
          "[data-landing-page]",
        )!;
        window.scrollTo(
          0,
          ((root.offsetHeight - innerHeight) * progress) / end,
        );
      },
      { progress, end: STORY_END },
    );
    await expect
      .poll(async () =>
        Math.abs(
          Number(await canvas.getAttribute("data-story-progress")) - progress,
        ),
      )
      .toBeLessThan(0.001);
    expect(await programs()).toBe(prepared);
  }
  const still = await canvas.getAttribute("data-draw-count");
  await page.waitForTimeout(600);
  expect(await canvas.getAttribute("data-draw-count")).toBe(still);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 2048, height: 1100 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() => canvas.evaluate((element) => element.clientWidth))
      .toBe(viewport.width);
    const size = await canvas.evaluate((element) => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    expect(size.width * size.height).toBeLessThanOrEqual(2_500_000);
  }
  expect(errors).toEqual([]);
});

test("without graphics the vector diagram and chapter navigation stay usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("project-cad.graphics-backend", "webgl");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type !== "2d") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "03 Explore" })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-launch-state",
    "unavailable",
  );
  await expect(
    page.getByRole("img", { name: "Connected process diagram" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "01 Design" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Design", exact: true }),
  ).toBeVisible();
});
