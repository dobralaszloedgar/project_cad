// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

test("the complete story plays continuously without replacing the video", async ({
  page,
}) => {
  await page.goto("/");
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  const original = await video.elementHandle();
  await page.evaluate(() => {
    (
      window as typeof window & { storyControl: { playAll: () => void } }
    ).storyControl.playAll();
    document.querySelector("video")!.playbackRate = 4;
  });
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).ended), {
      timeout: 20000,
    })
    .toBe(true);
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    "2",
  );
  expect(
    await original!.evaluate((v) => v === document.querySelector("video")),
  ).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(0);
});
