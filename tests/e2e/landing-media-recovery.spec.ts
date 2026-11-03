// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

for (const playing of [false, true]) {
  test(`native decode failure preserves ${playing ? "playing" : "scroll-controlled"} position`, async ({
    page,
  }) => {
    // Reuse the small web export to exercise recovery without requiring local
    // native masters in CI. Actual native decoding is checked by the renderer.
    await page.route("**/landing-media/desktop-120.mp4", async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace("-120.mp4", ".mp4"),
      });
      await route.fulfill({ response });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?quality=120");
    const video = page.locator("video");
    await expect(page.locator("[data-full-story-media]")).toHaveAttribute(
      "data-media-fps",
      "120",
    );
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await page
      .getByRole("navigation", { name: "Story chapters" })
      .getByRole("button", { name: "03 Explore" })
      .click();
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeGreaterThan(25);
    if (playing) {
      await page.evaluate(() => {
        (
          window as typeof window & { storyControl: { playAll: () => void } }
        ).storyControl.playAll();
        document.querySelector("video")!.currentTime = 25.2;
      });
      await expect
        .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
        .toBeGreaterThan(25.3);
    }
    const before = await video.evaluate((v) => {
      const media = v as HTMLVideoElement;
      const time = media.currentTime;
      media.dispatchEvent(new Event("error"));
      return time;
    });
    await expect(page.locator("[data-full-story-media]")).toHaveAttribute(
      "data-media-fps",
      "60",
    );
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeGreaterThanOrEqual(before - 0.05);
    expect(
      await video.evaluate((v) => (v as HTMLVideoElement).currentTime),
    ).toBeLessThan(before + 2);
    await expect(page.locator("[data-scene-fallback]")).toHaveCount(0);
    await expect(video).toHaveCount(1);
    if (playing) {
      await expect
        .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
        .toBeGreaterThan(before + 0.25);
    } else {
      expect(await video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(
        true,
      );
    }
    // Exhausted recovery stays bounded and retains the existing useful diagram.
    await video.evaluate((v) => v.dispatchEvent(new Event("error")));
    await expect(page.locator("[data-scene-fallback]")).toBeVisible();
  });
}

test("an unavailable native export recovers before the first frame", async ({
  page,
}) => {
  await page.route("**/landing-media/desktop-120.mp4", (route) =>
    route.abort(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?quality=120");
  await expect(page.locator("[data-full-story-media]")).toHaveAttribute(
    "data-media-fps",
    "60",
  );
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(8, 1);
  await expect(page.locator("[data-scene-fallback]")).toHaveCount(0);
});
