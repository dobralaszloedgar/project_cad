// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

test.use({ reducedMotion: "reduce" });
test("normal landing playback works with WebGL unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl") || type === "webgpu")
        throw new Error("Graphics deliberately disabled");
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "03 Explore" })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    "2",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  const position = await video.evaluate(
    (v) => (v as HTMLVideoElement).currentTime,
  );
  await page.waitForTimeout(250);
  expect(await video.evaluate((v) => (v as HTMLVideoElement).currentTime)).toBe(
    position,
  );
});

test("unavailable media leaves real equipment symbols and working navigation", async ({
  page,
}) => {
  await page.route("**/landing-media/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("[data-scene-fallback]")).toBeVisible();
  await expect(
    page.locator("[data-scene-fallback] .equipment-symbol"),
  ).toHaveCount(9);
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "03 Explore" })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    "2",
  );
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }),
  ).toBeVisible();
});
