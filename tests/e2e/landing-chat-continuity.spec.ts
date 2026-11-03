// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`chat reveal and confirmation stay continuous at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?render=capture");
    await page.waitForFunction(() => "captureStory" in window);
    await page
      .locator('[data-example-assistant] [role="log"]')
      .waitFor({ state: "attached" });
    await page.evaluate(() => document.fonts.ready);
    const measurements = await page.evaluate(async () => {
      const api = (
        window as typeof window & {
          captureStory: {
            set: (value: {
              p: number;
              d: number;
              c: number;
              s: number;
            }) => void;
          };
        }
      ).captureStory;
      const samples: {
        time: number;
        scroll: number;
        height: number;
        text: string;
      }[] = [];
      for (let frame = 640; frame <= 960; frame++) {
        api.set({ p: 0, d: frame / 960, c: 0, s: 0 });
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const log = document.querySelector<HTMLElement>(
          '[data-example-assistant] [role="log"]',
        )!;
        const card = log.querySelector<HTMLElement>(
          '[aria-label="Review proposed changes"]',
        );
        const text =
          log.querySelector<HTMLElement>('[class*="response"]')?.textContent ??
          "";
        samples.push({
          time: frame / 960,
          scroll: log.scrollTop,
          height: card?.offsetHeight ?? 0,
          text,
        });
      }
      return samples;
    });
    const steps = measurements
      .slice(1)
      .map((point, index) =>
        Math.abs(point.scroll - measurements[index].scroll),
      );
    // At 120 FPS a smooth reveal should move a few pixels, never a whole page.
    expect(Math.max(...steps)).toBeLessThan(14);
    expect(measurements.at(-1)!.scroll).toBeGreaterThan(200);
    const before = measurements.find((point) => point.time >= 0.948)!;
    const after = measurements.find((point) => point.time >= 0.952)!;
    expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(before.scroll - after.scroll)).toBeLessThanOrEqual(1);
    expect(before.text).toBe(after.text);
    expect(before.text).toContain("connect the recycle loop");
    await expect(
      page.locator('[data-example-assistant] [class*="proposal"] h3'),
    ).toHaveText("Changes applied");
  });
}
