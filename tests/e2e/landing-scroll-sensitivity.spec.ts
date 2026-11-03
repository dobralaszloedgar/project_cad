// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`scroll advances the story 30% less at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const video = page.locator("video");
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    const distances = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("[data-landing-page]")!;
      const former = document.createElement("div");
      former.style.cssText =
        "position:absolute;pointer-events:none;width:0;height:620svh";
      document.body.append(former);
      const oldDistance = former.getBoundingClientRect().height - innerHeight;
      former.remove();
      const newDistance = root.offsetHeight - innerHeight;
      scrollTo(0, (newDistance * 1.1) / 1.65);
      return { oldDistance, newDistance };
    });
    expect(distances.oldDistance / distances.newDistance).toBeCloseTo(0.7, 3);
    const startTime = 25.2 + ((1.1 - 0.95) / 0.7) * 9;
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(startTime, 1);
    const startScroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeCloseTo(startScroll + 300, 0);
    const priorAdvance = (((300 / distances.oldDistance) * 1.65) / 0.7) * 9;
    const expectedTime = startTime + priorAdvance * 0.7;
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(expectedTime, 1);
    await expect(page.locator("[data-landing-page]")).toHaveAttribute(
      "data-chapter",
      "2",
    );
  });
}
