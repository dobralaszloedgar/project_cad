// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { STORY_END } from "../../src/components/landing/landing-playback";

test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
test.use({
  launchOptions: {
    args:
      process.platform === "win32"
        ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"]
        : [],
  },
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("project-cad.graphics-backend", "webgl"),
  );
});

test("the live process stays aligned through scrolling, fine camera movement and reversal", async ({
  page,
}, info) => {
  const errors: string[] = [],
    frames: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/landing\/.*\.(webp|json)/.test(request.url()))
      frames.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "02 Build" })
    .click();
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 45000,
  });
  await expect(canvas).toHaveAttribute("data-render-mode", "live-3d");
  let previousPose = "";
  for (const [index, progress] of [
    0.53, 0.59, 0.68, 0.82, 0.95, 1.21, 1.211, 1.4, 1.65, 0.68,
  ].entries()) {
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
    await expect(canvas).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
    if (progress === 1.211)
      await expect
        .poll(() => canvas.getAttribute("data-camera-pose"))
        .not.toBe(previousPose);
    const pose = (await canvas.getAttribute("data-camera-pose"))!;
    previousPose = pose;
    if (progress >= 0.87)
      expect(
        Number(await canvas.getAttribute("data-triangles")),
      ).toBeGreaterThan(100000);
    await page.screenshot({
      path: info.outputPath("transition-" + index + ".png"),
    });
  }
  expect(frames).toEqual([]);
  expect(errors).toEqual([]);
});
